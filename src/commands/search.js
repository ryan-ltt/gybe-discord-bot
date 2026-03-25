import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSetlists, getCanonicalSongs, normalizeSong } from '../data/setlists.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('See the first and last time a song was played')
  .addStringOption(opt =>
    opt.setName('song')
      .setDescription('Song name')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const value = interaction.options.getFocused().toLowerCase();
  const allSongs = await getCanonicalSongs();
  const filtered = allSongs
    .filter(s => !value || s.includes(value))
    .slice(0, 25);
  await interaction.respond(filtered.map(s => ({ name: s, value: s })));
}

export async function execute(interaction) {
  await interaction.deferReply();

  const raw = interaction.options.getString('song');
  const canon = normalizeSong(raw.trim());

  if (!canon) {
    await interaction.editReply(`No recognised song found for **${raw}**. Use \`/songs\` to browse available song names.`);
    return;
  }

  const shows = await getSetlists();

  // Find all shows containing the song, sorted by date descending
  const matching = shows
    .filter(show => (show.songs || []).some(s => normalizeSong(s) === canon))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (matching.length === 0) {
    await interaction.editReply(`**${canon}** has not been found in any show setlists.`);
    return;
  }

  const last = matching[0];
  const first = matching[matching.length - 1];

  const formatShow = (show) => {
    const recLinks = (show.recordings || [])
      .map((r, i) => `[[${i + 1}]](${r.url})`)
      .join(' ');
    return `**${show.date}**  ·  ${show.venue}` +
      (recLinks ? `\nrecordings: ${recLinks}` : '') +
      (show.note ? `\n*${show.note}*` : '');
  };

  const embed = new EmbedBuilder()
    .setColor(0x4a90d9)
    .setTitle(canon)
    .addFields(
      { name: 'First played', value: formatShow(first) },
      { name: 'Last played', value: formatShow(last) },
      { name: 'Total shows', value: `${matching.length}` },
    );

  await interaction.editReply({ embeds: [embed] });
}
