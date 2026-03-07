import 'dotenv/config';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import * as find from './commands/find.js';
import * as songs from './commands/songs.js';
import * as setlist from './commands/setlist.js';
import * as random from './commands/random.js';

const commands = new Collection([
  ['find', find],
  ['songs', songs],
  ['setlist', setlist],
  ['random', random],
]);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
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
