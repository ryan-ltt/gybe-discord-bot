/**
 * One-off scan of the home server's message history for clueless reactions.
 * Writes src/data/clueless-history.json, which the bot uses as its starting
 * point when it has no live stats file. Run it on your own PC, then commit
 * and push the file:
 *
 *   npm run clueless-history
 *
 * It only uses the REST API (no gateway login), so it's safe to run while the
 * bot is online. Reading every message in the server can take a while;
 * discord.js waits out rate limits on its own.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { REST, Routes, ChannelType } from 'discord.js';
import { CLUELESS_EMOJI, HISTORY_FILE } from '../src/utils/clueless.js';

const guildId = process.env.HOME_GUILD_ID;
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const MESSAGE_CHANNELS = new Set([
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice,
]);
const THREAD_PARENTS = new Set([
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia,
]);

const messages = {};

async function archivedThreads(channel) {
  const threads = [];
  let before;
  for (;;) {
    const query = new URLSearchParams({ limit: '100', ...(before && { before }) });
    const page = await rest.get(Routes.channelThreads(channel.id, 'public'), { query });
    threads.push(...page.threads);
    if (!page.has_more || page.threads.length === 0) return threads;
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

async function scan(channel) {
  let before;
  let read = 0;
  let found = 0;
  for (;;) {
    const query = new URLSearchParams({ limit: '100', ...(before && { before }) });
    const batch = await rest.get(Routes.channelMessages(channel.id), { query });
    read += batch.length;
    for (const msg of batch) {
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
    if (batch.length < 100) break;
    before = batch.at(-1).id;
  }
  console.log(`#${channel.name}: ${read} messages read, ${found} clueless`);
}

async function main() {
  if (!guildId || !process.env.DISCORD_TOKEN) {
    throw new Error('Set DISCORD_TOKEN and HOME_GUILD_ID in .env');
  }
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
  for (const channel of targets) {
    try {
      await scan(channel);
    } catch (err) {
      // Usually Missing Access: the bot can't read this channel
      console.log(`Skipping #${channel.name}: ${err.message}`);
    }
  }

  writeFileSync(HISTORY_FILE, JSON.stringify({ scannedAt, messages }));
  const total = Object.values(messages).reduce((sum, m) => sum + m.r.length, 0);
  console.log(`Done: ${total} clueless reactions on ${Object.keys(messages).length} messages, saved to ${HISTORY_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
