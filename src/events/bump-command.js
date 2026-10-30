import { EmbedBuilder } from 'discord.js';
import { addBumps, getBumpStats, recordBump } from '../store/bumps.js';
import { hasRequiredCommandRole } from '../utils/command-role-access.js';
import { parseUserId } from '../utils/parse-user-id.js';

const prefix = process.env.BOT_PREFIX ?? '=';
const alternateBrandGuildId = '771235990664118272';
const manualBumpUserId = '749008764300165192';

export async function handleBumpMessage(message) {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const [commandName, requestedUserInput, ...extra] = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = commandName?.toLowerCase();

  if (command === 'bumpsadd') {
    if (message.author.id !== manualBumpUserId) {
      await message.channel.send('Only the authorized account can manually add bump stats.');
      return;
    }

    const userId = parseUserId(requestedUserInput ?? '');
    const count = Number(extra[0]);
    if (!userId || !Number.isSafeInteger(count) || count < 1 || extra.length !== 1) {
      await message.channel.send(`Usage: \`${prefix}bumpsadd <user ID> <positive number>\``);
      return;
    }

    const stats = await addBumps(userId, message.guildId, count);
    await message.channel.send(`Added \`${count}\` bumps for <@${userId}> in this server. This week: \`${stats}\``);
    return;
  }

  if (command === 'bump') {
    if (!hasRequiredCommandRole(message)) {
      await message.channel.send('You need the authorized role to use the bump command.');
      return;
    }

    const count = await recordBump(message.author.id, message.guildId);
    await message.channel.send(`Bump logged. This week: \`${count}\``);
    return;
  }

  if (command !== 'bumps') return;
  const userId = requestedUserInput ? parseUserId(requestedUserInput) : message.author.id;
  if (!userId || extra.length > 0) {
    await message.channel.send(`Usage: \`${prefix}bumps [user ID]\``);
    return;
  }

  const stats = await getBumpStats(userId, message.guildId);

  const trend = stats.trend > 0
    ? `▲ +${stats.trend}`
    : stats.trend < 0
      ? `▼ ${stats.trend}`
      : '→ 0';
  const embed = new EmbedBuilder()
    .setColor(0x2CA8C2)
    .setTitle(`${message.guildId === alternateBrandGuildId ? 'AYC' : 'AYS'} Bump Stats`)
    .setDescription([
      `**User:** <@${userId}>`,
      '',
      `**This Week (${formatWeek(stats.weekKeys.thisWeek)}):** \`${stats.thisWeek}\``,
      `**Last Week (${formatWeek(stats.weekKeys.lastWeek)}):** \`${stats.lastWeek}\``,
      `**Trend:** ${trend}`,
      `**Weekly Rank:** ${stats.rank === null ? 'Unranked' : `#${stats.rank} of ${stats.participants}`}`,
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
