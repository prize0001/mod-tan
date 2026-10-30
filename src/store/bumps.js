import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = process.env.BUMP_STORE_PATH ?? join(process.cwd(), 'data', 'bumps.json');
let writeQueue = Promise.resolve();

function getPeriodKeys(date = new Date()) {
  const today = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceSunday = today.getUTCDay();
  const thisWeek = new Date(today);
  thisWeek.setUTCDate(thisWeek.getUTCDate() - daysSinceSunday);
  const lastWeek = new Date(thisWeek);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

  return {
    thisWeek: thisWeek.toISOString().slice(0, 10),
    lastWeek: lastWeek.toISOString().slice(0, 10),
    month: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

async function readData() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const stored = JSON.parse(await readFile(storePath, 'utf8'));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      throw new Error('Bump store must contain a JSON object.');
    }
    if (stored.users && typeof stored.users === 'object' && !Array.isArray(stored.users)) {
      const data = { users: {}, legacyUnassigned: stored.legacyUnassigned ?? {} };
      for (const [userId, user] of Object.entries(stored.users)) {
        if (user?.servers && typeof user.servers === 'object' && !Array.isArray(user.servers)) {
          data.users[userId] = user;
        } else if (user && typeof user === 'object') {
          // This older schema combined activity across servers; retain it without misattributing it.
          data.legacyUnassigned[userId] = user;
        }
      }
      return data;
    }

    // Preserve historical per-server records when migrating the oldest schema.
    const data = { users: {}, legacyUnassigned: {} };
    for (const [guildId, server] of Object.entries(stored)) {
      for (const [userId, oldUser] of Object.entries(server?.users ?? {})) {
        const user = data.users[userId] ??= { servers: {} };
        user.servers[guildId] = oldUser;
      }
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return { users: {}, legacyUnassigned: {} };
    throw error;
  }
}

async function writeData(data) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    await rename(temporaryPath, storePath);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    await writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

function serializeUpdate(callback) {
  const operation = writeQueue.then(async () => {
    const data = await readData();
    const result = await callback(data);
    await writeData(data);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function getUser(data, userId, guildId) {
  data.users ??= {};
  data.users[userId] ??= { servers: {} };
  const user = data.users[userId];
  user.servers ??= {};
  user.servers[guildId] ??= { allTime: 0, weeks: {}, months: {} };
  const serverUser = user.servers[guildId];
  serverUser.weeks ??= {};
  serverUser.months ??= {};
  return serverUser;
}

export function recordBump(userId, guildId) {
  return serializeUpdate((data) => {
    const periods = getPeriodKeys();
    const user = getUser(data, userId, guildId);
    user.allTime = (user.allTime ?? 0) + 1;
    user.weeks[periods.thisWeek] = (user.weeks[periods.thisWeek] ?? 0) + 1;
    user.months[periods.month] = (user.months[periods.month] ?? 0) + 1;

    for (const week of Object.keys(user.weeks)) {
      if (week !== periods.thisWeek && week !== periods.lastWeek) delete user.weeks[week];
    }
    for (const month of Object.keys(user.months)) {
      if (month !== periods.month) delete user.months[month];
    }

    return user.weeks[periods.thisWeek];
  });
}

export async function getBumpStats(userId, guildId) {
  await writeQueue;
  const data = await readData();
  const users = data.users ?? {};
  const target = users[userId]?.servers?.[guildId];

  const periods = getPeriodKeys();
  const thisWeek = target?.weeks?.[periods.thisWeek] ?? 0;
  const lastWeek = target?.weeks?.[periods.lastWeek] ?? 0;
  const participants = Object.values(users)
    .map((user) => user.servers?.[guildId])
    .filter((user) => (user?.allTime ?? 0) > 0);
  const rank = thisWeek > 0
    ? 1 + participants.filter((user) => (user.weeks?.[periods.thisWeek] ?? 0) > thisWeek).length
    : null;

  return {
    thisWeek,
    lastWeek,
    trend: thisWeek - lastWeek,
    rank,
    participants: participants.length,
    thisMonth: target?.months?.[periods.month] ?? 0,
    allTime: target?.allTime ?? 0,
    weekKeys: periods,
  };
}
