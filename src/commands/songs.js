import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getCanonicalSongs, getSetlists, normalizeSong } from '../data/setlists.js';

const PAGE_SIZE = 20;

export const data = new SlashCommandBuilder()
  .setName('songs')
  .setDescription('Browse all canonical song names')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Filter by substring (case-insensitive)').setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('sort')
      .setDescription('Sort order')
      .setRequired(false)
      .addChoices(
        { name: 'alphabetical', value: 'alpha' },
        { name: 'most played', value: 'most' },
        { name: 'least played', value: 'least' },
      )
  );

async function getSongCounts() {
  const shows = await getSetlists();
  const counts = {};
  for (const show of shows) {
    for (const raw of (show.songs || [])) {
      const canon = normalizeSong(raw);
      if (canon) counts[canon] = (counts[canon] || 0) + 1;
    }
  }
  return counts;
}

function sortSongs(songs, sort, counts) {
  if (sort === 'most') {
    return [...songs].sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));
  }
  if (sort === 'least') {
    return [...songs].sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || a.localeCompare(b));
  }
  return songs;
}

export async function execute(interaction) {
  await interaction.deferReply();
  const search = (interaction.options.getString('search') || '').toLowerCase().trim();
  const sort = interaction.options.getString('sort') || 'alpha';
  const allSongs = await getCanonicalSongs();
  const filtered = search ? allSongs.filter(s => s.includes(search)) : allSongs;

  if (filtered.length === 0) {
    await interaction.editReply(`No songs found matching **${search}**.`);
    return;
  }

  const counts = sort !== 'alpha' ? await getSongCounts() : null;
  const sorted = sortSongs(filtered, sort, counts);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const embed = buildEmbed(sorted, search, sort, counts, 0, totalPages);
  const components = buildComponents(0, totalPages, search, sort);
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleButton(interaction, parts) {
  // parts: ['songs', page, sort, ...search (may be empty)]
  const page = parseInt(parts[1]);
  const sort = parts[2] || 'alpha';
  const search = parts.slice(3).join('_');

  await interaction.deferUpdate();
  const allSongs = await getCanonicalSongs();
  const filtered = search ? allSongs.filter(s => s.includes(search)) : allSongs;

  const counts = sort !== 'alpha' ? await getSongCounts() : null;
  const sorted = sortSongs(filtered, sort, counts);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const embed = buildEmbed(sorted, search, sort, counts, page, totalPages);
  const components = buildComponents(page, totalPages, search, sort);
  await interaction.editReply({ embeds: [embed], components });
}

function formatLine(song, counts) {
  if (counts) {
    const count = counts[song] || 0;
    return `${song} — ${count}`;
  }
  return song;
}

function buildEmbed(songs, search, sort, counts, page, totalPages) {
  const slice = songs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sortLabel = sort === 'most' ? ' (most played)' : sort === 'least' ? ' (least played)' : '';
  const title = search
    ? `Songs matching "${search}" — ${songs.length} result${songs.length !== 1 ? 's' : ''}${sortLabel}`
    : `All songs — ${songs.length} total${sortLabel}`;

  const lines = slice.map(s => formatLine(s, counts));

  return new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(title)
    .setDescription(lines.join('\n') + (totalPages > 1 ? `\n\nPage ${page + 1} of ${totalPages}` : ''));
}

function buildComponents(page, totalPages, search, sort) {
  const rows = [];
  if (totalPages > 1) {
    rows.push(buildNavRow(page, totalPages, search, sort));
  }
  rows.push(buildSortRow(sort, search));
  return rows;
}

function buildNavRow(page, totalPages, search, sort) {
  const s = search || '';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`songs_${page - 1}_${sort}_${s}`)
      .setLabel('← Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`songs_${page + 1}_${sort}_${s}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

function buildSortRow(currentSort, search) {
  const s = search || '';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`songs_0_alpha_${s}`)
      .setLabel('A–Z')
      .setStyle(currentSort === 'alpha' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentSort === 'alpha'),
    new ButtonBuilder()
      .setCustomId(`songs_0_most_${s}`)
      .setLabel('Most played')
      .setStyle(currentSort === 'most' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentSort === 'most'),
    new ButtonBuilder()
      .setCustomId(`songs_0_least_${s}`)
      .setLabel('Least played')
      .setStyle(currentSort === 'least' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(currentSort === 'least'),
  );
}
