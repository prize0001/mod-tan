import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const requiredGuildId = '852771975730298880';
const requiredRoleId = '1115815957802258434';
const storePath = process.env.STICKY_AD_STORE_PATH ?? join(process.cwd(), 'data', 'sticky-ads.json');
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
let writeQueue = Promise.resolve();
let expiryTimer;
const channelQueues = new Map();

function hasRequiredRole(interaction) {
  const roles = interaction.member?.roles;
  if (roles?.cache?.has) return roles.cache.has(requiredRoleId);
  if (Array.isArray(roles)) return roles.includes(requiredRoleId);
  return false;
}

function parseDuration(value, now = Date.now()) {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*(h|hours?|d|days?|w|weeks?|mo|months?)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) return null;

  let expiresAt;
  if (match[2].startsWith('mo')) {
    if (amount > 12) return null;
    const date = new Date(now);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    expiresAt = date.getTime();
  } else {
    const unit = match[2][0];
    const durationMs = amount * (unit === 'h' ? hourMs : unit === 'd' ? dayMs : 7 * dayMs);
    if (!Number.isSafeInteger(durationMs)) return null;
    expiresAt = now + durationMs;
  }

  const durationMs = expiresAt - now;
  return durationMs >= hourMs && durationMs <= 366 * dayMs ? expiresAt : null;
}

function resolveChannelIds(value, guild) {
  const references = [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))];
  if (references.length === 0) return null;

  const ids = [];
  for (const reference of references) {
    const mention = reference.match(/^<#(\d{17,20})>$/);
    if (mention) {
      ids.push(mention[1]);
      continue;
    }
    if (/^\d{17,20}$/.test(reference)) {
      ids.push(reference);
      continue;
    }
    const name = reference.startsWith('#') ? reference.slice(1) : reference;
    const channel = guild.channels.cache.find((entry) => entry.name?.toLowerCase() === name.toLowerCase());
    if (!channel) return null;
    ids.push(channel.id);
  }
  return [...new Set(ids)];
}

async function readCampaigns() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const data = JSON.parse(await readFile(storePath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Sticky-ad store must contain a JSON object.');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeCampaigns(data) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    await rename(temporaryPath, storePath);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    await writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

function mutateCampaigns(callback) {
  const operation = writeQueue.then(async () => {
    const data = await readCampaigns();
    const result = await callback(data);
    await writeCampaigns(data);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function getCampaigns() {
  await writeQueue;
  return readCampaigns();
}

function updateCampaign(id, callback) {
  return mutateCampaigns((data) => {
    const campaign = data[id];
    if (!campaign) return null;
    return callback(campaign);
  });
}

function enqueueChannel(channelId, callback) {
  const previous = channelQueues.get(channelId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(callback);
  channelQueues.set(channelId, operation);
  operation.finally(() => {
    if (channelQueues.get(channelId) === operation) channelQueues.delete(channelId);
  }).catch(() => undefined);
  return operation;
}

async function deletePostedMessage(client, channelId, messageId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages?.delete) return;
  try {
    await channel.messages.delete(messageId);
  } catch (error) {
    if (error.code !== 10008) throw error;
  }
}

async function endCampaign(client, campaignId) {
  const campaign = await updateCampaign(campaignId, (current) => {
    current.status = 'ending';
    return { ...current, lastMessages: { ...current.lastMessages } };
  });
  if (!campaign) return;

  await Promise.all(campaign.channelIds.map((channelId) => enqueueChannel(channelId, async () => {
    const current = (await getCampaigns())[campaignId];
    const messageId = current?.lastMessages?.[channelId];
    if (messageId) await deletePostedMessage(client, channelId, messageId).catch((error) => {
      console.error(`Could not remove expired sticky ad ${campaignId} from ${channelId}:`, error);
    });
  })));

  await mutateCampaigns((data) => { delete data[campaignId]; });
}

async function removeExpiredCampaigns(client, guildId) {
  const now = Date.now();
  const expired = Object.values(await getCampaigns()).filter((campaign) =>
    campaign.guildId === guildId
    && (campaign.status === 'ending' || (campaign.status === 'active' && campaign.expiresAt <= now)));
  await Promise.all(expired.map((campaign) => endCampaign(client, campaign.id)));
}

async function refreshStickyAds(message) {
  if (message.author.bot || message.webhookId || !message.guild || message.guildId !== requiredGuildId) return;
  await removeExpiredCampaigns(message.client, message.guildId);
  const campaigns = Object.values(await getCampaigns()).filter((campaign) =>
    campaign.guildId === message.guildId
    && campaign.status === 'active'
    && campaign.expiresAt > Date.now()
    && campaign.channelIds.includes(message.channelId));

  await Promise.all(campaigns.map((campaign) => enqueueChannel(message.channelId, async () => {
    const current = (await getCampaigns())[campaign.id];
    if (!current || current.status !== 'active' || current.expiresAt <= Date.now()) return;

    const oldMessageId = current.lastMessages?.[message.channelId];
    if (oldMessageId) {
      try {
        await deletePostedMessage(message.client, message.channelId, oldMessageId);
      } catch (error) {
        console.error(`Could not replace sticky ad ${campaign.id} in ${message.channelId}:`, error);
        return;
      }
    }

    const channel = await message.client.channels.fetch(message.channelId).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') return;
    const posted = await channel.send({ content: current.content, allowedMentions: { parse: [] } });
    await updateCampaign(campaign.id, (stored) => {
      if (stored.status === 'active') {
        stored.lastMessages ??= {};
        stored.lastMessages[message.channelId] = posted.id;
      }
    });
  })));
}

function startExpiryScheduler(client) {
  if (expiryTimer) return;
  const run = () => getCampaigns()
    .then((data) => Promise.all(Object.values(data)
      .filter((campaign) => campaign.status === 'ending' || (campaign.status === 'active' && campaign.expiresAt <= Date.now()))
      .map((campaign) => endCampaign(client, campaign.id))))
    .catch((error) => console.error('Sticky-ad expiry cleanup failed:', error));
  run();
  expiryTimer = setInterval(run, 60_000);
  expiryTimer.unref?.();
}

export default {
  data: new SlashCommandBuilder()
    .setName('stickyad')
    .setDescription('Create and manage sticky ads in this server.')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create a sticky ad that refreshes when someone posts.')
      .addStringOption((option) => option.setName('message').setDescription('Text to repost in the selected channels').setMaxLength(1800).setRequired(true))
      .addStringOption((option) => option.setName('channels').setDescription('Comma-separated channel names, mentions, or IDs').setMaxLength(500).setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Examples: 1 week, 4 months, 30d').setMaxLength(30).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('list')
      .setDescription('Show all active sticky ads.'))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Stop a sticky ad and delete its current posts.')
      .addStringOption((option) => option.setName('id').setDescription('Sticky-ad ID from /stickyad list').setMaxLength(20).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== requiredGuildId) {
      return interaction.reply({ embeds: [createResponseEmbed('Server required', 'Sticky ads can only be managed in the configured server.', 'error')], ephemeral: true });
    }
    if (!hasRequiredRole(interaction)) {
      return interaction.reply({ embeds: [createResponseEmbed('Role required', `Only members with role <@&${requiredRoleId}> can manage sticky ads.`, 'error')], allowedMentions: { parse: [] }, ephemeral: true });
    }

    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      await removeExpiredCampaigns(interaction.client, interaction.guildId);
      const campaigns = Object.values(await getCampaigns()).filter((campaign) => campaign.guildId === interaction.guildId && campaign.status === 'active');
      if (campaigns.length === 0) {
        return interaction.reply({ embeds: [createResponseEmbed('Active sticky ads', 'There are no active sticky ads.', 'info')], ephemeral: true });
      }

      const embeds = [];
      for (let index = 0; index < campaigns.length; index += 25) {
        const embed = createResponseEmbed('Active sticky ads', `Page ${Math.floor(index / 25) + 1}`);
        for (const campaign of campaigns.slice(index, index + 25)) {
          const channelMentions = campaign.channelIds.map((channelId) => `<#${channelId}>`).join(', ');
          const remaining = Math.max(0, campaign.expiresAt - Date.now());
          const value = `**Channels:** ${channelMentions}\n**Expires:** <t:${Math.floor(campaign.expiresAt / 1000)}:R>\n**Refreshes after:** each human message\n**Message:** ${campaign.content.slice(0, 500)}${campaign.content.length > 500 ? '…' : ''}`;
          embed.addFields({ name: `ID ${campaign.id} · ${Math.ceil(remaining / dayMs)} day(s) left`, value: value.slice(0, 1024) });
        }
        embeds.push(embed);
      }
      for (let index = 0; index < embeds.length; index += 10) {
        const response = { embeds: embeds.slice(index, index + 10), ephemeral: true, allowedMentions: { parse: [] } };
        if (index === 0) await interaction.reply(response);
        else await interaction.followUp(response);
      }
      return;
    }

    if (action === 'remove') {
      const id = interaction.options.getString('id', true).trim();
      const campaign = (await getCampaigns())[id];
      if (!campaign || campaign.guildId !== interaction.guildId || campaign.status !== 'active') {
        return interaction.reply({ embeds: [createResponseEmbed('Sticky ad not found', 'Check the ID with `/stickyad list`.', 'error')], ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      await endCampaign(interaction.client, id);
      return interaction.editReply({ embeds: [createResponseEmbed('Sticky ad removed', `Sticky ad **${id}** was stopped and its posts were removed.`, 'success')] });
    }

    const content = interaction.options.getString('message', true).trim();
    const channelIds = resolveChannelIds(interaction.options.getString('channels', true), interaction.guild);
    const expiresAt = parseDuration(interaction.options.getString('duration', true));
    if (!content) return interaction.reply({ embeds: [createResponseEmbed('Message required', 'Enter the sticky-ad text to post.', 'error')], ephemeral: true });
    if (!channelIds) return interaction.reply({ embeds: [createResponseEmbed('Invalid channels', 'Enter comma-separated channel names such as `#ads`, channel mentions, or channel IDs.', 'error')], ephemeral: true });
    if (!expiresAt) return interaction.reply({ embeds: [createResponseEmbed('Invalid duration', 'Use a duration such as `1 week`, `4 months`, `30d`, or `12h` (up to 12 months).', 'error')], ephemeral: true });

    for (const channelId of channelIds) {
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        return interaction.reply({ embeds: [createResponseEmbed('Invalid channel', `Channel ${channelId} is not an accessible text channel in this server.`, 'error')], ephemeral: true });
      }
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return interaction.reply({ embeds: [createResponseEmbed('Missing permissions', `I need View Channel and Send Messages in <#${channelId}>.`, 'error')], ephemeral: true });
      }
    }

    const id = randomUUID().slice(0, 8);
    const campaign = await mutateCampaigns((data) => {
      const record = {
        id,
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        content,
        channelIds,
        createdAt: Date.now(),
        expiresAt,
        status: 'active',
        lastMessages: {},
      };
      data[id] = record;
      return record;
    });
    const relativeExpiry = `<t:${Math.floor(campaign.expiresAt / 1000)}:R>`;
    return interaction.reply({
      embeds: [createResponseEmbed('Sticky ad created', `ID: **${id}**\nChannels: ${channelIds.map((channelId) => `<#${channelId}>`).join(', ')}\nExpires ${relativeExpiry}. It posts after the next human message in each selected channel.`, 'success')],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
  onReady: startExpiryScheduler,
  onMessage: refreshStickyAds,
};
