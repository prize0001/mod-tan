import { logModerationAction } from '../utils/log-moderation-action.js';
import { removeModerationCase } from '../store/moderation-cases.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';
export async function handleWarnRemoveMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, caseIdInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'warnremove') return;

  if (!(await hasStaffHubRole(message.client, message.author.id, 'warnings'))) {
    await message.channel.send({ embeds: [createResponseEmbed('Permission required', 'You need the authorized role to remove warnings.', 'error')] });
    return;
  }

  const caseId = Number(caseIdInput);
  if (!Number.isSafeInteger(caseId) || caseId < 1 || extra.length > 0) {
    await message.channel.send({ embeds: [createResponseEmbed('Usage', `Use \`${prefix}warnremove <case ID>\`.`, 'error')] });
    return;
  }

  const warning = await removeModerationCase({
    guildId: message.guildId,
    caseId,
    removedBy: message.author.id,
    source: 'prefix-warn',
  });
  if (!warning) {
    await message.channel.send({ embeds: [createResponseEmbed('Warning not found', 'That case is not an active warning from the `=warn` command in this server.', 'error')] });
    return;
  }

  const targetUser = await message.client.users.fetch(warning.targetId).catch(() => null);
  await logModerationAction({
    client: message.client,
    guild: message.guild,
    action: 'Member warning removed',
    moderator: message.author,
    targetUser,
    targetId: warning.targetId,
    targetLabel: `User ${warning.targetId}`,
    reason: `Removed warning case ${warning.caseId}`,
  });
  await message.channel.send({
    embeds: [createResponseEmbed('Warning removed', `Warning case ${warning.caseId} for <@${warning.targetId}> was removed from their warning history.`, 'success')],
    allowedMentions: { parse: [] },
  });
}
