import { EmbedBuilder } from 'discord.js';
import { getAdDeletionStats } from '../store/ad-deletions.js';
import { parseUserId } from '../utils/parse-user-id.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const alternateBrandGuildId = '771235990664118272';

export async function handleAdDeletionStatsMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, userInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  if (commandName?.toLowerCase() !== 'lb') return;

  const userId = parseUserId(userInput ?? '');
  if (!userId || extra.length > 0) {
    await message.channel.send(`Usage: \`${prefix}lb <user ID or mention>\``);
    return;
  }

  const stats = await getAdDeletionStats(userId);
  const trend = stats.trend > 0
    ? `▲ +${stats.trend}`
    : stats.trend < 0
      ? `▼ ${stats.trend}`
      : '— no change';
  const rank = stats.rank === null ? 'Unranked' : `#${stats.rank} of ${stats.participants}`;
  const embed = new EmbedBuilder()
    .setColor(0x269EC1)
    .setTitle(`${message.guildId === alternateBrandGuildId ? 'AYC' : 'AYS'} Ad Deletion Stats`)
    .setDescription([
      `**User:** <@${userId}>`,
      '',
      `**This Week (${formatWeek(stats.weekKeys.thisWeek)}):** \`${stats.thisWeek}\``,
      `**Last Week (${formatWeek(stats.weekKeys.lastWeek)}):** \`${stats.lastWeek}\``,
      `**Trend:** ${trend}`,
      `**Weekly Rank:** ${rank}`,
      '',
      `**This Month (${stats.weekKeys.month}):** \`${stats.thisMonth}\``,
      `**All-Time:** \`${stats.allTime}\``,
    ].join('\n'));

  await message.channel.send({ embeds: [embed] });
}

function formatWeek(weekStart) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
