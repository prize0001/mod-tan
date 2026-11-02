import { PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasBanAndLeftCommandRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const sevenDaysInSeconds = 7 * 24 * 60 * 60;
const sevenDaysMs = sevenDaysInSeconds * 1000;
const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

function canReadAndDeleteHistory(channel, botMember) {
  if (!channel.isTextBased?.() || !channel.messages?.fetch) return false;
  const permissions = channel.permissionsFor(botMember);
  return permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
  ]) ?? false;
}

async function collectHistoryChannels(guild, cutoff) {
  const channels = new Map();
  const baseChannels = [...guild.channels.cache.values()].filter((channel) => !channel.isThread?.());
  for (const channel of baseChannels) {
    if (channel.isTextBased?.() && channel.messages?.fetch) channels.set(channel.id, channel);

    const threads = channel.threads;
    if (!threads?.fetchActive) continue;

    const active = await threads.fetchActive().catch(() => null);
    for (const thread of active?.threads?.values?.() ?? []) channels.set(thread.id, thread);

    if (!threads.fetchArchived) continue;
    for (const type of ['public', 'private']) {
      let before = new Date();
      for (;;) {
        const page = await threads.fetchArchived({ type, before, limit: 100 }).catch(() => null);
        if (!page) break;
        const archivedThreads = [...(page.threads?.values?.() ?? [])];
        if (archivedThreads.length === 0) break;

        let oldestArchiveTimestamp = Infinity;
        for (const thread of archivedThreads) {
          const archivedAt = thread.archiveTimestamp ?? thread.archivedAt?.getTime?.() ?? 0;
          oldestArchiveTimestamp = Math.min(oldestArchiveTimestamp, archivedAt);
          if (archivedAt >= cutoff) channels.set(thread.id, thread);
        }

        if (!page.hasMore || oldestArchiveTimestamp <= cutoff || !Number.isFinite(oldestArchiveTimestamp)) break;
        before = new Date(oldestArchiveTimestamp - 1);
      }
    }
  }
  return [...channels.values()];
}

async function deleteOlderMessages(channel, targetId, cutoff, recentBanCutoff) {
  let deleted = 0;
  let failed = 0;
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    let oldestMessage = null;
    for (const oldMessage of batch.values()) {
      if (!oldestMessage || oldMessage.createdTimestamp < oldestMessage.createdTimestamp) oldestMessage = oldMessage;
      if (oldMessage.author.id !== targetId
        || oldMessage.createdTimestamp < cutoff
        || oldMessage.createdTimestamp >= recentBanCutoff) continue;
      try {
        await oldMessage.delete();
        deleted++;
      } catch (error) {
        if (error.code !== 10008 && error.rawError?.code !== 10008) {
          failed++;
          console.error(`Could not delete message ${oldMessage.id} from ${targetId} in channel ${channel.id}:`, error);
        }
      }
    }

    if (!oldestMessage || oldestMessage.createdTimestamp <= cutoff || batch.size < 100) break;
    before = oldestMessage.id;
  }
  return { deleted, failed };
}

async function deleteUserMessagesFromLastFourteenDays(guild, targetId, botMember, banRequestedAt) {
  const now = Date.now();
  const cutoff = now - fourteenDaysMs;
  const recentBanCutoff = banRequestedAt - sevenDaysMs;
  const channels = await collectHistoryChannels(guild, cutoff);
  let scannedChannels = 0;
  let skippedChannels = 0;
  let deletedMessages = 0;
  let failedDeletions = 0;

  for (const channel of channels) {
    if (!canReadAndDeleteHistory(channel, botMember)) {
      skippedChannels++;
      continue;
    }
    scannedChannels++;
    try {
      const result = await deleteOlderMessages(channel, targetId, cutoff, recentBanCutoff);
      deletedMessages += result.deleted;
      failedDeletions += result.failed;
    } catch (error) {
      skippedChannels++;
      scannedChannels--;
      console.error(`Could not scan message history in channel ${channel.id}:`, error);
    }
  }

  return { deletedMessages, scannedChannels, skippedChannels, failedDeletions };
}

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
    await message.channel.send({ embeds: [createResponseEmbed('Usage', `Use \`${prefix}left <user ID>\`.`, 'error')] });
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
  let deletionStats = { deletedMessages: 0, scannedChannels: 0, skippedChannels: 0, failedDeletions: 0 };
  const banRequestedAt = Date.now();
  try {
    await message.guild.members.ban(targetId, { reason, deleteMessageSeconds: sevenDaysInSeconds });
  } catch (error) {
    console.error(`Prefix softban deletion step failed for ${targetId}:`, error);
    await message.channel.send({ embeds: [createResponseEmbed('Softban failed', 'Discord could not complete the softban. Check the bot permissions and try again.', 'error')] });
    return;
  }

  try {
    deletionStats = await deleteUserMessagesFromLastFourteenDays(message.guild, targetId, botMember, banRequestedAt);
    if (deletionStats.skippedChannels || deletionStats.failedDeletions) {
      console.warn(`Left command for ${targetId} completed with ${deletionStats.skippedChannels} skipped channel(s) and ${deletionStats.failedDeletions} failed deletion(s).`);
    }
  } catch (error) {
    deletionStats.skippedChannels++;
    console.error(`Could not scan the full 14-day message history for ${targetId}:`, error);
  }

  try {
    await message.guild.members.unban(targetId, reason);
  } catch (error) {
    await logModerationAction({
      client: message.client,
      guild: message.guild,
      action: 'Member softbanned (unban failed)',
      moderator: message.author,
      targetUser,
      targetId,
      targetLabel: targetUser?.username ?? `User ${targetId}`,
      reason: `${reason} | Unban failed: ${error.message}`,
    });
    console.error(`Prefix softban unban step failed for ${targetId}:`, error);
    await message.channel.send({ embeds: [createResponseEmbed('Unban failed', `${targetUser?.tag ?? targetId} was banned and their messages from the past 14 days were deleted, but I could not unban them. Check the server ban list.`, 'error')] });
    return;
  }

  await logModerationAction({
    client: message.client,
    guild: message.guild,
    action: 'Member softbanned',
    moderator: message.author,
    targetUser,
    targetId,
    targetLabel: targetUser?.username ?? `User ${targetId}`,
    reason,
  });
  await message.channel.send({
    content: `🔨 Banned \`${targetId}\` indefinitely\n\n🔓 Unbanned \`${targetId}\``,
    allowedMentions: { parse: [] },
  });
}

