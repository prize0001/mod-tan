import { PermissionFlagsBits } from 'discord.js';
import { addAdWarning } from '../store/ad-warnings.js';
import { recordAdDeletion } from '../store/ad-deletions.js';
import { createAdWarningEmbed } from './ad-warning-embed.js';

const warningChannelsByGuild = {
  '852771975730298880': ['1291609464478105661'],
  '771235990664118272': ['772414258961055764'],
};

const fallbackWarningChannelIds = (process.env.AD_WARNING_CHANNEL_IDS
  ?? '1556740179216302090,1556750500706132080')
  .split(',')
  .map((channelId) => channelId.trim())
  .filter(Boolean);

export async function issueAdWarning({ client, guild, targetMessage, moderatorId, reason, trackAdDeletion = true }) {
  if (targetMessage.guildId !== guild.id) {
    throw new Error('The message must belong to the current server.');
  }

  const botMember = guild.members.me;
  if (!botMember?.permissionsIn(targetMessage.channel).has(PermissionFlagsBits.ManageMessages)) {
    throw new Error('I need Manage Messages permission in the message channel.');
  }

  const warning = await addAdWarning({
    guildId: guild.id,
    userId: targetMessage.author.id,
    moderatorId,
    channelId: targetMessage.channelId,
    reason,
  });

  await targetMessage.delete();

  if (trackAdDeletion) {
    try {
      await recordAdDeletion(moderatorId);
    } catch (error) {
      console.error(`Could not record ad deletion by moderator ${moderatorId}:`, error);
    }
  }

  const warningChannelIds = warningChannelsByGuild[guild.id] ?? fallbackWarningChannelIds;
  const deliveries = await Promise.allSettled(warningChannelIds.map(async (channelId) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      throw new Error(`Warning destination ${channelId} is not a text channel.`);
    }

    return channel.send({
      content: `<@${warning.userId}> | <@${warning.moderatorId}>`,
      embeds: [createAdWarningEmbed(warning)],
      allowedMentions: { parse: [], users: [...new Set([warning.userId, warning.moderatorId])] },
    });
  }));

  const deliveredCount = deliveries.filter((delivery) => delivery.status === 'fulfilled').length;
  for (const delivery of deliveries.filter((result) => result.status === 'rejected')) {
    console.error('Could not deliver an advertisement warning:', delivery.reason);
  }

  if (deliveredCount !== warningChannelIds.length) {
    console.error(`Warning case ${warning.code} reached ${deliveredCount} of ${warningChannelIds.length} log channels.`);
  }

  return { warning, deliveredCount, totalChannels: warningChannelIds.length };
}

