import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists } from '../data/setlists.js';

export const data = new SlashCommandBuilder()
  .setName('next')
  .setDescription('See the next upcoming show');

export async function execute(interaction) {
  await interaction.deferReply();

  const shows = await getSetlists();
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = shows
    .filter(s => s.date.replace(/[a-z]$/, '') >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (upcoming.length === 0) {
    await interaction.editReply('No upcoming shows found.');
    return;
  }

  const show = upcoming[0];
  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle('Next show')
    .setDescription(`**${show.date.replace(/[a-z]$/, '')}**  ·  ${show.venue}`);

  await interaction.editReply({ embeds: [embed] });
}
