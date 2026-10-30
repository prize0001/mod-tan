import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { removeAdWarning } from '../store/ad-warnings.js';
import { createResponseEmbed } from '../utils/response-embed.js';

export default {
  data: new SlashCommandBuilder()
    .setName('adwarningremove')
    .setDescription('Remove a saved advertisement warning by its code.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) => option
      .setName('code')
      .setDescription('Warning code, for example cs78gf or adwarn cs78gf')
      .setMaxLength(40)
      .setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        embeds: [createResponseEmbed('Permission required', 'You need Manage Messages permission to remove advertisement warnings.', 'error')],
        ephemeral: true,
      });
    }

    const code = interaction.options.getString('code', true);
    const warning = await removeAdWarning(code, interaction.guildId);
    if (!warning) {
      return interaction.reply({
        embeds: [createResponseEmbed('Warning not found', 'No saved advertisement warning matches that code in this server.', 'error')],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [createResponseEmbed('Warning removed', `Advertisement warning \`${warning.code}\` for <@${warning.userId}> was removed.`, 'success')],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
