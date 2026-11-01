import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  createAutoAd,
  DEFAULT_AUTO_AD_INTERVAL_MS,
  listAutoAds,
  processAutoAds,
  removeAutoAd,
} from '../utils/auto-ad-scheduler.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const requiredAutoAdRoleId = '1115815957802258434';

function hasAutoAdRole(interaction) {
  const roles = interaction.member?.roles;
  if (roles?.cache?.has) return roles.cache.has(requiredAutoAdRoleId);
  if (Array.isArray(roles)) return roles.includes(requiredAutoAdRoleId);
  return false;
}

function parseDuration(value) {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*(m|minutes?|h|hours?|d|days?)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2][0];
  const duration = amount * (unit === 'm' ? 60_000 : unit === 'h' ? 60 * 60_000 : 24 * 60 * 60_000);
  if (!Number.isSafeInteger(duration) || duration < 60_000 || duration > 365 * 24 * 60 * 60_000) return null;
  return duration;
}

function parseInterval(value) {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*(h|hr|hrs|hour|hours)$/);
  if (!match) return null;

  const hours = Number(match[1]);
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 365 * 24) return null;
  return hours * 60 * 60_000;
}

function resolveChannelIds(value, guild) {
  const references = [...new Set(value.split(',').map((reference) => reference.trim()).filter(Boolean))];
  if (!references.length) return null;

  const channelIds = [];
  for (const reference of references) {
    const mention = reference.match(/^<#(\d{17,20})>$/);
    if (mention) {
      channelIds.push(mention[1]);
      continue;
    }
    if (/^\d{17,20}$/.test(reference)) {
      channelIds.push(reference);
      continue;
    }

    const channelName = reference.startsWith('#') ? reference.slice(1) : reference;
    const channel = guild.channels.cache.find((candidate) => candidate.name?.toLowerCase() === channelName.toLowerCase());
    if (!channel) return null;
    channelIds.push(channel.id);
  }

  return [...new Set(channelIds)];
}

export default {
  data: new SlashCommandBuilder()
    .setName('autoad')
    .setDescription('Schedule and manage recurring ads.')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Post an ad at a chosen hourly interval until its duration ends.')
      .addStringOption((option) => option.setName('description').setDescription('Text of the ad').setMaxLength(1800).setRequired(true))
      .addStringOption((option) => option.setName('channels').setDescription('Comma-separated #channel names or channel mentions').setMaxLength(500).setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Duration such as 7d, 30 days, or 12h').setMaxLength(30).setRequired(true))
      .addStringOption((option) => option.setName('interval').setDescription('Post every 1h, 6hr, or another whole number of hours').setMaxLength(20).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('list')
      .setDescription('List active auto ads.'))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Stop an auto ad and remove its posts.')
      .addStringOption((option) => option.setName('id').setDescription('Auto-ad ID from /autoad list').setMaxLength(20).setRequired(true))),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [createResponseEmbed('Server required', 'Auto ads can only be managed inside a server.', 'error')],
        ephemeral: true,
      });
    }

    if (!hasAutoAdRole(interaction)) {
      return interaction.reply({
        embeds: [createResponseEmbed('Role required', `Only members with role <@&${requiredAutoAdRoleId}> can manage auto ads.`, 'error')],
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
    }

    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      const campaigns = await listAutoAds(interaction.guildId);
      const description = campaigns.length
        ? campaigns.map((campaign) => `**${campaign.id}** · every ${formatInterval(campaign.intervalMs)} · ends <t:${Math.floor(campaign.expiresAt / 1000)}:R> · ${campaign.channelIds.length} channel(s)\n${campaign.description.slice(0, 150)}`).join('\n\n')
        : 'There are no active auto ads in this server.';
      return interaction.reply({ embeds: [createResponseEmbed('Active auto ads', description)], ephemeral: true });
    }

    if (action === 'remove') {
      const id = interaction.options.getString('id', true).trim();
      const campaign = (await listAutoAds(interaction.guildId)).find((entry) => entry.id === id);
      if (!campaign) {
        return interaction.reply({ embeds: [createResponseEmbed('Auto ad not found', 'Check the ID with `/autoad list`.', 'error')], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      for (const postedMessage of campaign.postedMessages) {
        const channel = await interaction.guild.channels.fetch(postedMessage.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.messages.delete(postedMessage.messageId).catch((error) => {
            if (error.code !== 10008) console.error(`Could not remove auto-ad message ${postedMessage.messageId}:`, error);
          });
        }
      }
      await removeAutoAd(interaction.guildId, id);
      return interaction.editReply({ embeds: [createResponseEmbed('Auto ad removed', `Auto ad **${id}** was stopped and its posts were removed.`, 'success')] });
    }

    const description = interaction.options.getString('description', true).trim();
    const channelIds = resolveChannelIds(interaction.options.getString('channels', true), interaction.guild);
    const durationMs = parseDuration(interaction.options.getString('duration', true));
    const intervalMs = parseInterval(interaction.options.getString('interval', true));
    if (!description) {
      return interaction.reply({ embeds: [createResponseEmbed('Description required', 'Enter the ad text to post.', 'error')], ephemeral: true });
    }
    if (!channelIds) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid channels', 'Enter comma-separated channel names such as `#ads`, channel mentions, or channel IDs.', 'error')], ephemeral: true });
    }
    if (!durationMs) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid duration', 'Use a duration such as `7d`, `30 days`, or `12h` (up to 365 days).', 'error')], ephemeral: true });
    }
    if (!intervalMs) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid posting interval', 'Enter a whole number of hours such as `1h` or `6hr` (from 1 hour up to 365 days).', 'error')], ephemeral: true });
    }

    const channels = [];
    for (const channelId of channelIds) {
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        return interaction.reply({ embeds: [createResponseEmbed('Invalid channel', `Channel ${channelId} is not an accessible text channel in this server.`, 'error')], ephemeral: true });
      }
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages])) {
        return interaction.reply({ embeds: [createResponseEmbed('Missing permissions', `I need View Channel, Send Messages, and Manage Messages in <#${channelId}>.`, 'error')], ephemeral: true });
      }
      channels.push(channel);
    }

    await interaction.deferReply({ ephemeral: true });
    const campaign = await createAutoAd({
      guildId: interaction.guildId,
      creatorId: interaction.user.id,
      description,
      channelIds: channels.map((channel) => channel.id),
      durationMs,
      intervalMs,
    });
    await processAutoAds(interaction.client);
    return interaction.editReply({
      embeds: [createResponseEmbed('Auto ad created', `ID: **${campaign.id}**\nPosting to ${channels.map((channel) => `${channel}`).join(', ')} immediately and every ${formatInterval(campaign.intervalMs)}. It ends <t:${Math.floor(campaign.expiresAt / 1000)}:R>.`, 'success')],
    });
  },
};

function formatInterval(intervalMs) {
  const hours = (intervalMs ?? DEFAULT_AUTO_AD_INTERVAL_MS) / (60 * 60_000);
  return `${hours}h`;
}
