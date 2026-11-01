# Discord Moderation Bot

A JavaScript moderation bot using discord.js and guild-scoped slash commands. The bot can run in multiple servers; configure at least two server IDs below to publish commands to both.

## Requirements

- Node.js 20 or newer
- A Discord application and bot created in the Discord Developer Portal

## Setup

1. In the Developer Portal, create an application, add a bot, and copy its bot token. Keep the token private; regenerate it immediately if it is exposed.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `CLIENT_ID` (the application ID), and `GUILD_IDS` to the IDs of the two servers, separated by a comma. Example: `GUILD_IDS=123456789012345678,234567890123456789`. `.env` is ignored by Git.
3. In **Bot > Privileged Gateway Intents**, enable **Message Content Intent** for the `=ad`, `=bump`, `=bumps`, and `=lb` message commands.
4. In **OAuth2 > URL Generator**, select the `bot` and `applications.commands` scopes. Grant only the permissions needed by the commands: View Channels, Send Messages, Read Message History, View Audit Log, Use Application Commands, Kick Members, Ban Members, Moderate Members, and Manage Messages. Invite the bot to both servers using the generated URL. Ensure it can view and send messages in moderation log channel `865343173819629589` and warning channels `1291609464478105661` and `772414258961055764`.
5. In each server, keep the bot's highest role above roles it needs to moderate.
6. Install dependencies with `npm install`.
7. Register commands in both configured servers with `npm run deploy-commands`.
8. Start the bot with `npm start`; use `npm run dev` during development for automatic restarts.

Guild commands usually update quickly and are visible only in the configured servers. Add more comma-separated IDs to `GUILD_IDS` if needed.

## Commands

- `=bumpsadd <user ID> <number>` manually adds bump totals in the current server. Only user `749008764300165192` can use it.
- Reply with `=bump` to log your bump. Use `=bumps` to view your own weekly, monthly, and all-time totals in the current server, or `=bumps <user ID>` to look up someone else in that server. Bump counts persist across restarts; weeks run Sunday through Saturday (UTC). Bump totals and ranks are tracked separately per server.
- `=warnsad <user ID> <number>` manually adds ad-deletion counts used by `=lb`. Only user `749008764300165192` can use it.
- Successful ad deletions through the `=ad <reason>` warning command and the Ad Warning message action are counted for the moderator. Use `=lb <user ID>` to look up combined weekly, monthly, and all-time deletion stats and weekly rank across servers. Weekly counts roll over Monday (UTC); totals persist across restarts.
- In server `852771975730298880`, ad deletion (`=ad` or the Ad Warning action) and `=bump` require role `852778233275613235`. In server `771235990664118272`, they require role `771747709170352139`.
- `/autoad create`, `/autoad list`, and `/autoad remove` require role `1115815957802258434`.
- `/help` shows available bot commands.
- `=ping` or `/ping` checks that the bot is responding.
- `/autoad create description channels duration interval` posts an ad immediately, then repeats at the selected hourly interval such as `1h` or `6hr`, until its duration ends (for example `7d` or `30 days`). Use comma-separated `#channel` names or channel mentions. `/autoad list` shows each ad interval; `/autoad remove id` stops one and deletes its posts. Administrator permission is required. On expiry, the bot removes the ad messages and DMs user `749008764300165192` with the ended ad text.
- `/kick user reason` removes a server member. `user` accepts a raw user ID or mention.
- `/ban user reason` bans a user and deletes their messages from the previous 7 days; `user` accepts a raw user ID or mention, even if they are not in the server.
- `=ban <user ID> <reason>` bans a user by ID and deletes their messages from the previous 7 days. The reason is required, and only members with role `852778343908900896` or `852778216464973844` can use this prefix command.
- `=kick <user ID> <reason>` kicks a server member by ID. The reason is required, and only members with role `852778343908900896` can use this prefix command.
- `=warn <user ID> <reason>` DMs a warning and its reason to a server member. Only members with role `852778233275613235` can use this prefix command.
- `=warns <user ID>` lists warnings issued through `=warn`, including their reasons. The lookup is scoped to the current server and requires Manage Messages.
- `=warnremove <case ID>` removes an active warning issued through `=warn` from that user's warning history. Only members with role `852778233275613235` can use it; removals are recorded in the mod-log channel.
- `=left <user ID>` or `/left user` bans then unbans the user, deleting their messages from the last 7 days. The user may have left the server. Only members with role `852778343908900896` or `852778216464973844` can use it; the bot needs Ban Members and must be above the target if they are still a member.
- `/timeout user minutes reason` applies a timeout for up to 28 days. `user` accepts a raw user ID or mention.
- `/warn user reason` sends a warning embed by DM and creates a moderation case. `user` accepts a raw user ID or mention; the target must be in the server.
- `/clear amount user` deletes 1-100 recent messages; the optional `user` filter accepts a raw user ID or mention. Discord does not allow bulk deletion of messages older than 14 days.
- Right-click a message, open **Apps**, and choose **Ad Warning** to issue a warning through a reason modal.
- `/adlookup code` publicly posts a saved advertisement warning by its six-character code. `=adwarningremove <code>` or `/adwarningremove <code>` removes a saved warning by code. Both removal commands require Manage Messages.
- `=adwarns @user` or `/adwarns user:@user` lists that user's saved warning codes and reasons in the current server. Requires Manage Messages.
- Reply to a message with `=ad <reason>` to delete it and issue an advertisement warning. The bot deletes the moderator's command message and sends no confirmation in that channel. The warning embed is still sent to both configured warning channels. The command requires Manage Messages.

Temporary Ad Counter messages are enabled for the comma-separated channel IDs in `STICKY_CHANNEL_IDS`. When a human posts in one of those channels, the bot posts an embed showing that user's total ads posted, with the number formatted as inline code, then deletes the counter after 6 seconds. The bot needs View Channel, Send Messages, Embed Links, and Manage Messages in each configured channel.

Auto-ad campaigns persist in `data/auto-ads.json`; the scheduler resumes active campaigns after bot restarts.

Warning cases are stored in `data/ad-warnings.json` so lookups survive bot restarts. Ad-warning embeds go to channel `1291609464478105661` in server `852771975730298880` and channel `772414258961055764` in server `771235990664118272`; other servers use `AD_WARNING_CHANNEL_IDS` from `.env` or the default channels. Set `BOT_PREFIX` in `.env` to override the `=` prefix. The ad-warning embeds use the custom blue dot, blue X, and NetworkLogo emojis; the bot must be able to use those emojis in the destination server. All bot responses are embeds. Slash command permissions restrict each moderation command to members with the matching server permission. Discord role hierarchy and the bot's permissions still apply.

Moderation actions, including member warnings, kicks, bans, timeouts, message clears, and softbans, are recorded with persistent case numbers and sent to `MODERATION_LOG_CHANNEL_ID` (default `865343173819629589`) in a consistent embed matching the requested style. Advertisement warnings continue to be posted to their configured warning channels and are not sent to the moderation log channel. Bans by other moderators or bots are also captured from Discord audit logs. The bot needs View Audit Log permission and the Guild Moderation gateway intent enabled in code for those external bans.
