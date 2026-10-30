import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const allowedRoleId = '852778233275613235';

export async function handleWarnMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'warn') return;

  if (!message.member?.roles.cache.has(allowedRoleId)) {
    await message.channel.send({ embeds: [createResponseEmbed('Permission required', 'You need the authorized role to use this warning command.', 'error')] });
    return;
  }

  const targetId = parseUserId(args.shift() ?? '');
  const reason = args.join(' ').trim();
  if (!targetId || !reason || reason.length > 400) {
    await message.channel.send({ embeds: [createResponseEmbed('Usage', `Use \`${prefix}warn <user ID> <reason>\`. The reason is required and can be up to 400 characters.`, 'error')] });
    return;
  }

  const member = await message.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
    await message.channel.send({ embeds: [createResponseEmbed('Member not found', 'That user is not a member of this server.', 'error')] });
    return;
  }

  let dmSent = true;
  try {
    await member.send({
      embeds: [createResponseEmbed(
        'You have been warned',
        `You have been warned in **${message.guild.name}**.\n\n**Reason:** ${reason}`,
        'error',
      )],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    dmSent = false;
    console.warn(`Could not DM warning to user ${targetId}:`, error);
  }

  const record = await logModerationAction({
    client: message.client,
    guild: message.guild,
    action: 'Member warned',
    moderator: message.author,
    targetUser: member.user,
    targetId,
    reason,
    source: 'prefix-warn',
  });

  const result = dmSent
    ? `${member.user.tag} was warned by DM.`
    : `${member.user.tag} was warned, but their DMs are unavailable.`;
  const caseInfo = record ? ` Case ID: ${record.caseId}.` : '';
  await message.channel.send({
    embeds: [createResponseEmbed('Warning issued', `${result}${caseInfo}`, dmSent ? 'success' : 'error')],
  });
}
