import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists, getBands, getBestRecordings } from '../data/setlists.js';
import { formatShow } from '../utils/songFinder.js';

export const data = new SlashCommandBuilder()
  .setName('setlist')
  .setDescription('Look up a show by date')
  .addStringOption(opt =>
    opt.setName('date')
      .setDescription('Show date in YYYY-MM-DD format')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('band')
      .setDescription('Band (default: Godspeed You! Black Emperor)')
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const bands = await getBands();
  const choices = bands
    .filter(b => b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(b => ({ name: b.name, value: b.slug }));
  await interaction.respond(choices);
}

export async function execute(interaction) {
  await interaction.deferReply();
  const date = interaction.options.getString('date').trim();
  const band = interaction.options.getString('band') || 'gybe';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await interaction.editReply('Please provide a date in YYYY-MM-DD format (e.g. `1997-10-05`).');
    return;
  }

  const [shows, bands, bestRecordings] = await Promise.all([
    getSetlists(band),
    getBands(),
    getBestRecordings(),
  ]);
  const bandName = band !== 'gybe' ? bands.find(b => b.slug === band)?.name : null;
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
    const { setlist, recordings } = formatShow(show, null, bestRecordings[show.date]);
    const lines = [setlist];
    if (recordings) lines.push(`\n${recordings}`);
    if (show.note) lines.push(`*${show.note}*`);

    const embed = new EmbedBuilder()
      .setColor(0x4a90d9)
      .setTitle(`${show.date}  ·  ${show.venue}`)
      .setDescription(lines.join('\n').slice(0, 4096) || null);
    if (bandName) embed.setAuthor({ name: bandName });
    return embed;
  });

  await interaction.editReply({ embeds });
}
