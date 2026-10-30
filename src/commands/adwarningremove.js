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

const prefix = process.env.BOT_PREFIX ?? '=';

export async function handleAdWarningRemoveMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'adwarningremove') return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
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

  const warning = await removeAdWarning(codeInput, message.guildId);
  if (!warning) {
    await message.channel.send({
      embeds: [createResponseEmbed('Warning not found', 'No saved advertisement warning matches that code in this server.', 'error')],
    });
    return;
  }

  await message.channel.send({
    embeds: [createResponseEmbed('Warning removed', `Advertisement warning \`${warning.code}\` for <@${warning.userId}> was removed.`, 'success')],
    allowedMentions: { parse: [] },
  });
}
