import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_IDS } = process.env;
const guildIds = GUILD_IDS?.split(',').map((guildId) => guildId.trim()).filter(Boolean) ?? [];
const missing = Object.entries({ DISCORD_TOKEN, CLIENT_ID, GUILD_IDS })
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
}

if (guildIds.length < 2 || new Set(guildIds).size !== guildIds.length) {
  throw new Error('Set GUILD_IDS to at least two unique, comma-separated server IDs.');
}

const commandsDirectory = fileURLToPath(new URL('../src/commands/', import.meta.url));
const commandFiles = await readdir(commandsDirectory);
const commands = [];

for (const file of commandFiles.filter((entry) => entry.endsWith('.js'))) {
  const command = (await import(pathToFileURL(join(commandsDirectory, file)))).default;
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

for (const guildId of guildIds) {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`Registered ${commands.length} command(s) in guild ${guildId}.`);
}
