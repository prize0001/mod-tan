import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName('user').setDescription('User ID or mention').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    const targetId = parseUserId(interaction.options.getString('user', true));
    if (!targetId) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')], ephemeral: true });
    }

    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!target) {
      return interaction.reply({
        embeds: [createResponseEmbed('User not found', 'That ID does not belong to a Discord user. Check the ID and try again.', 'error')],
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);

    if (member && !member.bannable) {
      return interaction.reply({
        embeds: [createResponseEmbed('Ban unavailable', 'I cannot ban that member. Check role hierarchy and bot permissions.', 'error')],
        ephemeral: true,
      });
    }

    try {
      await interaction.guild.members.ban(targetId, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
    } catch (error) {
      if (error.code === 10013) {
        return interaction.reply({
          embeds: [createResponseEmbed('User not found', 'Discord could not find a user with that ID. Check the ID and try again.', 'error')],
          ephemeral: true,
        });
      }
      throw error;
    }
    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'User banned',
      moderator: interaction.user,
      targetUser: target,
      targetId,
      targetLabel: target?.globalName ?? target?.username ?? 'Unknown user',
      reason,
    });
    await interaction.reply({
      embeds: [createResponseEmbed('User banned', `${target?.tag ?? targetId} was banned.`, 'success')],
      ephemeral: true,
    });
  },
};
