import type { AsnEntry } from "./types.js";

type ReservedRange = {
  start: number;
  end: number;
  name: string;
};

const RESERVED_RANGES: ReservedRange[] = [
  { start: 0, end: 0, name: "RFC 7607" },
  { start: 112, end: 112, name: "AS112 Project" },
  { start: 23456, end: 23456, name: "RFC 4893" },
  { start: 64496, end: 64511, name: "RFC 5398" },
  { start: 64512, end: 65534, name: "RFC 6996" },
  { start: 65535, end: 65535, name: "RFC 7300" },
  { start: 65536, end: 65551, name: "RFC 5398" },
  { start: 65552, end: 131071, name: "RFC 5398" },
  { start: 4_200_000_000, end: 4_294_967_294, name: "RFC 6996" },
  { start: 4_294_967_295, end: 4_294_967_295, name: "RFC 7300" },
];

const RESERVED_CC = "ZZ";
const RESERVED_CLASS = "Reserved";

export const getReservedAsnEntry = (asn: number): AsnEntry | undefined => {
  for (const range of RESERVED_RANGES) {
    if (asn < range.start || asn > range.end) {
      continue;
    }

    return {
      asn,
      name: range.name,
      cls: RESERVED_CLASS,
      cc: RESERVED_CC,
    };
  }

  return undefined;
};

export const searchReservedAsnByPrefix = (prefix: string): AsnEntry[] => {
  if (!/^\d+$/.test(prefix)) {
    return [];
  }

  const asn = Number.parseInt(prefix, 10);
  if (String(asn) !== prefix) {
    return [];
  }

  const entry = getReservedAsnEntry(asn);
  return entry ? [entry] : [];
};
