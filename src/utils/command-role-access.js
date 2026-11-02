const requiredRoleByGuild = {
  '852771975730298880': '852778233275613235',
  '771235990664118272': '771747709170352139',
};

const banAndLeftRolesByGuild = {
  '852771975730298880': ['852778343908900896', '852778216464973844'],
  '771235990664118272': ['785057888837042177', '1417367238108905582', '775645444243062804'],
};

export function hasRequiredCommandRole({ guildId, member }) {
  const requiredRoleId = requiredRoleByGuild[guildId];
  if (!requiredRoleId) return true;
  const roles = member?.roles;
  if (roles?.cache?.has) return roles.cache.has(requiredRoleId);
  if (Array.isArray(roles)) return roles.includes(requiredRoleId);
  return false;
}

export function hasBanAndLeftCommandRole({ guildId, member }) {
  const allowedRoleIds = banAndLeftRolesByGuild[guildId] ?? [];
  const roles = member?.roles;
  if (roles?.cache?.has) return allowedRoleIds.some((roleId) => roles.cache.has(roleId));
  if (Array.isArray(roles)) return allowedRoleIds.some((roleId) => roles.includes(roleId));
  return false;
}

