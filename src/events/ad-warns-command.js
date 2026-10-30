import { PermissionFlagsBits } from 'discord.js';
import { getAdWarningsForUser } from '../store/ad-warnings.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { sendAdWarningHistory } from '../utils/ad-warning-history.js';

const prefix = process.env.BOT_PREFIX ?? '=';

export async function handleAdWarnsMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, userInput] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'adwarns') return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.channel.send('You need Manage Messages permission to look up ad warnings.');
    return;
  }

  const userId = parseUserId(userInput ?? '');
  if (!userId) {
    await message.channel.send(`Usage: \`${prefix}adwarns @user\``);
    return;
  }

  const warnings = await getAdWarningsForUser(message.guildId, userId);
  await sendAdWarningHistory(message.channel, userId, warnings);
}
