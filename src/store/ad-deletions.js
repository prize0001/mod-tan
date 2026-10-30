import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = join(process.cwd(), 'data', 'ad-deletions.json');
let writeQueue = Promise.resolve();

function getPeriodKeys(date = new Date()) {
  const today = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const thisWeek = new Date(today);
  thisWeek.setUTCDate(thisWeek.getUTCDate() - daysSinceMonday);
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
    const data = JSON.parse(await readFile(storePath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Ad-deletion store must contain a JSON object.');
    }
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
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

function getUser(data, userId) {
  data.users ??= {};
  data.users[userId] ??= { allTime: 0, weeks: {}, months: {} };
  const user = data.users[userId];
  user.weeks ??= {};
  user.months ??= {};
  return user;
}

export function recordAdDeletion(moderatorId) {
  return addAdDeletions(moderatorId, 1);
}

export function addAdDeletions(moderatorId, count) {
  return serializeUpdate((data) => {
    const periods = getPeriodKeys();
    const user = getUser(data, moderatorId);
    user.allTime = (user.allTime ?? 0) + count;
    user.weeks[periods.thisWeek] = (user.weeks[periods.thisWeek] ?? 0) + count;
    user.months[periods.month] = (user.months[periods.month] ?? 0) + count;

    for (const week of Object.keys(user.weeks)) {
      if (week !== periods.thisWeek && week !== periods.lastWeek) delete user.weeks[week];
    }
    for (const month of Object.keys(user.months)) {
      if (month !== periods.month) delete user.months[month];
    }

    return {
      thisWeek: user.weeks[periods.thisWeek],
      allTime: user.allTime,
    };
  });
}

export async function getAdDeletionStats(userId) {
  await writeQueue;
  const data = await readData();
  const periods = getPeriodKeys();
  const user = data.users?.[userId];
  const thisWeek = user?.weeks?.[periods.thisWeek] ?? 0;
  const lastWeek = user?.weeks?.[periods.lastWeek] ?? 0;
  const activeUsers = Object.values(data.users ?? {}).filter((entry) => (entry.weeks?.[periods.thisWeek] ?? 0) > 0);
  const rank = thisWeek > 0
    ? 1 + activeUsers.filter((entry) => (entry.weeks?.[periods.thisWeek] ?? 0) > thisWeek).length
    : null;

  return {
    thisWeek,
    lastWeek,
    trend: thisWeek - lastWeek,
    rank,
    participants: activeUsers.length,
    thisMonth: user?.months?.[periods.month] ?? 0,
    allTime: user?.allTime ?? 0,
    weekKeys: periods,
  };
}
