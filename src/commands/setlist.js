import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists } from '../data/setlists.js';
import { formatShow } from '../utils/songFinder.js';

export const data = new SlashCommandBuilder()
  .setName('setlist')
  .setDescription('Look up a show by date')
  .addStringOption(opt =>
    opt.setName('date')
      .setDescription('Show date in YYYY-MM-DD format')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  const date = interaction.options.getString('date').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await interaction.editReply('Please provide a date in YYYY-MM-DD format (e.g. `1997-10-05`).');
    return;
  }

  const shows = await getSetlists();
  const matching = shows.filter(s => s.date === date || s.date.startsWith(date));

  if (matching.length === 0) {
    await interaction.editReply('No show played on this date.');
    return;
  }

  if (matching.every(s => !s.songs || s.songs.length === 0)) {
    await interaction.editReply('No setlist available for this show.');
    return;
  }

  const embeds = matching.map(show => {
    const { setlist, recordings } = formatShow(show);
    const lines = [setlist];
    if (recordings) lines.push(`\n${recordings}`);
    if (show.note) lines.push(`*${show.note}*`);

    return new EmbedBuilder()
      .setColor(0x4a90d9)
      .setTitle(`${show.date}  ·  ${show.venue}`)
      .setDescription(lines.join('\n').slice(0, 4096));
  });

  await interaction.editReply({ embeds });
}
