import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available bot commands.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x4169E1)
      .setTitle('Bot Commands')
      .setDescription('Moderation and community tools available here.')
      .addFields({
        name: 'Commands',
        value: '`=ping` or `/ping` checks bot response.\n`=left <user ID>` or `/left <user ID>` bans then unbans the user, deleting their messages from the last 7 days (role 852778343908900896 or 852778216464973844 required). The user may have left the server.\n`/adlookup <code>` posts a saved ad warning embed publicly; `=adwarningremove <code>` or `/adwarningremove <code>` removes it. Both require Manage Messages.\n`=adwarns @user` or `/adwarns user:@user` lists ad-warning codes and reasons in this server (Manage Messages required).\n`=warns <user ID>` lists that user’s warnings issued with `=warn` in this server (Manage Messages required); `=warnremove <case ID>` removes one (role 852778233275613235 required).\n`=bump` logs your bump; `=bumps` shows your stats in this server, and `=bumps <user ID>` looks up someone else in this server. `=bumpsadd <user ID> <number>` manually adds bumps in this server (only user 749008764300165192 can use it).\n`=lb <user ID>` shows combined ad-deletion stats across servers. `=warnsad <user ID> <number>` adds manual ad-deletion counts for `=lb` (only user 749008764300165192 can use it).\n`/autoad create`, `/autoad list`, and `/autoad remove` require the authorized auto-ad role. `/stickyad create message channels duration` creates a sticky ad; `/stickyad list` shows active ads; `/stickyad remove id` stops one. Sticky ads are limited to server 852771975730298880 and require role 1115815957802258434.\nAd Counter messages refresh in configured channels.',
        inline: false,
      });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
