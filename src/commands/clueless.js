import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CLUELESS_EMOJI, getStats } from '../utils/clueless.js';

const TIMEZONE = 'America/Toronto';

export const data = new SlashCommandBuilder()
  .setName('clueless')
  .setDescription('Clueless reaction leaderboards')
  .addStringOption(opt =>
    opt.setName('period')
      .setDescription('Time period (default: this month)')
      .setRequired(false)
      .addChoices(
        { name: 'This month', value: 'month' },
        { name: 'This year', value: 'year' },
        { name: 'All time', value: 'all' },
      )
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

export async function execute(interaction) {
  const period = interaction.options.getString('period') ?? 'month';
  const stats = getStats(period);
  const emoji = interaction.client.emojis.cache.get(CLUELESS_EMOJI)?.toString() ?? '';

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`${emoji} Clueless stats — ${periodLabel(period)}`.trim());

  if (stats.total === 0) {
    embed.setDescription('No clueless reactions in this period yet.');
  } else {
    const topMessages = stats.messages.map(({ messageId, channelId, authorId, count }, i) =>
      `${i + 1}. [${count} × in <#${channelId}>](https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId}) by <@${authorId}>`,
    ).join('\n');

    embed
      .setDescription(`${stats.total} clueless reactions`)
      .addFields(
        { name: 'Most clueless (received)', value: leaderboard(stats.received), inline: true },
        { name: 'Clues given', value: leaderboard(stats.given), inline: true },
        { name: 'Most clueless messages', value: topMessages },
      );
  }

  // Mentions inside an embed render as names without pinging anyone
  await interaction.reply({ embeds: [embed] });
}
