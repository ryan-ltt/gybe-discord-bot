import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIVITY_FILE = join(__dirname, '../data/activity.json');

export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SAVE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKFILL_PAGES = 10; // up to 1000 messages per channel

// userId → timestamp (ms) of their most recent message. Only ids and times are
// kept, never message content, so this stays tiny even for a large server.
const lastSeen = new Map();
let dirty = false;

function prune() {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const [id, ts] of lastSeen) {
    if (ts < cutoff) lastSeen.delete(id);
  }
}

function load() {
  try {
    const data = JSON.parse(readFileSync(ACTIVITY_FILE, 'utf8'));
    for (const [id, ts] of Object.entries(data)) lastSeen.set(id, ts);
  } catch {
    // No file yet (first run, or wiped by a redeploy)
  }
  prune();
}

export function saveActivity() {
  if (!dirty) return;
  prune();
  writeFileSync(ACTIVITY_FILE, JSON.stringify(Object.fromEntries(lastSeen)));
  dirty = false;
}

export function recordActivity(userId, timestamp = Date.now()) {
  if ((lastSeen.get(userId) ?? 0) >= timestamp) return;
  lastSeen.set(userId, timestamp);
  dirty = true;
}

export function getActiveUserIds() {
  prune();
  return new Set(lastSeen.keys());
}

/**
 * Rebuild recent activity from channel history. Only used when there's nothing
 * on disk (e.g. after a Railway redeploy wipes the file). Messages are read for
 * their author and timestamp and then discarded.
 */
async function backfill(guild) {
  const me = guild.members.me ?? await guild.members.fetchMe();
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const channels = guild.channels.cache.filter(ch =>
    (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
    ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]),
  );

  for (const channel of channels.values()) {
    let before;
    try {
      for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
        const batch = await channel.messages.fetch({ limit: 100, before, cache: false });
        for (const msg of batch.values()) {
          if (msg.createdTimestamp >= cutoff && !msg.author.bot) {
            recordActivity(msg.author.id, msg.createdTimestamp);
          }
        }
        const oldest = batch.last();
        if (batch.size < 100 || !oldest || oldest.createdTimestamp < cutoff) break;
        before = oldest.id;
      }
    } catch (err) {
      console.error(`[activity] Backfill failed for #${channel.name}:`, err.message);
    }
  }
}

export async function initActivity(guild) {
  load();
  if (lastSeen.size === 0) {
    console.log('[activity] No saved activity, backfilling from channel history...');
    await backfill(guild);
    dirty = true;
    saveActivity();
  }
  console.log(`[activity] ${lastSeen.size} members active in the last 7 days`);

  setInterval(saveActivity, SAVE_INTERVAL_MS).unref();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      saveActivity();
      process.exit(0);
    });
  }
}
