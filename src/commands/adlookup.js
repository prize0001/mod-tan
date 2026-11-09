import { SlashCommandBuilder } from 'discord.js';
import { findAdWarning } from '../store/ad-warnings.js';
import { createAdWarningEmbed } from '../utils/ad-warning-embed.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

export default {
  data: new SlashCommandBuilder()
    .setName('adlookup')
    .setDescription('Search configured servers for a saved advertisement warning by code.')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName('code')
      .setDescription('Warning code, for example cs78gf or adwarn cs78gf')
      .setMaxLength(40)
      .setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild() || !(await hasStaffHubRole(interaction.client, interaction.user.id, 'adWarnings'))) {
      return interaction.reply({
        embeds: [createResponseEmbed('Permission required', 'You need an authorized Staff Hub role to look up advertisement warnings.', 'error')],
        ephemeral: true,
      });
    }

    const code = interaction.options.getString('code', true);
    const warning = await findAdWarning(code);

    if (!warning) {
      return interaction.reply({
        embeds: [createResponseEmbed('Warning not found', 'No saved advertisement warning matches that code.', 'error')],
        ephemeral: true,
      });
    }

    const sourceServer = interaction.client.guilds.cache.get(warning.guildId)?.name ?? 'Unknown server';
    const embed = createAdWarningEmbed(warning).addFields({
      name: 'Server',
      value: sourceServer + ' (' + warning.guildId + ')',
    });

    return interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
