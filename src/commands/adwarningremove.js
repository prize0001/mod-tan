import { SlashCommandBuilder } from 'discord.js';
import { removeAdWarning } from '../store/ad-warnings.js';
import { createResponseEmbed } from '../utils/response-embed.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

export default {
  data: new SlashCommandBuilder()
    .setName('adwarningremove')
    .setDescription('Remove a warning by code from any configured server.')
    .setDefaultMemberPermissions(null)
    .addStringOption((option) => option
      .setName('code')
      .setDescription('Warning code, for example cs78gf or adwarn cs78gf')
      .setMaxLength(40)
      .setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild() || !(await hasStaffHubRole(interaction.client, interaction.user.id, 'adWarnings'))) {
      return interaction.reply({
        embeds: [createResponseEmbed('Permission required', 'You need an authorized Staff Hub role to remove advertisement warnings.', 'error')],
        ephemeral: true,
      });
    }

    const code = interaction.options.getString('code', true);
    const warning = await removeAdWarning(code);
    if (!warning) {
      return interaction.reply({
        embeds: [createResponseEmbed('Warning not found', 'No saved advertisement warning matches that code in the configured servers.', 'error')],
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [createResponseEmbed('Warning removed', `Advertisement warning \`${warning.code}\` for <@${warning.userId}> was removed from server \`${warning.guildId}\`.`, 'success')],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};

const prefix = process.env.BOT_PREFIX ?? '=';

export async function handleAdWarningRemoveMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'adwarningremove') return;

  if (!(await hasStaffHubRole(message.client, message.author.id, 'adWarnings'))) {
    await message.channel.send({
      embeds: [createResponseEmbed('Permission required', 'You need Manage Messages permission to remove advertisement warnings.', 'error')],
    });
    return;
  }

  const codeInput = args.join(' ').trim();
  if (!codeInput) {
    await message.channel.send({
      embeds: [createResponseEmbed('Usage', `Use \`${prefix}adwarningremove <code>\`.`, 'error')],
    });
    return;
  }

  const warning = await removeAdWarning(codeInput);
  if (!warning) {
    await message.channel.send({
      embeds: [createResponseEmbed('Warning not found', 'No saved advertisement warning matches that code in the configured servers.', 'error')],
    });
    return;
  }

  await message.channel.send({
    embeds: [createResponseEmbed('Warning removed', `Advertisement warning \`${warning.code}\` for <@${warning.userId}> was removed from server \`${warning.guildId}\`.`, 'success')],
    allowedMentions: { parse: [] },
  });
}
