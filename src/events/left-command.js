import { PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasBanAndLeftCommandRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const sevenDaysInSeconds = 7 * 24 * 60 * 60;

export async function handleLeftMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'left') return;

  if (!hasBanAndLeftCommandRole(message)) {
    await message.channel.send({ embeds: [createResponseEmbed('Permission required', 'You need an authorized role to use this softban command.', 'error')] });
    return;
  }

  const targetId = parseUserId(args[0] ?? '');
  if (!targetId || args.length > 1) {
    await message.channel.send({ embeds: [createResponseEmbed('Usage', 'Use =left <user ID>.', 'error')] });
    return;
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.channel.send({ embeds: [createResponseEmbed('Softban unavailable', 'I need the Ban Members permission to use this command.', 'error')] });
    return;
  }

  const member = await message.guild.members.fetch(targetId).catch(() => null);
  if (member && !member.bannable) {
    await message.channel.send({ embeds: [createResponseEmbed('Softban unavailable', 'I cannot ban that member. Check role hierarchy and bot permissions.', 'error')] });
    return;
  }

  const targetUser = member?.user ?? await message.client.users.fetch(targetId).catch(() => null);
  const reason = 'User left';

  try {
    await message.guild.members.ban(targetId, { reason, deleteMessageSeconds: sevenDaysInSeconds });
  } catch (error) {
    console.error('Prefix softban failed for ' + targetId + ':', error);
    await message.channel.send({ embeds: [createResponseEmbed('Softban failed', 'Discord could not complete the softban. Check the bot permissions and try again.', 'error')] });
    return;
  }

  try {
    await message.guild.members.unban(targetId, reason);
  } catch (error) {
    try {
      await logModerationAction({
        client: message.client,
        guild: message.guild,
        action: 'Member softbanned (unban failed)',
        moderator: message.author,
        targetUser,
        targetId,
        targetLabel: targetUser?.username ?? 'User ' + targetId,
        reason: reason + ' | Unban failed: ' + error.message,
      });
    } catch (logError) {
      console.error('Could not log failed unban for ' + targetId + ':', logError);
    }
    console.error('Prefix softban unban step failed for ' + targetId + ':', error);
    await message.channel.send({ embeds: [createResponseEmbed('Unban failed', (targetUser?.tag ?? targetId) + ' was banned with 7 days of message deletion, but I could not unban them. Check the server ban list.', 'error')] });
    return;
  }

  try {
    await logModerationAction({
      client: message.client,
      guild: message.guild,
      action: 'Member softbanned',
      moderator: message.author,
      targetUser,
      targetId,
      targetLabel: targetUser?.username ?? 'User ' + targetId,
      reason,
    });
  } catch (error) {
    console.error('Could not log completed left command for ' + targetId + ':', error);
  }

  const codeFormattedTargetId = String.fromCharCode(96) + targetId + String.fromCharCode(96);
  await message.channel.send({
    content: '🔨 Banned ' + codeFormattedTargetId + ' indefinitely\n\n🔓 Unbanned ' + codeFormattedTargetId,
    allowedMentions: { parse: [] },
  });
}
