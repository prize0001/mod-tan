const requiredRoleByGuild = {
  '852771975730298880': '852778233275613235',
  '771235990664118272': '771747709170352139',
};

export function hasRequiredCommandRole({ guildId, member }) {
  const requiredRoleId = requiredRoleByGuild[guildId];
  if (!requiredRoleId) return true;
  const roles = member?.roles;
  if (roles?.cache?.has) return roles.cache.has(requiredRoleId);
  if (Array.isArray(roles)) return roles.includes(requiredRoleId);
  return false;
}
