import { addAdDeletions } from '../store/ad-deletions.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { createResponseEmbed } from '../utils/response-embed.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const authorizedUserId = '749008764300165192';

export async function handleWarnsadMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, userInput, countInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'warnsad') return;

  if (message.author.id !== authorizedUserId) {
    await message.channel.send({
      embeds: [createResponseEmbed('Permission required', 'Only the authorized account can add ad-deletion stats.', 'error')],
    });
    return;
  }

  const userId = parseUserId(userInput ?? '');
  const count = Number(countInput);
  if (!userId || !Number.isSafeInteger(count) || count < 1 || extra.length > 0) {
    await message.channel.send({
      embeds: [createResponseEmbed('Usage', `Use \`${prefix}warnsad <user ID> <number>` with a positive whole number.`, 'error')],
    });
    return;
  }

  const stats = await addAdDeletions(userId, count);
  await message.channel.send({
    embeds: [createResponseEmbed(
      'Ad-deletion stats updated',
      `Added **${count}** to <@${userId}>. Their total is now **${stats.allTime}**, with **${stats.thisWeek}** this week.`,
      'success',
    )],
    allowedMentions: { parse: [] },
  });
}
