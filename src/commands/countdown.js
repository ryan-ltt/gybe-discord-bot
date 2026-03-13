import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const LISTENING_PARTY_CHANNEL = 'listening-party';

let running = false;

export const data = new SlashCommandBuilder()
  .setName('countdown')
  .setDescription('Countdown from 10 to GO!');

export async function execute(interaction) {
  if (interaction.channel.name !== LISTENING_PARTY_CHANNEL) {
    await interaction.reply({ content: `This command can only be used in #${LISTENING_PARTY_CHANNEL}.`, ephemeral: true });
    return;
  }

  if (running) {
    await interaction.reply({ content: 'A countdown is already running!', ephemeral: true });
    return;
  }

  running = true;
  try {
    const goEmoji = interaction.guild.emojis.cache.find(e => e.name === 'LETSFUCKINGGOOOOO');
    const goEmojiStr = goEmoji ? `<:${goEmoji.name}:${goEmoji.id}>` : '🎉';

    const buildEmbed = (n) =>
      new EmbedBuilder()
        .setColor(0x4a90d9)
        .setTitle(n === 0 ? `GO!!!!!!!!!!!!!!!!!!! ${goEmojiStr}` : `${n}`);

    await interaction.reply({ embeds: [buildEmbed(10)] });

    for (let i = 9; i >= 0; i--) {
      await new Promise(r => setTimeout(r, 1000));
      await interaction.editReply({ embeds: [buildEmbed(i)] });
    }
  } finally {
    running = false;
  }
}
