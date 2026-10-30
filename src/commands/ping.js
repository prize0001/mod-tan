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
