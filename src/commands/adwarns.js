import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getAdWarningsForUser } from '../store/ad-warnings.js';
import { buildAdWarningHistoryEmbeds } from '../utils/ad-warning-history.js';

export default {
  data: new SlashCommandBuilder()
    .setName('adwarns')
    .setDescription('Show a user’s saved ad-warning codes and reasons.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('User whose ad warnings to show')
      .setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'You need Manage Messages permission to look up ad warnings.',
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user', true);
    const warnings = await getAdWarningsForUser(interaction.guildId, user.id);
    const embeds = buildAdWarningHistoryEmbeds(user.id, warnings);

    for (let index = 0; index < embeds.length; index += 10) {
      const response = {
        embeds: embeds.slice(index, index + 10),
        allowedMentions: { parse: [] },
      };
      if (index === 0) await interaction.reply(response);
      else await interaction.followUp(response);
    }
  },
};
