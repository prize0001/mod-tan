import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a server member by DM.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((option) => option
      .setName('user')
      .setDescription('User ID or mention')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the warning')
      .setMaxLength(400)
      .setRequired(true)),
  async execute(interaction) {
    const userId = parseUserId(interaction.options.getString('user', true));
    if (!userId) {
      return interaction.reply({
        embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')],
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply({
        embeds: [createResponseEmbed('Member not found', 'The user must be a member of this server to be warned.', 'error')],
        ephemeral: true,
      });
    }

    const reason = interaction.options.getString('reason', true).trim();
    if (!reason) {
      return interaction.reply({
        embeds: [createResponseEmbed('Reason required', 'Enter a reason for the warning.', 'error')],
        ephemeral: true,
      });
    }

    let dmSent = true;
    try {
      await member.send({
        embeds: [createResponseEmbed(
          'You have been warned',
          `Hello ${member.user.username}, you have been warned in ${interaction.guild.name} for: ${reason}`,
          'error',
        )],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      dmSent = false;
      console.warn(`Could not DM warning to user ${userId}:`, error);
    }

    const record = await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'Member warned',
      moderator: interaction.user,
      targetUser: member.user,
      targetId: member.user.id,
      reason,
    });

    const description = dmSent
      ? `${member.user.tag} was warned.${record ? ` Case ID: ${record.caseId}.` : ''}`
      : `${member.user.tag} was warned and logged, but their DMs are unavailable.${record ? ` Case ID: ${record.caseId}.` : ''}`;

    return interaction.reply({
      embeds: [createResponseEmbed('Warning issued', description, dmSent ? 'success' : 'error')],
      ephemeral: true,
    });
  },
};