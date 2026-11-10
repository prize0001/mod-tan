import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = process.env.MESSAGE_STATS_STORE_PATH ?? join(process.cwd(), 'data', 'message-counts.json');
let writeQueue = Promise.resolve();

function getWeekKeys(date = new Date()) {
  const today = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const thisWeek = new Date(today);
  thisWeek.setUTCDate(thisWeek.getUTCDate() - daysSinceMonday);
  const lastWeek = new Date(thisWeek);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

  return {
    thisWeek: thisWeek.toISOString().slice(0, 10),
    lastWeek: lastWeek.toISOString().slice(0, 10),
  };
}

async function readData() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const data = JSON.parse(await readFile(storePath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Message-count store must contain a JSON object.');
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeData(data) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = storePath + '.' + process.pid + '.tmp';
  const content = JSON.stringify(data, null, 2);
  await writeFile(temporaryPath, content, 'utf8');
  try {
    await rename(temporaryPath, storePath);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    await writeFile(storePath, content, 'utf8');
  }
}

function serializeUpdate(callback) {
  const operation = writeQueue.then(async () => {
    const data = await readData();
    const result = callback(data);
    await writeData(data);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function getUser(data, guildId, userId) {
  data.guilds ??= {};
  data.guilds[guildId] ??= { users: {} };
  data.guilds[guildId].users ??= {};
  data.guilds[guildId].users[userId] ??= { weeks: {} };
  data.guilds[guildId].users[userId].weeks ??= {};
  return data.guilds[guildId].users[userId];
}

export function recordMessage(guildId, userId) {
  return serializeUpdate((data) => {
    const weekKeys = getWeekKeys();
    const user = getUser(data, guildId, userId);
    user.weeks[weekKeys.thisWeek] = (user.weeks[weekKeys.thisWeek] ?? 0) + 1;

    for (const week of Object.keys(user.weeks)) {
      if (week !== weekKeys.thisWeek && week !== weekKeys.lastWeek) delete user.weeks[week];
    }

    return user.weeks[weekKeys.thisWeek];
  });
}

export async function getMessageStats(guildId, userId) {
  await writeQueue;
  const data = await readData();
  const weekKeys = getWeekKeys();
  const users = data.guilds?.[guildId]?.users ?? {};
  const user = users[userId];
  const thisWeek = user?.weeks?.[weekKeys.thisWeek] ?? 0;
  const lastWeek = user?.weeks?.[weekKeys.lastWeek] ?? 0;
  const activeUsers = Object.values(users).filter((entry) => (entry.weeks?.[weekKeys.thisWeek] ?? 0) > 0);
  const rank = thisWeek > 0
    ? 1 + activeUsers.filter((entry) => (entry.weeks?.[weekKeys.thisWeek] ?? 0) > thisWeek).length
    : null;

  return {
    thisWeek,
    lastWeek,
    trend: thisWeek - lastWeek,
    rank,
    participants: activeUsers.length,
    weekKeys,
  };
}