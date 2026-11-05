import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tryLoadAsnDatabase } from "./database.js";
import { formatAsnDisplay } from "./display.js";
import { getReservedAsnEntry, searchReservedAsnByPrefix } from "./reserved.js";
import type {
  AsnDisplayInfo,
  AsnEntry,
  AsnDatabaseFailure,
  AsnDatabaseVersion,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default path to the bundled ASN database binary. */
const DEFAULT_DB_PATH = resolve(__dirname, "../db/asn-db.bin.gz");

export interface AsnIntel {
  readonly version?: AsnDatabaseVersion;
  readonly failure?: AsnDatabaseFailure;
  /** Whether the database was loaded successfully. */
  readonly available: boolean;
  /** Total number of ASN records. */
  readonly count: number;
  /** Get ASN entry by exact number. */
  exactLookup: (asn: number) => AsnEntry | undefined;
  /** Prefix search returning formatted display items. */
  prefixSearch: (prefix: string, limit?: number) => AsnEntry[];
  /** Format an ASN entry into display strings for LSP features. */
  formatDisplay: (entry: AsnEntry) => AsnDisplayInfo;
  /** Lookup + format in one call (convenience). */
  lookupDisplay: (asn: number) => AsnDisplayInfo | undefined;
}

const NOOP_INTEL: AsnIntel = {
  available: false,
  count: 0,
  exactLookup: () => undefined,
  prefixSearch: () => [],
  formatDisplay: () => ({
    inlayLabel: "",
    completionDetail: "",
    hoverMarkdown: "",
  }),
  lookupDisplay: () => undefined,
};

/**
 * Create an ASN intelligence instance.
 * Loads the database; returns an unavailable instance with structured failure context on load errors.
 */
export const createAsnIntel = (dbPath?: string): AsnIntel => {
  const path = dbPath ?? DEFAULT_DB_PATH;

  const result = tryLoadAsnDatabase({ dbPath: path });
  if (!result.ok) {
    return { ...NOOP_INTEL, failure: result.error };
  }
  const db = result.database;

  const exactLookup = (asn: number): AsnEntry | undefined =>
    getReservedAsnEntry(asn) ?? db.exactLookup(asn);

  const prefixSearch = (prefix: string, limit = 10): AsnEntry[] => {
    const results = db.prefixSearch(prefix, limit);
    const reservedEntries = searchReservedAsnByPrefix(prefix).filter(
      (reservedEntry) =>
        !results.some((result) => result.asn === reservedEntry.asn),
    );

    return [...reservedEntries, ...results].slice(0, limit);
  };

  const lookupDisplay = (asn: number): AsnDisplayInfo | undefined => {
    const entry = exactLookup(asn);
    return entry ? formatAsnDisplay(entry) : undefined;
  };

  return {
    available: true,
    version: db.version,
    count: db.count,
    exactLookup,
    prefixSearch,
    formatDisplay: formatAsnDisplay,
    lookupDisplay,
  };
};
