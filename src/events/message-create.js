import { PermissionFlagsBits } from 'discord.js';
import { issueAdWarning } from '../utils/issue-ad-warning.js';
import { hasRequiredCommandRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';

export async function handleAdMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...argumentsList] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'ad') return;

  if (!hasRequiredCommandRole(message)) {
    await message.channel.send('You need the authorized role to use the ad-deletion command.');
    return;
  }

  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const advertisement = message.reference?.messageId
    ? await message.fetchReference().catch(() => null)
    : null;
  const botMember = message.guild.members.me;
  if (!botMember?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) return;

  try {
    await message.delete();
  } catch (error) {
    console.error('Could not delete the ad-warning command message:', error);
    return;
  }

  const reason = argumentsList.join(' ').trim();
  if (!reason) {
    console.warn(`Ad-warning command from ${message.author.id} was missing a reason.`);
    return;
  }

  if (!message.reference?.messageId) {
    console.warn(`Ad-warning command from ${message.author.id} was not a reply.`);
    return;
  }

  if (!advertisement || advertisement.guildId !== message.guildId) {
    console.warn(`Could not fetch the message referenced by ad-warning command from ${message.author.id}.`);
    return;
  }

  try {
    await issueAdWarning({
      client: message.client,
      guild: message.guild,
      targetMessage: advertisement,
      moderatorId: message.author.id,
      reason,
    });
  } catch (error) {
    console.error('Could not issue advertisement warning:', error);
  }
}
