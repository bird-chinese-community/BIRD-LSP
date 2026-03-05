/** ISO 3166-1 alpha-2 country code → regional flag emoji. */
const CC_FLAG_CACHE = new Map<string, string>();

export const countryCodeToFlag = (cc: string): string => {
  if (cc.length !== 2) return "";

  const cached = CC_FLAG_CACHE.get(cc);
  if (cached !== undefined) return cached;

  const upper = cc.toUpperCase();
  const flag = String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65,
  );

  CC_FLAG_CACHE.set(cc, flag);
  return flag;
};
