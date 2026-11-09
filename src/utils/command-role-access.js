const STAFF_HUB_GUILD_ID = '884251376157339718';

const roleIdsByGroup = {
  banLeft: [
    '884251376232841259',
    '1425526085193306232',
    '1425526106445975664',
    '884251376274767891',
  ],
  moderation: ['884251376232841261', '884251376274767891'],
  warnings: ['884251376232841261', '884251376274767891'],
  adWarnings: ['884251376232841261', '884251376274767891'],
  timeout: ['884251376232841261', '884251376274767891'],
  bump: ['884251376232841261', '884251376274767891'],
  stickyAutoAds: ['884251376274767891'],
  manualAds: ['884251376274767891'],
};

export async function hasStaffHubRole(client, userId, group) {
  const roleIds = roleIdsByGroup[group];
  if (!client || !userId || !Array.isArray(roleIds) || roleIds.length === 0) return false;

  let staffHub = client.guilds.cache.get(STAFF_HUB_GUILD_ID);
  if (!staffHub) {
    staffHub = await client.guilds.fetch(STAFF_HUB_GUILD_ID).catch((error) => {
      console.error('Could not access the Staff Hub for command role checks:', error);
      return null;
    });
  }
  if (!staffHub) return false;

  const member = await staffHub.members.fetch(userId).catch(() => null);
  if (!member) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}
