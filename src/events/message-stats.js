import { EmbedBuilder } from 'discord.js';
import { getMessageStats, recordMessage } from '../store/message-counts.js';
import { parseUserId } from '../utils/parse-user-id.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const targetGuildId = '852771975730298880';
const trackedChannelIds = new Set([
  '852808187333181450',
  '1568426323536379944',
  '1320273681477402734',
  '1294528337653399583',
]);

export async function handleMessageStatsMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;

  if (message.content.startsWith(prefix)) {
    const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (commandName?.toLowerCase() === 'messages') {
      if (message.guildId !== targetGuildId) {
        await message.channel.send('The =messages command is only available in the configured AYS server.');
        return;
      }

      const userId = parseUserId(args[0] ?? '');
      if (!userId || args.length !== 1) {
        await message.channel.send('Usage: ' + prefix + 'messages <user ID>.');
        return;
      }

      const stats = await getMessageStats(targetGuildId, userId);
      const trend = stats.trend > 0
        ? '▲ +' + stats.trend
        : stats.trend < 0
          ? '▼ ' + stats.trend
          : '— no change';
      const rank = stats.rank === null ? 'Unranked' : '#' + stats.rank + ' of ' + stats.participants;
      const embed = new EmbedBuilder()
        .setColor(0x269EC1)
        .setTitle('AYS Message Stats')
        .setDescription([
          '**User:** <@' + userId + '> (' + userId + ')',
          '',
          '**This Week (' + formatWeek(stats.weekKeys.thisWeek) + '):** **' + stats.thisWeek + '**',
          '**Last Week (' + formatWeek(stats.weekKeys.lastWeek) + '):** **' + stats.lastWeek + '**',
          '**Trend:** ' + trend,
          '**Weekly Rank:** ' + rank,
        ].join('\n'));

      await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
  }

  if (message.guildId === targetGuildId && trackedChannelIds.has(message.channelId)) {
    await recordMessage(targetGuildId, message.author.id);
  }
}

function formatWeek(weekStart) {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return formatter.format(start) + ' – ' + formatter.format(end);
}
