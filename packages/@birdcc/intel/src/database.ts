import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { createHash } from "node:crypto";
import { z, ZodError } from "zod";
import {
  asnDatabaseSchema,
  MAX_DATABASE_BYTES,
  MAX_DATABASE_RECORDS,
} from "./database-schema.js";
import type {
  AsnEntry,
  AsnDatabase,
  AsnDatabaseOptions,
  AsnDatabaseLoadResult,
  AsnDatabaseFailure,
  AsnDatabaseVersion,
} from "./types.js";

const packageVersion = z
  .object({ version: z.string().min(1) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  ).version;

/**
 * Load the compressed msgpack ASN database and build in-memory indices.
 *
 * Layout: [asns: number[], names: string[], classes: string[], ccs: string[]]
 */
export const tryLoadAsnDatabase = (
  options: AsnDatabaseOptions,
): AsnDatabaseLoadResult => {
  const t0 = performance.now();
  let version: AsnDatabaseVersion = { packageVersion };
  const failure = (
    code: AsnDatabaseFailure["code"],
    message: string,
  ): AsnDatabaseLoadResult => ({
    ok: false,
    error: { code, message, dbPath: options.dbPath, version },
  });
  let compressed: Buffer;
  try {
    compressed = readFileSync(options.dbPath);
  } catch (error) {
    const missing =
      error instanceof Error && "code" in error && error.code === "ENOENT";
    return failure(
      missing ? "missing" : "read",
      error instanceof Error ? error.message : String(error),
    );
  }
  version = {
    packageVersion,
    contentSha256: createHash("sha256").update(compressed).digest("hex"),
  };
  let raw: Buffer;
  try {
    raw = gunzipSync(compressed, { maxOutputLength: MAX_DATABASE_BYTES });
  } catch (error) {
    return failure(
      "decompress",
      error instanceof Error ? error.message : String(error),
    );
  }
  let columns: z.infer<typeof asnDatabaseSchema>;
  try {
    columns = asnDatabaseSchema.parse(
      decode(raw, {
        maxArrayLength: MAX_DATABASE_RECORDS,
        maxMapLength: 100,
        maxStrLength: 8192,
        maxBinLength: MAX_DATABASE_BYTES,
        maxExtLength: 0,
      }),
    );
  } catch (error) {
    const issue = error instanceof ZodError ? error.issues[0] : undefined;
    return failure(
      error instanceof ZodError ? "schema" : "decode",
      issue
        ? `Invalid database at ${issue.path.join(".") || "root"}: ${issue.message}`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }
  const [asns, names, classes, ccs] = columns;

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

  return {
    ok: true,
    database: { count, loadTimeMs, version, exactLookup, prefixSearch },
  };
};

/** Load and validate the database, throwing an error with structured failure context. */
export const loadAsnDatabase = (options: AsnDatabaseOptions): AsnDatabase => {
  const result = tryLoadAsnDatabase(options);
  if (!result.ok) {
    throw new Error(
      `ASN database ${result.error.code} failure for '${options.dbPath}': ${result.error.message}`,
      { cause: result.error },
    );
  }
  return result.database;
};
