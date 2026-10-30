import { EmbedBuilder } from 'discord.js';

const alternateAppealGuildId = '771235990664118272';
const reviewChannelByGuild = {
  '852771975730298880': '1291602781404401805',
  '771235990664118272': '1339457990247579739',
};

export function createAdWarningEmbed(warning) {
  const reason = warning.reason.length > 700 ? `${warning.reason.slice(0, 697)}...` : warning.reason;
  const details = [
    `<:mm_dot:1402737072032190504> **Moderator |** <@${warning.moderatorId}>`,
    `<:mm_dot:1402737072032190504> **User |** <@${warning.userId}> (\`${warning.userId}\`)`,
    `<:mm_dot:1402737072032190504> **Channel |** <#${warning.channelId}>`,
    `<:mm_dot:1402737072032190504> **Reason |** ${reason}`,
    '',
    `<:mm_dot:1402737072032190504> **Current Warnings |** \`${warning.warningCount}\``,
    `<:mm_dot:1402737072032190504> **Ad Code |** \`${warning.code}\``,
  ].join('\n');
  const reviewChannelId = reviewChannelByGuild[warning.guildId];
  const appealText = reviewChannelId
    ? `<:NetworkLogo:1402732624551612436> Please review <#${reviewChannelId}>.`
    : warning.guildId === alternateAppealGuildId
    ? 'If you feel like this was a mistake please message <@941861376236879912>'
    : 'If you feel like this is incorrect, message <@860584522290167825>.';

  return new EmbedBuilder()
    .setColor(0x2CA8C2)
    .setTitle('<:mm_x:1402734965204189348> Advertisement Deletion <:mm_x:1402734965204189348>')
    .setDescription(`${details}\n\n${appealText}`)
    .setTimestamp(new Date(warning.createdAt));
}
