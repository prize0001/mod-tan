import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { issueAdWarning } from '../utils/issue-ad-warning.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasRequiredCommandRole } from '../utils/command-role-access.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Ad Warning')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [createResponseEmbed('Permission required', 'You need Manage Messages permission to issue an advertisement warning.', 'error')],
        ephemeral: true,
      });
    }

    if (!hasRequiredCommandRole(interaction)) {
      return interaction.reply({
        embeds: [createResponseEmbed('Permission required', 'You need the authorized role to delete advertisements in this server.', 'error')],
        ephemeral: true,
      });
    }

    const target = interaction.targetMessage;
    const modal = new ModalBuilder()
      .setCustomId(`adwarn:${interaction.user.id}:${interaction.guildId}:${target.channelId}:${target.id}`)
      .setTitle('Issue Advertisement Warning')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason for warning')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(400)
          .setRequired(true),
      ));

    await interaction.showModal(modal);
  },
};

export async function handleAdWarningModalSubmit(interaction) {
  const [, moderatorId, guildId, channelId, messageId] = interaction.customId.split(':');
  if (!interaction.inGuild()
    || interaction.user.id !== moderatorId
    || interaction.guildId !== guildId
    || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    || !hasRequiredCommandRole(interaction)) {
    return interaction.reply({
      embeds: [createResponseEmbed('Permission required', 'This warning form is no longer valid for your account or server.', 'error')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.messages?.fetch) {
      throw new Error('I could not access the selected message channel.');
    }

    const targetMessage = await channel.messages.fetch(messageId);
    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (!reason) throw new Error('A warning reason is required.');

    await issueAdWarning({
      client: interaction.client,
      guild: interaction.guild,
      targetMessage,
      moderatorId: interaction.user.id,
      reason,
    });
    return interaction.deleteReply();
  } catch (error) {
    console.error('Ad Warning context-menu action failed:', error);
    return interaction.editReply({
      embeds: [createResponseEmbed('Warning failed', error.message || 'The warning could not be completed.', 'error')],
      allowedMentions: { parse: [] },
    });
  }
}
