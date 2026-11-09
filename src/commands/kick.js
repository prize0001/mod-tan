import { SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remove a member from this server.')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('user').setDescription('User ID or mention').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild() || !(await hasStaffHubRole(interaction.client, interaction.user.id, 'moderation'))) {
      return interaction.reply({ embeds: [createResponseEmbed('Permission required', 'You need an authorized Staff Hub role to use this command.', 'error')], ephemeral: true });
    }

    const targetUserId = parseUserId(interaction.options.getString('user', true));
    if (!targetUserId) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')], ephemeral: true });
    }

    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const target = await interaction.guild.members.fetch(targetUserId).catch(() => null);

    if (!target) {
      return interaction.reply({ embeds: [createResponseEmbed('Kick unavailable', 'That user is not a member of this server.', 'error')], ephemeral: true });
    }
    if (!target.kickable) {
      return interaction.reply({ embeds: [createResponseEmbed('Kick unavailable', 'I cannot kick that member. Check role hierarchy and bot permissions.', 'error')], ephemeral: true });
    }

    await target.kick(reason);
    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'Member kicked',
      moderator: interaction.user,
      targetUser: target.user,
      targetId: target.user.id,
      reason,
    });
    await interaction.reply({
      embeds: [createResponseEmbed('Member kicked', `${target.user.tag} was kicked.`, 'success')],
      ephemeral: true,
    });
  },
};
