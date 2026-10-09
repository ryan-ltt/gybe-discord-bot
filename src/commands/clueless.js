import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CLUELESS_EMOJI, MIN_RATE_MESSAGES, getStats, getProfile } from '../utils/clueless.js';

const TIMEZONE = 'America/Toronto';

export const data = new SlashCommandBuilder()
  .setName('clueless')
  .setDescription('Clueless reaction leaderboards')
  .addStringOption(opt =>
    opt.setName('period')
      .setDescription('Time period (default: all time)')
      .setRequired(false)
      .addChoices(
        { name: 'All time', value: 'all' },
        { name: 'This year', value: 'year' },
        { name: 'This month', value: 'month' },
      )
  )
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription("Show this person's clueless profile instead of the leaderboards")
      .setRequired(false)
  );

function periodLabel(period) {
  const now = new Date();
  if (period === 'month') return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TIMEZONE });
  if (period === 'year') return now.toLocaleDateString('en-US', { year: 'numeric', timeZone: TIMEZONE });
  return 'All time';
}

function leaderboard(rows) {
  if (rows.length === 0) return 'Nobody yet';
  return rows.map(([id, count], i) => `${i + 1}. <@${id}> — ${count}`).join('\n');
}

function rateBoard(rows) {
  if (rows.length === 0) return 'Message counts are still loading';
  return rows.map(([id, perHundred, sent], i) =>
    `${i + 1}. <@${id}> — ${perHundred.toFixed(1)} (${sent.toLocaleString('en-US')} msgs)`,
  ).join('\n');
}

// Stats are always the home server's, even when the command is used elsewhere
function messageLink(channelId, messageId) {
  return `https://discord.com/channels/${process.env.HOME_GUILD_ID}/${channelId}/${messageId}`;
}

// authorId is left out on a profile, where every message is the user's own
function messageList(rows) {
  return rows.map(({ messageId, channelId, authorId, count }, i) =>
    `${i + 1}. [${count} ×](${messageLink(channelId, messageId)}) in <#${channelId}>` +
      (authorId ? ` by <@${authorId}>` : ''),
  ).join('\n');
}

function profileEmbed(interaction, user, period, emoji) {
  const name = interaction.options.getMember('user')?.displayName ?? user.displayName;
  const p = getProfile(user.id, period);

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`${emoji} ${name}'s clueless profile — ${periodLabel(period)}`.trim())
    .setThumbnail(user.displayAvatarURL());

  if (p.received === 0 && p.given === 0) {
    return embed.setDescription('No clueless reactions in this period yet.');
  }

  const lines = [
    `**Received:** ${p.received} on ${p.cluedMessages} messages` +
      (p.rank ? ` (avg ${(p.received / p.cluedMessages).toFixed(2)}, rank #${p.rank})` : ''),
    `**Given:** ${p.given}` + (p.selfClues ? ` (${p.selfClues} on their own messages)` : ''),
  ];
  if (p.rate) {
    const rank = p.rate.rank ? `, rank #${p.rate.rank} of ${p.rate.of}` : '';
    lines.push(`**Clueless rate:** ${p.rate.perHundred.toFixed(1)} per 100 messages (${p.rate.sent.toLocaleString('en-US')} sent${rank})`);
  }
  if (p.bestStreak > 1) lines.push(`**Longest streak:** clued ${p.bestStreak} days in a row`);

  embed
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Biggest fans', value: leaderboard(p.fans), inline: true },
      { name: 'Favourite targets', value: leaderboard(p.targets), inline: true },
    );
  if (p.messages.length) {
    embed.addFields({ name: 'Most clueless messages', value: messageList(p.messages) });
  }
  return embed;
}

function statsEmbed(period, emoji) {
  const stats = getStats(period);

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`${emoji} Clueless stats — ${periodLabel(period)}`.trim());

  if (stats.total === 0) {
    return embed.setDescription('No clueless reactions in this period yet.');
  }

  embed
    .setDescription(`${stats.total} clueless reactions`)
    .addFields(
      { name: 'Most clueless (received)', value: leaderboard(stats.received), inline: true },
      { name: 'Clues given', value: leaderboard(stats.given), inline: true },
    );
  // Message counts are all time, so rates only fit the all-time board
  if (period === 'all') {
    embed.addFields({
      name: `Clueless rate (reacts per 100 messages, ${MIN_RATE_MESSAGES.toLocaleString('en-US')}+ sent)`,
      value: rateBoard(stats.rates),
    });
  }
  return embed.addFields({ name: 'Most clueless messages', value: messageList(stats.messages) });
}

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const period = interaction.options.getString('period') ?? 'all';
  const emoji = interaction.client.emojis.cache.get(CLUELESS_EMOJI)?.toString() ?? '';

  const embed = user
    ? profileEmbed(interaction, user, period, emoji)
    : statsEmbed(period, emoji);

  // Mentions inside an embed render as names without pinging anyone
  await interaction.reply({ embeds: [embed] });
}
