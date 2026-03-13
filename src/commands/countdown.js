import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('countdown')
  .setDescription('Countdown from 10 to GO!');

export async function execute(interaction) {
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
}
