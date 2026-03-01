import { isIP } from "node:net";
import { parse as parseCidr } from "fast-cidr-tools";

const parsePrefixRange = (suffix: string): { min: number; max: number } | null => {
  if (!suffix.startsWith("{") || !suffix.endsWith("}")) {
    return null;
  }

  const inner = suffix.slice(1, -1);
  const commaIndex = inner.indexOf(",");
  if (commaIndex <= 0 || commaIndex >= inner.length - 1) {
    return null;
  }

  const min = Number(inner.slice(0, commaIndex));
  const max = Number(inner.slice(commaIndex + 1));

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return null;
  }

  return { min, max };
};

export const isValidPrefixLiteral = (literal: string): boolean => {
  let value = literal.trim();
  if (value.length === 0) {
    return false;
  }

  let range: { min: number; max: number } | null = null;

  if (value.endsWith("+")) {
    value = value.slice(0, -1);
  } else if (value.endsWith("-")) {
    value = value.slice(0, -1);
  } else if (value.endsWith("}")) {
    const braceStart = value.lastIndexOf("{");
    if (braceStart === -1) {
      return false;
    }

    range = parsePrefixRange(value.slice(braceStart));
    if (!range) {
      return false;
    }

    value = value.slice(0, braceStart);
  }

  const slashIndex = value.lastIndexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) {
    return false;
  }

  const ipPart = value.slice(0, slashIndex);
  const prefixPart = value.slice(slashIndex + 1);
  const prefix = Number(prefixPart);

  if (!Number.isInteger(prefix)) {
    return false;
  }

  const version = isIP(ipPart);
  if (version === 0) {
    return false;
  }

  const maxBits = version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > maxBits) {
    return false;
  }

  if (range) {
    if (range.min < prefix || range.min > maxBits || range.max < range.min || range.max > maxBits) {
      return false;
    }
  }

  try {
    void parseCidr(value);
  } catch {
    return false;
  }

  return true;
};
