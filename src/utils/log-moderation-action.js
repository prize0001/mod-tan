import { EmbedBuilder } from 'discord.js';
import { createModerationCase } from '../store/moderation-cases.js';

const logChannelId = process.env.MODERATION_LOG_CHANNEL_ID ?? '865343173819629589';

export async function logModerationAction({
  client,
  guild,
  action,
  moderator,
  targetUser,
  targetId,
  targetLabel,
  reason,
  source,
}) {
  const moderatorId = moderator?.id ?? 'unknown';
  const moderatorName = moderator?.username ?? 'Unknown moderator';
  let record;
  try {
    record = await createModerationCase({
      guildId: guild.id,
      action,
      moderatorId,
      targetId,
      reason,
      ...(source ? { source } : {}),
    });
  } catch (error) {
    console.error(`Could not save the ${action} moderation case:`, error);
    return null;
  }

  const targetName = targetUser?.globalName ?? targetUser?.username ?? targetLabel ?? `User ${targetId}`;
  const actionLabel = {
    'Member kicked': 'Kicked',
    'User banned': 'Banned',
    'Member softbanned': 'Softbanned',
    'Member softbanned (unban failed)': 'Softban failed to unban',
    'Member timed out': 'Timed out',
    'Member warned': 'Warned',
    'Member warning removed': 'Removed warning from',
    'Messages cleared': 'Cleared messages for',
  }[action] ?? action;
  const targetDescription = action === 'Messages cleared' && !targetUser
    ? targetLabel || `Channel ${targetId}`
    : targetName;
  const moderatorAvatar = moderator?.displayAvatarURL?.({ size: 64 });
  const targetAvatar = targetUser?.displayAvatarURL?.({ size: 128 });
  const embed = new EmbedBuilder()
    .setColor(0xC44545)
    .setAuthor({
      name: `${moderatorName} (ID ${moderatorId})`,
      ...(moderatorAvatar ? { iconURL: moderatorAvatar } : {}),
    })
    .setDescription([
      `🔨 **${actionLabel}** ${targetDescription} (ID ${targetId})`,
      `📄 **Reason:** ${reason || 'No reason provided'}`,
    ].join('\n'))
    .setFooter({ text: `Case ${record.caseId} • ${guild.name}` });
  if (targetAvatar) embed.setThumbnail(targetAvatar);

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      throw new Error(`Moderation log destination ${logChannelId} is not a text channel.`);
    }
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`Could not send moderation case ${record.caseId} to the log channel:`, error);
  }

  return record;
}
