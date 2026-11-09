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
        value: '`=ping` or `/ping` checks bot response.\n`=ban <user ID> <reason>`, `=left <user ID>`, `=kick <user ID> <reason>`, `/kick`, `/warn`, `/timeout`, and `/clear` are staff tools.\n`/adlookup`, `/adwarningremove`, `/adwarns`, `=adwarningremove`, `=warns`, and `=warnremove` manage warning records. `=ad` issues a warning to an ad message.\n`=bump` logs a bump; `=bumps` and `=lb` show stats. `=bumpsadd` and `=warnsad` manually adjust stats.\n`/autoad` manages recurring ads; `/stickyad` manages sticky ads.\nStaff-command access is based on roles in Staff Hub (884251376157339718). The bot also needs its own Discord permissions to perform moderation actions.',
        inline: false, false,
      });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
