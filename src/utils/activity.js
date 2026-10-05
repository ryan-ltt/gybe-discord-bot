import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIVITY_FILE = join(__dirname, '../data/activity.json');

export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SAVE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKFILL_PAGES = 2; // up to 200 messages per channel

// Backfill skips these categories and channels: they're bot output, logs or
// announcements, so they cost memory to read without saying who's active.
// Names are compared loosely (case, emoji, punctuation and "&" vs "and" ignored).
const SKIP_CATEGORIES = ['administration', 'server', 'updates and archives', 'constellation news', 'invites'];
const SKIP_CHANNELS = ['bot-commands', 'last-fm'];

function normalizeName(name = '') {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const skipCategories = new Set(SKIP_CATEGORIES.map(normalizeName));
const skipChannels = new Set(SKIP_CHANNELS.map(normalizeName));

function isSkipped(channel) {
  return skipChannels.has(normalizeName(channel.name)) ||
    (channel.parent != null && skipCategories.has(normalizeName(channel.parent.name)));
}

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
  const readable = guild.channels.cache.filter(ch =>
    (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
    ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]),
  );
  const [skipped, channels] = readable.partition(isSkipped);
  if (skipped.size > 0) {
    console.log(`[activity] Skipping ${skipped.map(ch => `#${ch.name}`).join(', ')}`);
  }

  for (const channel of channels.values()) {
    let before;
    let read = 0;
    const authors = new Set();
    try {
      for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
        const batch = await channel.messages.fetch({ limit: 100, before, cache: false });
        read += batch.size;
        for (const msg of batch.values()) {
          if (msg.createdTimestamp >= cutoff && !msg.author.bot) {
            recordActivity(msg.author.id, msg.createdTimestamp);
            authors.add(msg.author.id);
          }
        }
        const oldest = batch.last();
        if (batch.size < 100 || !oldest || oldest.createdTimestamp < cutoff) break;
        before = oldest.id;
      }
      console.log(`[activity] #${channel.name}: ${read} messages read, ${authors.size} active members`);
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
