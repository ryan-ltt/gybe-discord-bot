import { SlashCommandBuilder, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { getUserStats } from '../data/users.js';

const TOP_N = 10;

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Most shows attended and listened to by gyberecordinghelper.com users');

function leaderboard(users, key) {
  const rows = users
    .filter(u => u[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, TOP_N);
  if (rows.length === 0) return 'Nobody yet';
  return rows.map((u, i) => `${i + 1}. ${escapeMarkdown(u.username)} — ${u[key]}`).join('\n');
}

export async function execute(interaction) {
  await interaction.deferReply();

  let users;
  try {
    users = await getUserStats();
  } catch (err) {
    console.error('Failed to load user stats:', err.message);
    await interaction.editReply('Could not load user stats from gyberecordinghelper.com right now.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle('Show leaderboards')
    .setURL('https://gyberecordinghelper.com/#users')
    .setDescription(`${users.length} public profiles`)
    .addFields(
      { name: 'Shows attended', value: leaderboard(users, 'attended'), inline: true },
      { name: 'Shows listened', value: leaderboard(users, 'listened'), inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
