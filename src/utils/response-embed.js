import { EmbedBuilder } from 'discord.js';

const colors = {
  success: 0x2D9C70,
  error: 0xC44545,
  info: 0x4169E1,
};

export function createResponseEmbed(title, description, status = 'info') {
  return new EmbedBuilder()
    .setColor(colors[status] ?? colors.info)
    .setTitle(title)
    .setDescription(description);
}