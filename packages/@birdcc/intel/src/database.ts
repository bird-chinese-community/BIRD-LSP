import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import type { AsnEntry, AsnDatabase, AsnDatabaseOptions } from "./types.js";

/**
 * Load the compressed msgpack ASN database and build in-memory indices.
 *
 * Layout: [asns: number[], names: string[], classes: string[], ccs: string[]]
 */
export const loadAsnDatabase = (options: AsnDatabaseOptions): AsnDatabase => {
  const t0 = performance.now();

  const compressed = readFileSync(options.dbPath);
  const raw = gunzipSync(compressed);
  const [asns, names, classes, ccs] = decode(raw) as [
    number[],
    string[],
    string[],
    string[],
  ];

  const count = asns.length;

  // Exact lookup: Map<asn_number, index>
  const exactMap = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    exactMap.set(asns[i], i);
  }

  // Prefix search: lexicographically sorted ASN strings + mapping back to original index
  const sortedAsnStrs: string[] = Array.from({ length: count });
  for (let i = 0; i < count; i++) {
    sortedAsnStrs[i] = String(asns[i]);
  }
  sortedAsnStrs.sort();

  const strToIndex = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    strToIndex.set(String(asns[i]), i);
  }

  const loadTimeMs = performance.now() - t0;

  const getEntry = (idx: number): AsnEntry => ({
    asn: asns[idx],
    name: names[idx],
    cls: classes[idx],
    cc: ccs[idx],
  });

  const exactLookup = (asn: number): AsnEntry | undefined => {
    const idx = exactMap.get(asn);
    return idx !== undefined ? getEntry(idx) : undefined;
  };

  /** Lower bound binary search: first index where sortedAsnStrs[i] >= target */
  const lowerBound = (target: string): number => {
    let lo = 0;
    let hi = sortedAsnStrs.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedAsnStrs[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const prefixSearch = (prefix: string, limit = 10): AsnEntry[] => {
    const results: AsnEntry[] = [];

    // Prioritize exact match
    const exactAsn = Number(prefix);
    if (Number.isFinite(exactAsn) && exactMap.has(exactAsn)) {
      results.push(getEntry(exactMap.get(exactAsn)!));
    }

    const lo = lowerBound(prefix);
    for (let i = lo; i < sortedAsnStrs.length && results.length < limit; i++) {
      if (!sortedAsnStrs[i].startsWith(prefix)) break;
      const idx = strToIndex.get(sortedAsnStrs[i])!;
      // Skip if already added as exact match
      if (results.length > 0 && results[0].asn === asns[idx]) continue;
      results.push(getEntry(idx));
    }

    return results;
  };

  return { count, loadTimeMs, exactLookup, prefixSearch };
};
