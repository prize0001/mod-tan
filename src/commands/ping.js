import { SlashCommandBuilder } from 'discord.js';
import { createResponseEmbed } from '../utils/response-embed.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is responding.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [createResponseEmbed('Pong', `Websocket ping: **${interaction.client.ws.ping} ms**`, 'success')],
      ephemeral: true,
    });
  },
};

const prefix = process.env.BOT_PREFIX ?? '=';

export async function handlePingMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'ping') return;

  await message.reply({
    embeds: [createResponseEmbed('Pong', `Websocket ping: **${message.client.ws.ping} ms**`, 'success')],
    allowedMentions: { repliedUser: false },
  });
}
