import { SlashCommandBuilder, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { getShowUsers } from '../data/users.js';
import { getSetlists } from '../data/setlists.js';

const FIELD_LIMIT = 1024;

export const data = new SlashCommandBuilder()
  .setName('heard')
  .setDescription('Which gyberecordinghelper.com users have listened to or attended a show')
  .addStringOption(opt =>
    opt.setName('date')
      .setDescription('Show date in YYYY-MM-DD format')
      .setRequired(true)
  );

// Fits as many names as an embed field allows, then says how many were left out
function nameList(names) {
  if (names.length === 0) return 'Nobody yet';
  const escaped = names.map(n => escapeMarkdown(n));
  let text = escaped.join(', ');
  for (let shown = escaped.length - 1; text.length > FIELD_LIMIT; shown--) {
    text = `${escaped.slice(0, shown).join(', ')} and ${escaped.length - shown} more`;
  }
  return text;
}

export async function execute(interaction) {
  await interaction.deferReply();
  const date = interaction.options.getString('date').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await interaction.editReply('Please provide a date in YYYY-MM-DD format (e.g. `1997-10-05`).');
    return;
  }

  let byShow;
  try {
    byShow = await getShowUsers(date);
  } catch (err) {
    console.error('Failed to load show users:', err.message);
    await interaction.editReply('Could not load user data from gyberecordinghelper.com right now.');
    return;
  }

  if (byShow.size === 0) {
    await interaction.editReply('No public users have listened to or attended a show on this date.');
    return;
  }

  // Venues are only a label, so carry on without them if setlists won't load
  const shows = await getSetlists().catch(() => []);
  const venues = new Map(shows.map(s => [s.date, s.venue]));

  const embeds = [...byShow.keys()].sort().map(showDate => {
    const { listened, attended } = byShow.get(showDate);
    const venue = venues.get(showDate);
    return new EmbedBuilder()
      .setColor(0x4a90d9)
      .setTitle(venue ? `${showDate}  ·  ${venue}` : showDate)
      .addFields(
        { name: `Listened (${listened.length})`, value: nameList(listened) },
        { name: `Attended (${attended.length})`, value: nameList(attended) },
      );
  });

  await interaction.editReply({ embeds });
}
