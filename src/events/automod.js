import { PermissionFlagsBits } from 'discord.js';
import { issueAdWarning } from '../utils/issue-ad-warning.js';

const monitoredChannelsByGuild = {
  '852771975730298880': new Set([
    '1299418114655649852',
    '1299418195337150666',
    '1299418272105627659',
    '1299418363772014633',
    '1299419038681796719',
    '1292355374200131634',
    '1292355405795692594',
    '1291609749640708106',
    '1291609987801550969',
    '1291609716170035303',
    '1291609791453593673',
    '1291609830167154709',
    '1292354806223994922',
    '1291609895321337866',
    '1291610036023328868',
    '1292354826935599145',
    '1291610241279987743',
    '1292355171170648105',
    '1291610140432400406',
    '1291610369525157918',
    '1291612666628149388',
    '1291612327833112677',
    '1291612375237267507',
    '1291612492526649344',
  ]),
};

const inviteChannelsByGuild = {
  '852771975730298880': new Set(['852808187333181450']),
};

const logChannelByGuild = {
  '852771975730298880': '1304961228657004665',
};

const discordInvitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/[a-z0-9-]+|discord(?:app)?\.com\/invite\/[a-z0-9-]+)/i;
const j4jPattern = /\bj\s*4\s*j\b/i;
const urlPattern = /(?:https?:\/\/|www\.)\S+/i;

export function findViolations(message, isInviteOnlyChannel) {
  const content = message.content ?? '';
  const violations = [];

  if (message.mentions.everyone || /@(everyone|here)\b/i.test(content)) {
    violations.push('Attempted @everyone/@here ping');
  }
  if (j4jPattern.test(content)) {
    violations.push('Advertisement contains the J4J keyword');
  }

  const containsInvite = discordInvitePattern.test(content);
  if (isInviteOnlyChannel && containsInvite) {
    violations.push('Discord invite posted in a restricted channel');
  }

  // Short ordinary chat should not be treated as an advertisement. A link is the
  // signal that a short message is advertising; J4J is handled independently.
  if (!isInviteOnlyChannel && content.length < 150 && (urlPattern.test(content) || message.attachments.size > 0)) {
    violations.push('Advertisement is shorter than 150 characters');
  }

  return [...new Set(violations)];
}

async function sendAutomodLog(message, violations) {
  const channelId = logChannelByGuild[message.guildId];
  if (!channelId) return;

  const channel = await message.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Automod log destination ${channelId} is not an accessible text channel.`);
  }

  const description = violations.join('; ');
  const attachmentUrls = [...message.attachments.values()].map((attachment) => attachment.url);
  const originalContent = [message.content?.trim(), ...attachmentUrls].filter(Boolean).join('\n') || '(no text content)';
  const logContent = [
    `<@${message.author.id}> was flagged for ${description} in <#${message.channelId}>.`,
    '',
    '**Message Content:**',
    originalContent,
  ].join('\n').slice(0, 1950);

  await channel.send({
    content: logContent,
    allowedMentions: { parse: [] },
  });
}

export async function handleAutomodMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;

  const monitored = monitoredChannelsByGuild[message.guildId]?.has(message.channelId) ?? false;
  const inviteOnly = inviteChannelsByGuild[message.guildId]?.has(message.channelId) ?? false;
  if (!monitored && !inviteOnly) return;

  const violations = findViolations(message, inviteOnly);
  if (violations.length === 0) return;

  const botMember = message.guild.members.me;
  if (!botMember?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
    console.error(`Automod cannot delete a flagged message in channel ${message.channelId}: missing Manage Messages.`);
    return;
  }

  try {
    const result = await issueAdWarning({
      client: message.client,
      guild: message.guild,
      targetMessage: message,
      moderatorId: message.client.user.id,
      reason: `Automod: ${violations.join('; ')}`,
      trackAdDeletion: false,
    });
    if (result.deliveredCount === 0) {
      console.error(`Automod removed message ${message.id}, but its ad-warning was not delivered to any warning channel.`);
    }
  } catch (error) {
    console.error(`Automod could not process message ${message.id}:`, error);
    return;
  }

  try {
    await sendAutomodLog(message, violations);
  } catch (error) {
    console.error(`Automod could not log message ${message.id}:`, error);
  }
}

