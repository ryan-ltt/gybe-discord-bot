import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists, getBands } from '../data/setlists.js';
import { formatShow } from '../utils/songFinder.js';

export const data = new SlashCommandBuilder()
  .setName('random')
  .setDescription('Get a random show')
  .addBooleanOption(opt =>
    opt.setName('recordings_only')
      .setDescription('Only pick from shows with archive.org recordings')
      .setRequired(false)
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
  const recordingsOnly = interaction.options.getBoolean('recordings_only') || false;
  const band = interaction.options.getString('band') || 'gybe';

  const [shows, bands] = await Promise.all([getSetlists(band), getBands()]);
  const bandName = band !== 'gybe' ? bands.find(b => b.slug === band)?.name : null;
  let pool = shows.filter(s => s.songs && s.songs.length > 0);
  if (recordingsOnly) pool = pool.filter(s => s.recordings && s.recordings.length > 0);

  if (pool.length === 0) {
    await interaction.editReply('No shows found matching your criteria.');
    return;
  }

  const show = pool[Math.floor(Math.random() * pool.length)];
  const { setlist, recordings } = formatShow(show);
  const lines = [setlist];
  if (recordings) lines.push(recordings);
  if (show.note) lines.push(`*${show.note}*`);

  const description = lines.join('\n').trim().slice(0, 4096) || null;

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`${show.date}  ·  ${show.venue}`)
    .setDescription(description);
  if (bandName) embed.setAuthor({ name: bandName });

  await interaction.editReply({ embeds: [embed] });
}
