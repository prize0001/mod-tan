import { PermissionFlagsBits } from 'discord.js';
import { removeAdWarning } from '../store/ad-warnings.js';
import { createResponseEmbed } from '../utils/response-embed.js';

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

