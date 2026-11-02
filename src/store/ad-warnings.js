import { randomInt } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = process.env.AD_WARNING_STORE_PATH ?? join(process.cwd(), 'data', 'ad-warnings.json');
const codeAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const warningBurstWindowMs = 30_000;
const notificationCooldownMs = 15 * 60_000;
let writeQueue = Promise.resolve();

async function readWarnings() {
  await mkdir(dirname(storePath), { recursive: true });

  try {
    const warnings = JSON.parse(await readFile(storePath, 'utf8'));
    if (!Array.isArray(warnings)) throw new Error('Ad-warning store must contain a JSON array.');
    return warnings;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeWarnings(warnings) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(warnings, null, 2), 'utf8');
  await rename(temporaryPath, storePath);
}

function withWriteLock(callback) {
  const operation = writeQueue.then(async () => {
    const warnings = await readWarnings();
    const result = await callback(warnings);
    await writeWarnings(warnings);
    return result;
  });

  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function createCode(warnings) {
  let code;
  do {
    code = Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');
  } while (warnings.some((warning) => warning.code === code));
  return code;
}

export function normalizeAdWarningCode(value) {
  return value.trim().toLowerCase().replace(/^adwarn(?:\s+code)?(?:[-:\s]+)?/, '');
}

export function addAdWarning({ guildId, userId, moderatorId, channelId, reason }) {
  return withWriteLock((warnings) => {
    const now = Date.now();
    const recentWarnings = warnings.filter((entry) => entry.guildId === guildId
      && entry.userId === userId
      && Number.isFinite(Date.parse(entry.createdAt))
      && now - Date.parse(entry.createdAt) >= 0
      && now - Date.parse(entry.createdAt) <= warningBurstWindowMs);
    const activeCooldownUntil = warnings
      .filter((entry) => entry.guildId === guildId && entry.userId === userId && entry.cooldownUntil)
      .map((entry) => Date.parse(entry.cooldownUntil))
      .filter((until) => Number.isFinite(until) && until > now)
      .reduce((latest, until) => Math.max(latest, until), 0);
    const cooldownStarted = activeCooldownUntil === 0 && recentWarnings.length >= 1;
    const cooldownUntil = activeCooldownUntil || (cooldownStarted ? now + notificationCooldownMs : null);
    const warningCount = warnings.filter((warning) => warning.guildId === guildId && warning.userId === userId).length + 1;
    const warning = {
      code: createCode(warnings),
      guildId,
      userId,
      moderatorId,
      channelId,
      reason,
      warningCount,
      createdAt: new Date(now).toISOString(),
      ...(cooldownUntil ? { cooldownActive: true } : {}),
      ...(cooldownStarted ? { cooldownUntil: new Date(cooldownUntil).toISOString() } : {}),
    };

    warnings.push(warning);
    return warning;
  });
}

export async function findAdWarning(value, guildId) {
  await writeQueue;
  const code = normalizeAdWarningCode(value);
  if (!/^[a-z0-9]{6}$/.test(code)) return null;

  const warnings = await readWarnings();
  return warnings.find((warning) => warning.code === code && warning.guildId === guildId) ?? null;
}

export async function getAdWarningsForUser(guildId, userId) {
  await writeQueue;
  const warnings = await readWarnings();
  return warnings
    .filter((warning) => warning.guildId === guildId && warning.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function removeAdWarning(value, guildId) {
  const code = normalizeAdWarningCode(value);
  if (!/^[a-z0-9]{6}$/.test(code)) return Promise.resolve(null);

  return withWriteLock((warnings) => {
    const index = warnings.findIndex((warning) => warning.code === code && warning.guildId === guildId);
    if (index === -1) return null;
    return warnings.splice(index, 1)[0];
  });
}

