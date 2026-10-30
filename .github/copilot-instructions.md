# Project Guidance

- This workspace contains a JavaScript Discord moderation bot using ES modules and discord.js.
- Keep bot credentials in `.env`; never hard-code or log tokens. `.env.example` may contain placeholders only.
- Keep slash commands in `src/commands/`; `npm run deploy-commands` registers them for every comma-separated guild ID in `GUILD_IDS`.
- Check caller permissions and bot/target eligibility before moderation actions.
- Validate changed JavaScript with `node --check` and run relevant tests when available.
- Do not start the bot unless the user explicitly asks; starting requires valid Discord credentials.
