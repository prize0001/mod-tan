import { SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const sevenDaysInSeconds = 7 * 24 * 60 * 60;
const allowedRoleIds = ['852778343908900896', '852778216464973844'];

export default {
  data: new SlashCommandBuilder()
    .setName('left')
    .setDescription('Ban and unban a user, deleting their messages from the last 7 days.')
    .addStringOption((option) => option.setName('user').setDescription('User ID or mention; user may have left the server').setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createResponseEmbed('Unavailable here', 'This command can only be used in a server.', 'error')], ephemeral: true });
    }
    if (!allowedRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId))) {
      return interaction.reply({ embeds: [createResponseEmbed('Permission required', 'You need the authorized role to use this command.', 'error')], ephemeral: true });
    }

    const targetId = parseUserId(interaction.options.getString('user', true));
    if (!targetId) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')], ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [createResponseEmbed('Softban unavailable', 'I cannot ban that member. Check role hierarchy and bot permissions.', 'error')], ephemeral: true });
    }
    const targetUser = member?.user ?? await interaction.client.users.fetch(targetId).catch(() => null);

    const reason = 'User left';
    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.guild.members.ban(targetId, { reason, deleteMessageSeconds: sevenDaysInSeconds });
    } catch (error) {
      console.error('Softban deletion step failed:', error);
      return interaction.editReply({ embeds: [createResponseEmbed('Softban failed', 'The member could not be banned. Check the bot permissions and try again.', 'error')] });
    }

    try {
      await interaction.guild.members.unban(targetId, reason);
    } catch (error) {
      await logModerationAction({
        client: interaction.client,
        guild: interaction.guild,
        action: 'Member softbanned (unban failed)',
        moderator: interaction.user,
        targetUser,
        targetId,
        targetLabel: targetUser?.username ?? `User ${targetId}`,
        reason: `${reason} | Unban failed: ${error.message}`,
      });
      console.error('Softban unban step failed:', error);
      return interaction.editReply({ embeds: [createResponseEmbed('Unban failed', `${targetUser?.tag ?? targetId} was banned and their messages from the last 7 days were deleted, but I could not unban them. They may still be banned; check the server ban list.`, 'error')] });
    }

    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'Member softbanned',
      moderator: interaction.user,
      targetUser,
      targetId,
      targetLabel: targetUser?.username ?? `User ${targetId}`,
      reason,
    });
    return interaction.editReply({
      content: `🔨 Banned \`${targetId}\` indefinitely\n\n🔓 Unbanned \`${targetId}\``,
      embeds: [],
      allowedMentions: { parse: [] },
    });
  },
};
