export function parseUserId(value) {
  const input = value.trim();
  const mention = input.match(/^<@!?(\d{17,20})>$/);
  if (mention) return mention[1];
  return /^\d{17,20}$/.test(input) ? input : null;
}