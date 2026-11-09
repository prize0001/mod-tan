import { PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';
export async function handleKickMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'kick') return;

  if (!(await hasStaffHubRole(message.client, message.author.id, 'moderation'))) {
    await message.channel.send({ embeds: [createResponseEmbed('Permission required', 'You need the authorized role to use this kick command.', 'error')] });
    return;
  }

  const targetId = parseUserId(args.shift() ?? '');
  const reason = args.join(' ').trim();
  if (!targetId || !reason || reason.length > 400) {
    await message.channel.send({ embeds: [createResponseEmbed('Usage', `Use \`${prefix}kick <user ID> <reason>\`. The reason is required and can be up to 400 characters.`, 'error')] });
    return;
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
    await message.channel.send({ embeds: [createResponseEmbed('Kick unavailable', 'I need the Kick Members permission to use this command.', 'error')] });
    return;
  }

  const member = await message.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
    await message.channel.send({ embeds: [createResponseEmbed('Member not found', 'That user is not a member of this server.', 'error')] });
    return;
  }
  if (!member.kickable) {
    await message.channel.send({ embeds: [createResponseEmbed('Kick unavailable', 'I cannot kick that member. Check role hierarchy and bot permissions.', 'error')] });
    return;
  }

  try {
    await member.kick(reason);
  } catch (error) {
    console.error(`Prefix kick failed for ${targetId}:`, error);
    await message.channel.send({ embeds: [createResponseEmbed('Kick failed', 'Discord could not complete the kick. Check the bot permissions and try again.', 'error')] });
    return;
  }

  await logModerationAction({
    client: message.client,
    guild: message.guild,
    action: 'Member kicked',
    moderator: message.author,
    targetUser: member.user,
    targetId,
    reason,
  });
  await message.channel.send({ embeds: [createResponseEmbed('Member kicked', `${member.user.tag} was kicked.`, 'success')] });
}
