import { SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Prevent a member from interacting temporarily.')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option.setName('user').setDescription('User ID or mention').setRequired(true))
    .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout duration (1 to 40320 minutes)').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout').setMaxLength(400).setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild() || !(await hasStaffHubRole(interaction.client, interaction.user.id, 'timeout'))) {
      return interaction.reply({ embeds: [createResponseEmbed('Permission required', 'You need an authorized Staff Hub role to use this command.', 'error')], ephemeral: true });
    }

    const targetUserId = parseUserId(interaction.options.getString('user', true));
    if (!targetUserId) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')], ephemeral: true });
    }

    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const target = await interaction.guild.members.fetch(targetUserId).catch(() => null);

    if (!target) {
      return interaction.reply({ embeds: [createResponseEmbed('Timeout unavailable', 'That user is not a member of this server.', 'error')], ephemeral: true });
    }
    if (!target.moderatable) {
      return interaction.reply({
        embeds: [createResponseEmbed('Timeout unavailable', 'I cannot timeout that member. Check role hierarchy and bot permissions.', 'error')],
        ephemeral: true,
      });
    }

    await target.timeout(minutes * 60_000, reason);
    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'Member timed out',
      moderator: interaction.user,
      targetUser: target.user,
      targetId: target.user.id,
      reason: `${reason} (${minutes} minute(s))`,
    });
    await interaction.reply({
      embeds: [createResponseEmbed('Member timed out', `${target.user.tag} was timed out for ${minutes} minute(s).`, 'success')],
      ephemeral: true,
    });
  },
};
