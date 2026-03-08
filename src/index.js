import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import cron from 'node-cron';
import * as find from './commands/find.js';
import * as songs from './commands/songs.js';
import * as setlist from './commands/setlist.js';
import * as random from './commands/random.js';
import { getTodaysTarget, pickNewTarget } from './utils/dailyTarget.js';

const CLUELESS_EMOJI = '537217074745966593';

const commands = new Collection([
  ['find', find],
  ['songs', songs],
  ['setlist', setlist],
  ['random', random],
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let todaysTargetId = null;

client.once(Events.ClientReady, async c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  todaysTargetId = await getTodaysTarget(guild);

  // Reset daily at midnight Toronto time (America/Toronto handles EST/EDT automatically)
  cron.schedule('0 0 * * *', async () => {
    todaysTargetId = await pickNewTarget(guild);
  }, { timezone: 'America/Toronto' });
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.author.id !== todaysTargetId) return;

  try {
    await message.react(client.emojis.cache.get(CLUELESS_EMOJI) ?? CLUELESS_EMOJI);
  } catch (err) {
    console.error('[dailyTarget] Failed to react:', err.message);
  }
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
      } else if (cmdName === 'songs') {
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
