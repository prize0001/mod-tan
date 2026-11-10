import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ActivityType, AuditLogEvent, Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { handleAdWarningModalSubmit } from './commands/ad-warning-context.js';
import { handleAdWarningRemoveMessage } from './commands/adwarningremove.js';
import { handlePingMessage } from './commands/ping.js';
import { handleAdMessage } from './events/message-create.js';
import { handleAutomodMessage } from './events/automod.js';
import { handleBanMessage } from './events/ban-command.js';
import { handleKickMessage } from './events/kick-command.js';
import { handleWarnMessage } from './events/warn-command.js';
import { handleWarnsMessage } from './events/warns-command.js';
import { handleWarnRemoveMessage } from './events/warn-remove-command.js';
import { handleLeftMessage } from './events/left-command.js';
import { handleBumpMessage } from './events/bump-command.js';
import { handleAdCounterMessage } from './events/ad-counter.js';
import { handleAdDeletionStatsMessage } from './events/ad-deletion-stats.js';
import { handleMessageStatsMessage } from './events/message-stats.js';
import { handleAdWarnsMessage } from './events/ad-warns-command.js';
import { startAutoAdScheduler } from './utils/auto-ad-scheduler.js';
import { createResponseEmbed } from './utils/response-embed.js';
import { logModerationAction } from './utils/log-moderation-action.js';

const requiredEnvironment = ['DISCORD_TOKEN'];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const botPrefix = process.env.BOT_PREFIX ?? '=';

function isPrefixCommand(message, commandNames) {
  if (!message.guild || !message.content.startsWith(botPrefix)) return false;
  const commandName = message.content.slice(botPrefix.length).trim().split(/\s+/)[0]?.toLowerCase();
  return commandNames.includes(commandName);
}

if (missingEnvironment.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missingEnvironment.join(', ')}`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildModeration, GatewayIntentBits.MessageContent],
});
client.commands = new Collection();

const commandsDirectory = join(fileURLToPath(new URL('.', import.meta.url)), 'commands');
const commandFiles = await readdir(commandsDirectory, { recursive: true });

for (const file of commandFiles.filter((entry) => entry.endsWith('.js'))) {
  const command = (await import(pathToFileURL(join(commandsDirectory, file)))).default;
  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  startAutoAdScheduler(readyClient);
  for (const command of client.commands.values()) {
    try {
      await command.onReady?.(readyClient);
    } catch (error) {
      console.error(`Command startup hook failed for /${command.data.name}:`, error);
    }
  }
  readyClient.user.setPresence({
    activities: [{ name: 'AYS', type: ActivityType.Watching }],
    status: 'online',
  });
  console.log(`Ready as ${readyClient.user.tag}. Loaded ${client.commands.size} command(s).`);
});

client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  if (entry.action !== AuditLogEvent.MemberBanAdd || !entry.targetId) return;
  // Bot-issued commands already log their action with the command's specific reason.
  if (entry.executorId && entry.executorId === client.user?.id) return;

  try {
    const [moderator, targetUser] = await Promise.all([
      entry.executorId ? client.users.fetch(entry.executorId).catch(() => null) : Promise.resolve(null),
      client.users.fetch(entry.targetId).catch(() => null),
    ]);
    await logModerationAction({
      client,
      guild,
      action: 'User banned',
      moderator,
      targetUser,
      targetId: entry.targetId,
      targetLabel: `User ${entry.targetId}`,
      reason: entry.reason || 'No reason provided',
    });
  } catch (error) {
    console.error(`Could not log ban for user ${entry.targetId} in ${guild.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith('adwarn:')) return;

    try {
      await handleAdWarningModalSubmit(interaction);
    } catch (error) {
      console.error('Advertisement warning modal failed:', error);
      const response = {
        embeds: [createResponseEmbed('Warning failed', 'The warning could not be completed. Check the bot permissions and try again.', 'error')],
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(console.error);
      } else {
        await interaction.reply(response).catch(console.error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const response = {
      embeds: [createResponseEmbed('Command failed', 'The command could not be completed. Check the bot permissions and try again.', 'error')],
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(console.error);
    } else {
      await interaction.reply(response).catch(console.error);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleMessageStatsMessage(message);
  } catch (error) {
    console.error('Message stats handler failed:', error);
    if (isPrefixCommand(message, ['messages'])) {
      await message.channel.send({
        embeds: [createResponseEmbed('Message stats unavailable', 'I could not read or save message stats. Check the bot console for the storage error.', 'error')],
      }).catch(console.error);
    }
  }

  try {
    await handleAutomodMessage(message);
  } catch (error) {
    console.error('Automod message handler failed:', error);
  }

  try {
    await handlePingMessage(message);
  } catch (error) {
    console.error('Prefix ping command failed:', error);
  }

  try {
    await handleAdMessage(message);
  } catch (error) {
    console.error('Advertisement command failed:', error);
  }

  try {
    await handleBanMessage(message);
  } catch (error) {
    console.error('Prefix ban command failed:', error);
  }

  try {
    await handleKickMessage(message);
  } catch (error) {
    console.error('Prefix kick command failed:', error);
  }

  try {
    await handleWarnMessage(message);
  } catch (error) {
    console.error('Prefix warn command failed:', error);
  }

  try {
    await handleWarnsMessage(message);
  } catch (error) {
    console.error('Prefix warns command failed:', error);
  }

  try {
    await handleWarnRemoveMessage(message);
  } catch (error) {
    console.error('Prefix warn-remove command failed:', error);
  }

  try {
    await handleLeftMessage(message);
  } catch (error) {
    console.error('Prefix softban command failed:', error);
  }

  try {
    await handleBumpMessage(message);
  } catch (error) {
    console.error('Bump command failed:', error);
    if (isPrefixCommand(message, ['bump', 'bumps', 'bumpsadd'])) {
      await message.channel.send({
        embeds: [createResponseEmbed('Bump command failed', 'I could not read or save bump stats. Check the bot console for the storage error.', 'error')],
      }).catch(console.error);
    }
  }

  try {
    await handleAdDeletionStatsMessage(message);
  } catch (error) {
    console.error('Ad-deletion stats command failed:', error);
    if (isPrefixCommand(message, ['lb', 'warnsad'])) {
      await message.channel.send({
        embeds: [createResponseEmbed('Ad stats lookup failed', 'I could not read ad-deletion stats. Check the bot console for the storage error.', 'error')],
      }).catch(console.error);
    }
  }

  try {
    await handleAdWarnsMessage(message);
  } catch (error) {
    console.error('Ad-warning history command failed:', error);
  }

  try {
    await handleAdWarningRemoveMessage(message);
  } catch (error) {
    console.error('Ad-warning removal command failed:', error);
  }

  try {
    await handleAdCounterMessage(message);
  } catch (error) {
    console.error(`Sticky message refresh failed in channel ${message.channelId}:`, error);
  }

  for (const command of client.commands.values()) {
    if (typeof command.onMessage !== 'function') continue;
    try {
      await command.onMessage(message);
    } catch (error) {
      console.error(`Message hook failed for /${command.data.name}:`, error);
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log(`Received ${signal}; shutting down.`);
    client.destroy();
    process.exit(0);
  });
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Unable to log in to Discord. Check DISCORD_TOKEN.', error);
  process.exitCode = 1;
});

