import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Collection, Options } from 'discord.js';
import cron from 'node-cron';
import * as find from './commands/find.js';
import * as songs from './commands/songs.js';
import * as setlist from './commands/setlist.js';
import * as random from './commands/random.js';
import * as countdown from './commands/countdown.js';
import * as seen from './commands/search.js';
import * as next from './commands/next.js';
import * as clueless from './commands/clueless.js';
import { getTodaysTarget, pickNewTarget } from './utils/dailyTarget.js';
import { initActivity, recordActivity, saveActivity } from './utils/activity.js';
import { CLUELESS_EMOJI, loadClueless, saveClueless, handleRawPacket, getCluedAuthors } from './utils/clueless.js';
import { loadMessageCounts, saveMessageCounts, recordMessage, refreshMessageCounts } from './utils/messageCounts.js';

const commands = new Collection([
  ['find', find],
  ['songs', songs],
  ['setlist', setlist],
  ['random', random],
  ['countdown', countdown],
  ['search', seen],
  ['next', next],
  ['clueless', clueless],
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Messages are only used for the daily-target reaction and clueless stats,
  // which work off event payloads, so don't keep the default 200 per channel in memory.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
  }),
});

let todaysTargetId = null;

loadClueless();
loadMessageCounts();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    saveActivity();
    saveClueless();
    saveMessageCounts();
    process.exit(0);
  });
}

client.once(Events.ClientReady, async c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);

  const guild = await client.guilds.fetch(process.env.HOME_GUILD_ID);
  await initActivity(guild);
  todaysTargetId = await getTodaysTarget(guild);

  // Reset daily at midnight Toronto time (America/Toronto handles EST/EDT automatically)
  cron.schedule('0 0 * * *', async () => {
    todaysTargetId = await pickNewTarget(guild);
  }, { timezone: 'America/Toronto' });

  // Message totals for clueless rates come from search, which is slow, so it
  // runs in the background: now for anyone missing, then nightly for anyone
  // clued since or not checked in a week
  const refreshCounts = () => refreshMessageCounts(client, guild.id, getCluedAuthors())
    .catch(err => console.error('[messageCounts] Refresh failed:', err.message));
  refreshCounts();
  cron.schedule('0 4 * * *', refreshCounts, { timezone: 'America/Toronto' });
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.guildId === process.env.HOME_GUILD_ID) {
    recordActivity(message.author.id);
    recordMessage(message.author.id);
  }
  if (message.author.id !== todaysTargetId) return;

  try {
    await message.react(client.emojis.cache.get(CLUELESS_EMOJI) ?? CLUELESS_EMOJI);
  } catch (err) {
    console.error('[dailyTarget] Failed to react:', err.message);
  }
});

// Reaction events for uncached messages only arrive raw (see utils/clueless.js)
client.on(Events.Raw, packet => {
  handleRawPacket(packet, client).catch(err => console.error('[clueless] Failed to record reaction:', err.message));
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      const parts = id.split('_');
      const cmdName = parts[0];
      if (cmdName === 'find') {
        await find.handleButton(interaction, parts);
      } else if (cmdName === 'songs' || cmdName === 'songssort') {
        await songs.handleButton(interaction, parts);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
    }
  } catch (err) {
    console.error(err);
    const msg = { content: 'An error occurred.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
