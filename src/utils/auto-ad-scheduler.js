import { EmbedBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const storePath = process.env.AUTO_AD_STORE_PATH ?? join(process.cwd(), 'data', 'auto-ads.json');
export const AUTO_AD_INTERVAL_MS = 3 * 60 * 60 * 1000;
const ownerUserId = '749008764300165192';
let writeQueue = Promise.resolve();
let schedulerRunning = false;
let schedulerTimer;

async function readCampaigns() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const campaigns = JSON.parse(await readFile(storePath, 'utf8'));
    if (!campaigns || typeof campaigns !== 'object' || Array.isArray(campaigns)) {
      throw new Error('Auto-ad store must contain a JSON object.');
    }
    return campaigns;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeCampaigns(campaigns) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  const content = JSON.stringify(campaigns, null, 2);
  await writeFile(temporaryPath, content, 'utf8');
  try {
    await rename(temporaryPath, storePath);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    await writeFile(storePath, content, 'utf8');
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function mutateCampaigns(callback) {
  const operation = writeQueue.then(async () => {
    const campaigns = await readCampaigns();
    const result = await callback(campaigns);
    await writeCampaigns(campaigns);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function createAutoAd({ guildId, creatorId, description, channelIds, durationMs }) {
  return mutateCampaigns((campaigns) => {
    const id = randomUUID().slice(0, 8);
    const now = Date.now();
    const campaign = {
      id,
      guildId,
      creatorId,
      description,
      channelIds,
      createdAt: now,
      expiresAt: now + durationMs,
      nextPostAt: now,
      status: 'active',
      postedMessages: [],
      expiryNotified: false,
    };
    campaigns[id] = campaign;
    return campaign;
  });
}

export async function listAutoAds(guildId) {
  await writeQueue;
  const campaigns = await readCampaigns();
  return Object.values(campaigns).filter((campaign) => campaign.guildId === guildId && campaign.status !== 'ended');
}

export async function removeAutoAd(guildId, id) {
  return mutateCampaigns((campaigns) => {
    const campaign = campaigns[id];
    if (!campaign || campaign.guildId !== guildId) return null;
    delete campaigns[id];
    return campaign;
  });
}

async function updateCampaign(id, callback) {
  return mutateCampaigns((campaigns) => {
    const campaign = campaigns[id];
    if (!campaign) return null;
    return callback(campaign);
  });
}

async function deleteCampaignMessages(client, campaign) {
  const remaining = [];
  for (const postedMessage of campaign.postedMessages) {
    const channel = await client.channels.fetch(postedMessage.channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.messages?.delete) {
      remaining.push(postedMessage);
      continue;
    }
    try {
      await channel.messages.delete(postedMessage.messageId);
    } catch (error) {
      if (error.code !== 10008) {
        console.error(`Could not delete expired auto-ad message ${postedMessage.messageId}:`, error);
        remaining.push(postedMessage);
      }
    }
  }
  return remaining;
}

async function finishCampaign(client, campaign) {
  const remainingMessages = await deleteCampaignMessages(client, campaign);
  await updateCampaign(campaign.id, (stored) => {
    stored.postedMessages = remainingMessages;
    stored.status = remainingMessages.length ? 'ending' : 'ended';
    stored.expiryNotified = true;
  });

  if (!campaign.expiryNotified) {
    const embed = new EmbedBuilder()
      .setColor(0xC44545)
      .setTitle('Auto ad has ended')
      .setDescription(campaign.description)
      .addFields(
        { name: 'Auto ad ID', value: campaign.id, inline: true },
        { name: 'Channels', value: String(campaign.channelIds.length), inline: true },
      );
    const owner = await client.users.fetch(ownerUserId).catch((error) => {
      console.error('Could not fetch the auto-ad owner for the expiry DM:', error);
      return null;
    });
    if (owner) {
      await owner.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((error) => {
        console.error('Could not DM the auto-ad expiry notice:', error);
      });
    }
  }

  if (remainingMessages.length === 0) {
    await mutateCampaigns((campaigns) => {
      delete campaigns[campaign.id];
    });
  }
}

async function postCampaign(client, campaign) {
  await updateCampaign(campaign.id, (stored) => {
    stored.nextPostAt = Date.now() + AUTO_AD_INTERVAL_MS;
  });

  for (const channelId of campaign.channelIds) {
    const channel = await client.channels.fetch(channelId).catch((error) => {
      console.error(`Could not fetch auto-ad channel ${channelId}:`, error);
      return null;
    });
    if (!channel?.isTextBased() || typeof channel.send !== 'function') continue;

    try {
      const posted = await channel.send({
        content: campaign.description,
        allowedMentions: { parse: [] },
      });
      await updateCampaign(campaign.id, (stored) => {
        stored.postedMessages.push({ channelId, messageId: posted.id });
      });
    } catch (error) {
      console.error(`Could not post auto-ad ${campaign.id} in channel ${channelId}:`, error);
    }
  }
}

export async function processAutoAds(client) {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const campaigns = await listAutoAdsForScheduler();
    const now = Date.now();
    for (const campaign of campaigns) {
      if (campaign.status === 'ending' || campaign.expiresAt <= now) {
        await updateCampaign(campaign.id, (stored) => { stored.status = 'ending'; });
        await finishCampaign(client, campaign);
      } else if (campaign.nextPostAt <= now) {
        await postCampaign(client, campaign);
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

async function listAutoAdsForScheduler() {
  await writeQueue;
  return Object.values(await readCampaigns()).filter((campaign) => campaign.status !== 'ended');
}

export function startAutoAdScheduler(client) {
  if (schedulerTimer) return;
  processAutoAds(client).catch((error) => console.error('Auto-ad scheduler failed:', error));
  schedulerTimer = setInterval(() => {
    processAutoAds(client).catch((error) => console.error('Auto-ad scheduler failed:', error));
  }, 30_000);
  schedulerTimer.unref?.();
}