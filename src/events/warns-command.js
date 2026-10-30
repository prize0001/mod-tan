import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getModerationCases } from '../store/moderation-cases.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const blueDot = '<:mm_dot:1402737072032190504>';

export async function handleWarnsMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, userInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'warns') return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.channel.send({
      embeds: [createResponseEmbed('Permission required', 'You need Manage Messages permission to look up warnings.', 'error')],
    });
    return;
  }

  const userId = parseUserId(userInput ?? '');
  if (!userId || extra.length > 0) {
    await message.channel.send({
      embeds: [createResponseEmbed('Usage', `Use \`${prefix}warns <user ID>\`.`, 'error')],
    });
    return;
  }

  const warnings = await getModerationCases({
    guildId: message.guildId,
    targetId: userId,
    action: 'Member warned',
    source: 'prefix-warn',
  });

  if (warnings.length === 0) {
    await message.channel.send({
      embeds: [createResponseEmbed('No warnings found', `No warnings from \`${prefix}warn\` were found for <@${userId}> in this server.`, 'info')],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const embeds = warnings.map((warning, index) => new EmbedBuilder()
    .setColor(0xC44545)
    .setTitle(`Warning ${index + 1} of ${warnings.length} • Case ${warning.caseId}`)
    .setDescription([
      `${blueDot} **User |** <@${warning.targetId}> (\`${warning.targetId}\`)`,
      `${blueDot} **Reason |** ${warning.reason || 'No reason recorded'}`,
      `${blueDot} **Moderator |** <@${warning.moderatorId}>`,
    ].join('\n'))
    .setTimestamp(new Date(warning.createdAt)));

  for (let index = 0; index < embeds.length; index += 10) {
    await message.channel.send({
      embeds: embeds.slice(index, index + 10),
      allowedMentions: { parse: [] },
    });
  }
}
