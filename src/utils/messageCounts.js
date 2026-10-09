import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../data');
const COUNTS_FILE = join(DATA_DIR, 'message-counts.json');

const SAVE_INTERVAL_MS = 5 * 60 * 1000;
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Discord's shared author id for every deleted account; its count means nothing
const DELETED_USER = '456226577798135808';

// userId → { n: messages sent in the server, at: when n was last checked via
// search }. Between checks, n goes up by one for each message seen live.
let counts = {};
let dirty = false;
let refreshing = false;

export function loadMessageCounts() {
  try {
    counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
  } catch {
    counts = {};
  }
  setInterval(saveMessageCounts, SAVE_INTERVAL_MS).unref();
}

export function saveMessageCounts() {
  if (!dirty) return;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(COUNTS_FILE, JSON.stringify(counts));
  dirty = false;
}

/** Counts a live message. Users who haven't been searched yet are left for refresh. */
export function recordMessage(userId) {
  const entry = counts[userId];
  if (!entry) return;
  entry.n++;
  dirty = true;
}

export function getMessageCount(userId) {
  return counts[userId]?.n ?? null;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Total messages by one author, from Discord's message search
async function searchCount(client, guildId, userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await client.rest.get(`/guilds/${guildId}/messages/search`, {
      // Only the total is used; the default 25 matching messages cost ~30KB each call
      query: new URLSearchParams({ author_id: userId, limit: '1' }),
    });
    if (typeof result.total_results === 'number') return result.total_results;
    // Discord answers 202 with retry_after while it's still indexing
    await sleep((result.retry_after ?? 2) * 1000);
  }
  return null;
}

/**
 * Searches message totals for the given users who have never been checked or
 * were last checked over a week ago, which also corrects for deleted messages
 * and anything sent while the bot was offline. Search is heavily rate limited
 * (~2.5s per user, ~20 minutes for everyone), so run it in the background.
 */
export async function refreshMessageCounts(client, guildId, userIds) {
  if (refreshing) return;
  refreshing = true;
  const stale = [...userIds].filter(id =>
    id !== DELETED_USER && !(Date.now() - (counts[id]?.at ?? 0) < RECHECK_AFTER_MS),
  );
  let updated = 0;
  try {
    for (const userId of stale) {
      try {
        const n = await searchCount(client, guildId, userId);
        if (n === null) continue;
        counts[userId] = { n, at: Date.now() };
        dirty = true;
        updated++;
      } catch (err) {
        console.error(`[messageCounts] Search failed for ${userId}:`, err.message);
      }
    }
  } finally {
    refreshing = false;
    saveMessageCounts();
  }
  if (stale.length) console.log(`[messageCounts] Checked ${updated}/${stale.length} users`);
}
