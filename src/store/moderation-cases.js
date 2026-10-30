import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = process.env.MODERATION_CASE_STORE_PATH ?? join(process.cwd(), 'data', 'moderation-cases.json');
let writeQueue = Promise.resolve();

async function readCases() {
  await mkdir(dirname(storePath), { recursive: true });

  try {
    const cases = JSON.parse(await readFile(storePath, 'utf8'));
    if (!Array.isArray(cases)) throw new Error('Moderation case store must contain a JSON array.');
    return cases;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCases(cases) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(cases, null, 2), 'utf8');
  await rename(temporaryPath, storePath);
}

export function createModerationCase(details) {
  const operation = writeQueue.then(async () => {
    const cases = await readCases();
    const caseId = cases.reduce((highest, entry) => Math.max(highest, entry.caseId), 0) + 1;
    const record = { caseId, ...details, createdAt: new Date().toISOString() };
    cases.push(record);
    await writeCases(cases);
    return record;
  });

  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function getModerationCases({ guildId, targetId, action, source }) {
  await writeQueue;
  const cases = await readCases();
  return cases
    .filter((entry) => !entry.removedAt
      && entry.guildId === guildId
      && entry.targetId === targetId
      && (!action || entry.action === action)
      && (!source || entry.source === source))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function removeModerationCase({ guildId, caseId, removedBy, source }) {
  const operation = writeQueue.then(async () => {
    const cases = await readCases();
    const record = cases.find((entry) => entry.guildId === guildId
      && entry.caseId === caseId
      && entry.action === 'Member warned'
      && entry.source === source
      && !entry.removedAt);
    if (!record) return null;

    record.removedAt = new Date().toISOString();
    record.removedBy = removedBy;
    await writeCases(cases);
    return record;
  });

  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
