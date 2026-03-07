import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists } from '../data/setlists.js';
import { formatShow } from '../utils/songFinder.js';

export const data = new SlashCommandBuilder()
  .setName('random')
  .setDescription('Get a random show')
  .addBooleanOption(opt =>
    opt.setName('recordings_only')
      .setDescription('Only pick from shows with archive.org recordings')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  const recordingsOnly = interaction.options.getBoolean('recordings_only') || false;

  const shows = await getSetlists();
  let pool = recordingsOnly ? shows.filter(s => s.recordings && s.recordings.length > 0) : shows;

  if (pool.length === 0) {
    await interaction.editReply('No shows found matching your criteria.');
    return;
  }

  const show = pool[Math.floor(Math.random() * pool.length)];
  const { setlist, recordings } = formatShow(show);
  const lines = [setlist];
  if (recordings) lines.push(recordings);
  if (show.note) lines.push(`*${show.note}*`);

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`${show.date}  ·  ${show.venue}`)
    .setDescription(lines.join('\n').slice(0, 4096));

  await interaction.editReply({ embeds: [embed] });
}
