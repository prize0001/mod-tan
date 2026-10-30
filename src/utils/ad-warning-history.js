import { EmbedBuilder } from 'discord.js';

export function buildAdWarningHistoryEmbeds(userId, warnings) {
  if (warnings.length === 0) {
    return [new EmbedBuilder()
      .setColor(0x4169E1)
      .setTitle('No ad warnings found')
      .setDescription(`No saved advertisement warnings were found for <@${userId}> in this server.`)];
  }

  return warnings.map((warning, index) => new EmbedBuilder()
    .setColor(0xF04F59)
    .setTitle(`<:mm_dot:1402737072032190504> Ad Warning Code | ${warning.code}`)
    .setDescription(`<:mm_dot:1402737072032190504> **Reason |** ${warning.reason || '(No reason recorded)'}`)
    .setFooter({ text: `Warning ${index + 1} of ${warnings.length} • User ID ${userId}` }));
}

export async function sendAdWarningHistory(channel, userId, warnings) {
  const embeds = buildAdWarningHistoryEmbeds(userId, warnings);
  for (let index = 0; index < embeds.length; index += 10) {
    await channel.send({
      embeds: embeds.slice(index, index + 10),
      allowedMentions: { parse: [] },
    });
  }
}
