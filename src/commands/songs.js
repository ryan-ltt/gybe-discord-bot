import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getCanonicalSongs } from '../data/setlists.js';

const PAGE_SIZE = 20;

export const data = new SlashCommandBuilder()
  .setName('songs')
  .setDescription('Browse all canonical song names')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Filter by substring (case-insensitive)').setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  const search = (interaction.options.getString('search') || '').toLowerCase().trim();
  const allSongs = await getCanonicalSongs();
  const filtered = search ? allSongs.filter(s => s.includes(search)) : allSongs;

  if (filtered.length === 0) {
    await interaction.editReply(`No songs found matching **${search}**.`);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const embed = buildEmbed(filtered, search, 0, totalPages);
  const components = totalPages > 1 ? [buildRow(0, totalPages, search)] : [];
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleButton(interaction, parts) {
  // parts: ['songs', page, ...search (may be empty)]
  const page = parseInt(parts[1]);
  const search = parts.slice(2).join('_');

  await interaction.deferUpdate();
  const allSongs = await getCanonicalSongs();
  const filtered = search ? allSongs.filter(s => s.includes(search)) : allSongs;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const embed = buildEmbed(filtered, search, page, totalPages);
  const components = totalPages > 1 ? [buildRow(page, totalPages, search)] : [];
  await interaction.editReply({ embeds: [embed], components });
}

function buildEmbed(songs, search, page, totalPages) {
  const slice = songs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const title = search
    ? `Songs matching "${search}" — ${songs.length} result${songs.length !== 1 ? 's' : ''}`
    : `All songs — ${songs.length} total`;

  return new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(title)
    .setDescription(slice.join('\n') + (totalPages > 1 ? `\n\nPage ${page + 1} of ${totalPages}` : ''));
}

function buildRow(page, totalPages, search) {
  const s = search || '';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`songs_${page - 1}_${s}`)
      .setLabel('← Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`songs_${page + 1}_${s}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}
