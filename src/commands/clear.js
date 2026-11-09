import { SlashCommandBuilder } from 'discord.js';
import { logModerationAction } from '../utils/log-moderation-action.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete recent messages in this channel.')
    .setDefaultMemberPermissions(null)
    .addIntegerOption((option) => option.setName('amount').setDescription('Number of messages to delete (1 to 100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addStringOption((option) => option.setName('user').setDescription('Optional user ID or mention to filter messages').setRequired(false)),
  async execute(interaction) {
    if (!interaction.inGuild() || !(await hasStaffHubRole(interaction.client, interaction.user.id, 'banLeft'))) {
      return interaction.reply({ embeds: [createResponseEmbed('Permission required', 'You need an authorized Staff Hub role to use this command.', 'error')], ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount', true);
    const userInput = interaction.options.getString('user');
    const targetUserId = userInput ? parseUserId(userInput) : null;
    if (userInput && !targetUserId) {
      return interaction.reply({ embeds: [createResponseEmbed('Invalid user', 'Enter a valid user ID or mention.', 'error')], ephemeral: true });
    }

    const messages = targetUserId
      ? (await interaction.channel.messages.fetch({ limit: 100 }))
        .filter((message) => message.author.id === targetUserId)
        .first(amount)
      : amount;
    const deleted = await interaction.channel.bulkDelete(messages, true);
    const targetUser = targetUserId
      ? await interaction.client.users.fetch(targetUserId).catch(() => null)
      : null;
    const reason = targetUserId
      ? `Deleted ${deleted.size} message(s) from user ${targetUserId} in #${interaction.channel.name}`
      : `Deleted ${deleted.size} message(s) from #${interaction.channel.name}`;
    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      action: 'Messages cleared',
      moderator: interaction.user,
      targetUser,
      targetId: targetUserId ?? interaction.channelId,
      targetLabel: targetUserId ? `User ${targetUserId}` : `#${interaction.channel.name} message purge`,
      reason,
    });
    await interaction.reply({
      embeds: [createResponseEmbed('Messages cleared', `${deleted.size} message(s) were deleted.`, 'success')],
      ephemeral: true,
    });
  },
};
