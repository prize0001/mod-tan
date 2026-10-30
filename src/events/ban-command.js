import { PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const allowedRoleIds = ['852778343908900896', '852778216464973844'];

export async function handleBanMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'ban') return;

  if (!allowedRoleIds.some((roleId) => message.member?.roles.cache.has(roleId))) {
    await message.channel.send({ embeds: [createResponseEmbed('Permission required', 'You need the authorized role to use this ban command.', 'error')] });
    return;
  }

  const targetId = parseUserId(args.shift() ?? '');
  const reason = args.join(' ').trim();
  if (!targetId || !reason || reason.length > 400) {
    await message.channel.send({ embeds: [createResponseEmbed('Usage', `Use \`${prefix}ban <user ID> <reason>\`. The reason is required and can be up to 400 characters.`, 'error')] });
    return;
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.channel.send({ embeds: [createResponseEmbed('Ban unavailable', 'I need the Ban Members permission to use this command.', 'error')] });
    return;
  }

  const [targetUser, member] = await Promise.all([
    message.client.users.fetch(targetId).catch(() => null),
    message.guild.members.fetch(targetId).catch(() => null),
  ]);
  if (!targetUser) {
    await message.channel.send({ embeds: [createResponseEmbed('User not found', 'Check the user ID and try again.', 'error')] });
    return;
  }
  if (member && !member.bannable) {
    await message.channel.send({ embeds: [createResponseEmbed('Ban unavailable', 'I cannot ban that member. Check role hierarchy and bot permissions.', 'error')] });
    return;
  }

  try {
    await message.guild.members.ban(targetId, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
  } catch (error) {
    console.error(`Prefix ban failed for ${targetId}:`, error);
    await message.channel.send({ embeds: [createResponseEmbed('Ban failed', 'Discord could not complete the ban. Check the bot permissions and try again.', 'error')] });
    return;
  }

  await logModerationAction({
    client: message.client,
    guild: message.guild,
    action: 'User banned',
    moderator: message.author,
    targetUser,
    targetId,
    reason,
  });
  await message.channel.send({ embeds: [createResponseEmbed('User banned', `${targetUser.tag} was banned.`, 'success')] });
}
