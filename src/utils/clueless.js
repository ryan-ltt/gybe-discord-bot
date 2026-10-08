import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SnowflakeUtil } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CLUELESS_EMOJI = '537217074745966593';

// Live stats go in DATA_DIR when it's set (e.g. a Railway volume), so they
// survive redeploys. Without it they reset to the history file on each deploy.
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../data');
const STATS_FILE = join(DATA_DIR, 'clueless.json');
// Written by scripts/clueless-history.js and committed; merged in once per scan
export const HISTORY_FILE = join(__dirname, '../data/clueless-history.json');

const SAVE_INTERVAL_MS = 5 * 60 * 1000;
const TIMEZONE = 'America/Toronto';

// messageId → { c: channelId, a: authorId, r: [reactor ids] }. A message id
// encodes when it was sent, so no timestamps are stored.
let messages = {};
// scannedAt of the history file last merged in, so a new scan is merged once
let historyScannedAt = null;
let dirty = false;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function loadClueless() {
  const live = readJson(STATS_FILE);
  messages = live?.messages ?? {};
  historyScannedAt = live?.historyScannedAt ?? null;

  const history = readJson(HISTORY_FILE);
  if (history && history.scannedAt !== historyScannedAt) {
    // Union with what's live: the scan can't know about reactions since it ran
    for (const [id, { c, a, r }] of Object.entries(history.messages)) {
      for (const reactor of r) addClue(id, c, a, reactor);
    }
    historyScannedAt = history.scannedAt;
    dirty = true;
    console.log(`[clueless] Merged history scanned ${history.scannedAt}`);
  }
  saveClueless();

  console.log(`[clueless] Loaded ${Object.keys(messages).length} clueless messages`);
  setInterval(saveClueless, SAVE_INTERVAL_MS).unref();
}

export function saveClueless() {
  if (!dirty) return;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATS_FILE, JSON.stringify({ historyScannedAt, messages }));
  dirty = false;
}

export function addClue(messageId, channelId, authorId, reactorId) {
  const entry = messages[messageId] ??= { c: channelId, a: authorId, r: [] };
  if (entry.r.includes(reactorId)) return;
  entry.r.push(reactorId);
  dirty = true;
}

export function removeClue(messageId, reactorId) {
  const entry = messages[messageId];
  if (!entry?.r.includes(reactorId)) return;
  entry.r = entry.r.filter(id => id !== reactorId);
  if (entry.r.length === 0) delete messages[messageId];
  dirty = true;
}

export function removeMessage(messageId) {
  if (!(messageId in messages)) return;
  delete messages[messageId];
  dirty = true;
}

/**
 * Applies a raw gateway packet. Raw packets arrive even for messages that
 * aren't cached, and MESSAGE_REACTION_ADD carries the message author's id,
 * so stats need neither the message cache nor partials.
 */
export async function handleRawPacket(packet, client) {
  const d = packet.d;
  if (!d || d.guild_id !== process.env.HOME_GUILD_ID) return;

  switch (packet.t) {
    case 'MESSAGE_REACTION_ADD': {
      if (d.emoji?.id !== CLUELESS_EMOJI || d.member?.user?.bot || d.user_id === client.user.id) return;
      let authorId = d.message_author_id;
      let authorIsBot = authorId === client.user.id || client.users.cache.get(authorId)?.bot;
      if (!authorId) {
        const msg = await client.rest.get(`/channels/${d.channel_id}/messages/${d.message_id}`);
        authorId = msg.author.id;
        authorIsBot = msg.author.bot;
      }
      if (!authorIsBot) addClue(d.message_id, d.channel_id, authorId, d.user_id);
      break;
    }
    case 'MESSAGE_REACTION_REMOVE':
      if (d.emoji?.id === CLUELESS_EMOJI) removeClue(d.message_id, d.user_id);
      break;
    case 'MESSAGE_REACTION_REMOVE_EMOJI':
      if (d.emoji?.id === CLUELESS_EMOJI) removeMessage(d.message_id);
      break;
    case 'MESSAGE_REACTION_REMOVE_ALL':
      removeMessage(d.message_id);
      break;
    case 'MESSAGE_DELETE':
      removeMessage(d.id);
      break;
    case 'MESSAGE_DELETE_BULK':
      for (const id of d.ids) removeMessage(id);
      break;
  }
}

function torontoDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

function topCounts(counts, limit) {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Leaderboards for 'month', 'year' or 'all'. Messages count toward the period
 * they were sent in.
 */
export function getStats(period, limit = 10) {
  const prefixLength = { month: 7, year: 4, all: 0 }[period];
  const current = torontoDate(Date.now()).slice(0, prefixLength);

  const received = new Map();
  const given = new Map();
  const top = [];
  let total = 0;

  for (const [messageId, { c, a, r }] of Object.entries(messages)) {
    const sent = SnowflakeUtil.timestampFrom(messageId);
    if (torontoDate(sent).slice(0, prefixLength) !== current) continue;
    total += r.length;
    received.set(a, (received.get(a) ?? 0) + r.length);
    for (const id of r) given.set(id, (given.get(id) ?? 0) + 1);
    top.push({ messageId, channelId: c, authorId: a, count: r.length });
  }

  return {
    total,
    received: topCounts(received, limit),
    given: topCounts(given, limit),
    messages: top.sort((x, y) => y.count - x.count).slice(0, 5),
  };
}
