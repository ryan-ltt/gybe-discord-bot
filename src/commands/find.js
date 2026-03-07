import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getSetlists, getCanonicalSongs, normalizeSong } from '../data/setlists.js';
import { findShows, formatShow, paginateResults } from '../utils/songFinder.js';

export const data = new SlashCommandBuilder()
  .setName('find')
  .setDescription('Find shows containing selected songs')
  .addStringOption(opt =>
    opt.setName('songs')
      .setDescription('Songs to search for, comma-separated (e.g. "gathering storm, moya")')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Match mode (default: any)')
      .setRequired(false)
      .addChoices(
        { name: 'any — shows with at least one match, ranked by count', value: 'any' },
        { name: 'all — shows containing every selected song', value: 'all' },
      )
  )
  .addStringOption(opt =>
    opt.setName('order')
      .setDescription('Song order (default: unordered)')
      .setRequired(false)
      .addChoices(
        { name: 'unordered — songs can appear anywhere', value: 'unordered' },
        { name: 'ordered — songs appear in chosen order (gaps ok)', value: 'ordered' },
        { name: 'back-to-back — songs appear consecutively', value: 'back-to-back' },
      )
  )
  .addBooleanOption(opt =>
    opt.setName('recordings_only').setDescription('Only show shows with archive.org recordings').setRequired(false)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const fullValue = focused.value;

  // Autocomplete the last token in a comma-separated list
  const parts = fullValue.split(',');
  const prefix = parts.slice(0, -1).map(p => p.trim()).join(', ');
  const currentToken = parts[parts.length - 1].trim().toLowerCase();

  const allSongs = await getCanonicalSongs();
  const already = new Set(parts.slice(0, -1).map(p => normalizeSong(p.trim())).filter(Boolean));

  const filtered = allSongs
    .filter(s => !already.has(s) && (!currentToken || s.includes(currentToken)))
    .slice(0, 25);

  await interaction.respond(filtered.map(s => {
    const value = prefix ? `${prefix}, ${s}` : s;
    return { name: value.length > 100 ? s : value, value: value.length > 100 ? s : value };
  }));
}

export async function execute(interaction) {
  await interaction.deferReply();

  const raw = interaction.options.getString('songs');
  const songArgs = raw.split(',')
    .map(s => normalizeSong(s.trim()))
    .filter(Boolean);

  if (songArgs.length === 0) {
    await interaction.editReply('No recognised songs found. Use `/songs` to browse available song names.');
    return;
  }

  const mode = interaction.options.getString('mode') || 'any';
  const order = interaction.options.getString('order') || 'unordered';
  const recordingsOnly = interaction.options.getBoolean('recordings_only') || false;

  const shows = await getSetlists();
  const results = findShows(shows, songArgs, mode, order, recordingsOnly);

  if (results.length === 0) {
    await interaction.editReply(`No shows found matching **${songArgs.join(', ')}** (mode: ${mode}, order: ${order}).`);
    return;
  }

  const highlightSet = new Set(songArgs);
  const embed = buildEmbed(results, songArgs, highlightSet, mode, order, 0);
  const { totalPages } = paginateResults(results, 0);

  const components = totalPages > 1
    ? [buildRow(0, totalPages, songArgs, mode, order, recordingsOnly)]
    : [];

  await interaction.editReply({ embeds: [embed], components });
}

export async function handleButton(interaction, parts) {
  // parts: ['find', page, mode, order, recordingsOnly, ...songs]
  const page = parseInt(parts[1]);
  const mode = parts[2];
  const order = parts[3];
  const recordingsOnly = parts[4] === '1';
  const songArgs = parts.slice(5).join('_').split('|');
  const highlightSet = new Set(songArgs);

  await interaction.deferUpdate();
  const shows = await getSetlists();
  const results = findShows(shows, songArgs, mode, order, recordingsOnly);
  const { totalPages } = paginateResults(results, page);

  const embed = buildEmbed(results, songArgs, highlightSet, mode, order, page);
  const components = totalPages > 1
    ? [buildRow(page, totalPages, songArgs, mode, order, recordingsOnly)]
    : [];

  await interaction.editReply({ embeds: [embed], components });
}

function buildEmbed(results, songArgs, highlightSet, mode, order, page) {
  const { slice, totalPages, page: currentPage } = paginateResults(results, page);

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(`Song Finder — ${results.length} show${results.length !== 1 ? 's' : ''} found`)
    .setDescription(
      `Query: **${songArgs.join(', ')}**  ·  mode: \`${mode}\`  ·  order: \`${order}\`` +
      (totalPages > 1 ? `\nPage ${currentPage + 1} of ${totalPages}` : '')
    );

  for (const show of slice) {
    const { setlist, recordings } = formatShow(show, highlightSet);
    const scoreLabel = show.score != null ? ` (${show.score}/${songArgs.length})` : '';
    const fieldValue = [setlist, recordings, show.note].filter(Boolean).join('\n');
    embed.addFields({
      name: `${show.date}  ·  ${show.venue}${scoreLabel}`,
      value: fieldValue.slice(0, 1024) || '\u200b',
    });
  }

  return embed;
}

function buildRow(page, totalPages, songArgs, mode, order, recordingsOnly) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`find_${page - 1}_${mode}_${order}_${recordingsOnly ? 1 : 0}_${songArgs.join('|')}`)
      .setLabel('← Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`find_${page + 1}_${mode}_${order}_${recordingsOnly ? 1 : 0}_${songArgs.join('|')}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}
