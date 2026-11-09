import { EmbedBuilder } from 'discord.js';
import { addAdDeletions, getAdDeletionStats } from '../store/ad-deletions.js';
import { parseUserId } from '../utils/parse-user-id.js';
import { hasStaffHubRole } from '../utils/command-role-access.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const alternateBrandGuildId = '771235990664118272';

export async function handleAdDeletionStatsMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, userInput, countInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = commandName?.toLowerCase();

  if (command === 'warnsad') {
    if (!(await hasStaffHubRole(message.client, message.author.id, 'manualAds'))) {
      await message.channel.send('You need the authorized Staff Hub role to add ad-deletion stats.');
      return;
    }

    const userId = parseUserId(userInput ?? '');
    const count = Number(countInput);
    if (!userId || !Number.isSafeInteger(count) || count < 1 || extra.length > 0) {
      await message.channel.send(`Usage: \`${prefix}warnsad <user ID> <positive number>\``);
      return;
    }

    const stats = await addAdDeletions(userId, count);
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x2D9C70)
        .setTitle('Ad-deletion stats updated')
        .setDescription(`Added **${count}** to <@${userId}>. Their total is now **${stats.allTime}**, with **${stats.thisWeek}** this week.`)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (command !== 'lb') return;

  const userId = parseUserId(userInput ?? '');
  if (!userId || countInput || extra.length > 0) {
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
