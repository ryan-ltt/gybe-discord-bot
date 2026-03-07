import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as find from './src/commands/find.js';
import * as songs from './src/commands/songs.js';
import * as setlist from './src/commands/setlist.js';
import * as random from './src/commands/random.js';

const commands = [find, songs, setlist, random].map(c => c.data.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);
    const data = await rest.put(route, { body: commands });
    const scope = guildId ? `guild ${guildId}` : 'globally';
    console.log(`Successfully registered ${data.length} commands ${scope}.`);
  } catch (err) {
    console.error(err);
  }
})();
