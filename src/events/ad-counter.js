import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const stickyChannelIds = new Set((process.env.STICKY_CHANNEL_IDS ?? '')
  .split(',')
  .map((channelId) => channelId.trim())
  .filter(Boolean));
const storePath = process.env.STICKY_MESSAGE_STORE_PATH ?? join(process.cwd(), 'data', 'sticky-messages.json');
const inviteCountStorePath = process.env.INVITE_COUNT_STORE_PATH ?? join(process.cwd(), 'data', 'invite-counts.json');
const channelQueues = new Map();
let storeQueue = Promise.resolve();
let inviteCountQueue = Promise.resolve();
const discordInvitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/[a-z0-9-]+|discord(?:app)?\.com\/invite\/[a-z0-9-]+)/gi;

async function readStickyMessages() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const messages = JSON.parse(await readFile(storePath, 'utf8'));
    if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
      throw new Error('Sticky message store must contain a JSON object.');
    }
    return messages;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function getStickyMessageId(channelId) {
  await storeQueue;
  const messages = await readStickyMessages();
  return messages[channelId] ?? null;
}

function clearStickyMessageId(channelId) {
  const operation = storeQueue.then(async () => {
    const messages = await readStickyMessages();
    delete messages[channelId];
    await mkdir(dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    const serializedMessages = JSON.stringify(messages, null, 2);
    await writeFile(temporaryPath, serializedMessages, 'utf8');
    try {
      await rename(temporaryPath, storePath);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
      await writeFile(storePath, serializedMessages, 'utf8');
      await unlink(temporaryPath).catch(() => undefined);
    }
  });
  storeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function readInviteCounts() {
  await mkdir(dirname(inviteCountStorePath), { recursive: true });
  try {
    const counts = JSON.parse(await readFile(inviteCountStorePath, 'utf8'));
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
      throw new Error('Invite count store must contain a JSON object.');
    }
    return counts;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function updateInviteCount(guildId, userId, amount) {
  const operation = inviteCountQueue.then(async () => {
    const counts = await readInviteCounts();
    const key = `${guildId}:${userId}`;
    counts[key] = (counts[key] ?? 0) + amount;
    const temporaryPath = `${inviteCountStorePath}.${process.pid}.tmp`;
    const serializedCounts = JSON.stringify(counts, null, 2);
    await writeFile(temporaryPath, serializedCounts, 'utf8');
    try {
      await rename(temporaryPath, inviteCountStorePath);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
      await writeFile(inviteCountStorePath, serializedCounts, 'utf8');
      await unlink(temporaryPath).catch(() => undefined);
    }
    return counts[key];
  });
  inviteCountQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function getInviteCount(guildId, userId) {
  await inviteCountQueue;
  const counts = await readInviteCounts();
  return counts[`${guildId}:${userId}`] ?? 0;
}

async function refreshStickyMessage(message) {
  const permissions = message.channel.permissionsFor(message.guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages])) {
    console.error(`The bot lacks permissions to refresh the sticky message in channel ${message.channelId}.`);
    return;
  }

  const previousMessageId = await getStickyMessageId(message.channelId);
  if (previousMessageId) {
    await message.channel.messages.delete(previousMessageId).catch((error) => {
      if (error.code !== 10008) {
        console.error(`Could not remove prior sticky message ${previousMessageId}:`, error);
      }
    });
    await clearStickyMessageId(message.channelId);
  }

  const inviteMatches = message.content.match(discordInvitePattern) ?? [];
  const inviteCount = inviteMatches.length
    ? await updateInviteCount(message.guild.id, message.author.id, inviteMatches.length)
    : await getInviteCount(message.guild.id, message.author.id);
  const embed = new EmbedBuilder()
    .setColor(0x4C78D0)
    .setTitle('Ad Counter')
    .setDescription(`${message.author}, total ads you have posted: \`${inviteCount}\``);
  const counterMessage = await message.channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  setTimeout(() => {
    counterMessage.delete().catch((error) => {
      console.error(`Could not delete temporary ad counter ${counterMessage.id}:`, error);
    });
  }, 6_000);
}

export function handleAdCounterMessage(message) {
  if (message.author.bot || !message.guild || !stickyChannelIds.has(message.channelId)) return Promise.resolve();

  const previous = channelQueues.get(message.channelId) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(() => refreshStickyMessage(message));
  channelQueues.set(message.channelId, operation);

  return operation.finally(() => {
    if (channelQueues.get(message.channelId) === operation) {
      channelQueues.delete(message.channelId);
    }
  });
}