/**
 * Scans the home server's message history for clueless reactions and writes
 * src/data/clueless-history.json, which the bot merges into its live stats
 * when the file's scannedAt changes. Run it on your own PC, then commit and
 * push the file:
 *
 *   npm run clueless-history            (messages since the last scan)
 *   npm run clueless-history -- --full  (every message, takes many hours)
 *
 * The incremental run only reads messages sent after the previous scannedAt,
 * then replaces that window in the existing file and keeps everything older.
 * Reactions added since then to older messages are not picked up here; the
 * live bot records those.
 *
 * It only uses the REST API (no gateway login), so it's safe to run while the
 * bot is online. discord.js waits out rate limits on its own.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { REST, Routes, ChannelType, SnowflakeUtil } from 'discord.js';
import { CLUELESS_EMOJI, HISTORY_FILE } from '../src/utils/clueless.js';

const guildId = process.env.HOME_GUILD_ID;
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const MESSAGE_CHANNELS = new Set([
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice,
]);
const THREAD_PARENTS = new Set([
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia,
]);

function readPrevious() {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return null;
  }
}

const previous = process.argv.includes('--full') ? null : readPrevious();
// Messages with ids above this were sent after the last scan started
const cutoffId = previous ? SnowflakeUtil.generate({ timestamp: Date.parse(previous.scannedAt) }) : 0n;
const cutoffMs = previous ? Date.parse(previous.scannedAt) : 0;

const messages = {};

async function archivedThreads(channel) {
  const threads = [];
  let before;
  for (;;) {
    const query = new URLSearchParams({ limit: '100', ...(before && { before }) });
    const page = await rest.get(Routes.channelThreads(channel.id, 'public'), { query });
    // Newest-archived first; a thread archived before the cutoff has no newer messages
    const recent = page.threads.filter(t => Date.parse(t.thread_metadata.archive_timestamp) >= cutoffMs);
    threads.push(...recent);
    if (!page.has_more || recent.length < page.threads.length || page.threads.length === 0) return threads;
    before = page.threads.at(-1).thread_metadata.archive_timestamp;
  }
}

async function reactors(channelId, messageId, emoji, type) {
  const ids = [];
  let after;
  for (;;) {
    const query = new URLSearchParams({ limit: '100', type: String(type), ...(after && { after }) });
    const users = await rest.get(Routes.channelMessageReaction(channelId, messageId, emoji), { query });
    ids.push(...users.filter(u => !u.bot).map(u => u.id));
    if (users.length < 100) return ids;
    after = users.at(-1).id;
  }
}

async function scan(channel, label) {
  if (channel.last_message_id && BigInt(channel.last_message_id) <= cutoffId) {
    console.log(`${label} #${channel.name}: no messages since last scan`);
    return;
  }
  console.log(`${label} #${channel.name}: scanning...`);
  let before;
  let read = 0;
  let found = 0;
  for (;;) {
    const query = new URLSearchParams({ limit: '100', ...(before && { before }) });
    const batch = await rest.get(Routes.channelMessages(channel.id), { query });
    // Newest first, so everything after the first old message is old too
    const recent = batch.filter(msg => BigInt(msg.id) > cutoffId);
    read += recent.length;
    if (recent.length === 100 && read % 1000 === 0) {
      console.log(`${label} #${channel.name}: ${read} messages read, ${found} clueless so far`);
    }
    for (const msg of recent) {
      const reaction = msg.reactions?.find(r => r.emoji.id === CLUELESS_EMOJI);
      if (!reaction || msg.author.bot) continue;
      const emoji = `${reaction.emoji.name}:${reaction.emoji.id}`;
      const ids = new Set(await reactors(channel.id, msg.id, emoji, 0));
      if (reaction.count_details?.burst > 0) {
        for (const id of await reactors(channel.id, msg.id, emoji, 1)) ids.add(id);
      }
      if (ids.size === 0) continue;
      messages[msg.id] = { c: channel.id, a: msg.author.id, r: [...ids] };
      found++;
    }
    if (batch.length < 100 || recent.length < batch.length) break;
    before = batch.at(-1).id;
  }
  console.log(`${label} #${channel.name}: done, ${read} messages read, ${found} clueless`);
}

async function main() {
  if (!guildId || !process.env.DISCORD_TOKEN) {
    throw new Error('Set DISCORD_TOKEN and HOME_GUILD_ID in .env');
  }
  console.log(previous
    ? `Scanning messages since the last scan (${previous.scannedAt}). Use --full to rescan everything.`
    : 'Scanning every message (full scan).');

  const scannedAt = new Date().toISOString();
  const channels = await rest.get(Routes.guildChannels(guildId));

  const targets = channels.filter(ch => MESSAGE_CHANNELS.has(ch.type));
  const { threads: active } = await rest.get(Routes.guildActiveThreads(guildId));
  targets.push(...active);
  for (const parent of channels.filter(ch => THREAD_PARENTS.has(ch.type))) {
    try {
      targets.push(...await archivedThreads(parent));
    } catch (err) {
      console.log(`Skipping archived threads in #${parent.name}: ${err.message}`);
    }
  }

  console.log(`Scanning ${targets.length} channels and threads...`);
  for (const [i, channel] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}]`;
    try {
      await scan(channel, label);
    } catch (err) {
      // Usually Missing Access: the bot can't read this channel
      console.log(`${label} #${channel.name}: skipped, ${err.message}`);
    }
  }

  // Keep older entries; the fresh scan is authoritative for the new window
  // (so reactions removed since then drop out)
  const merged = {};
  for (const [id, entry] of Object.entries(previous?.messages ?? {})) {
    if (BigInt(id) <= cutoffId) merged[id] = entry;
  }
  Object.assign(merged, messages);

  // scannedAt must stay the first key: the bot reads it without parsing the whole file
  writeFileSync(HISTORY_FILE, JSON.stringify({ scannedAt, messages: merged }));
  const total = Object.values(merged).reduce((sum, m) => sum + m.r.length, 0);
  console.log(`Found ${Object.keys(messages).length} clueless messages in this scan.`);
  console.log(`Done: ${total} clueless reactions on ${Object.keys(merged).length} messages, saved to ${HISTORY_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
