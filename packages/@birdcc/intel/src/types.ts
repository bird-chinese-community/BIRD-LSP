export interface AsnEntry {
  /** ASN number (without "AS" prefix) */
  asn: number;
  /** Organization / AS name */
  name: string;
  /** Classification: "Transit/Access", "Content", "Enterprise", "Eyeball", or "" */
  cls: string;
  /** ISO 3166-1 alpha-2 country code */
  cc: string;
}

export interface AsnDatabase {
  /** Total number of ASN records loaded. */
  readonly count: number;
  /** Time taken to load and index the database (ms). */
  readonly loadTimeMs: number;
  /** Exact ASN lookup — O(1) via Map. */
  exactLookup: (asn: number) => AsnEntry | undefined;
  /**
   * Prefix search with progressive matching.
   * Searches for ASNs whose string representation starts with `prefix`.
   * Results are sorted: exact match first, then lexicographic.
   */
  prefixSearch: (prefix: string, limit?: number) => AsnEntry[];
}

export interface AsnDatabaseOptions {
  /** Absolute path to the `asn-db.bin.gz` file. */
  dbPath: string;
}

/** Formatted ASN display info for LSP consumers. */
export interface AsnDisplayInfo {
  /** Short inline label for inlay hints: "🇺🇸 AS13335" (≤10 chars after flag, with ".." truncation) */
  inlayLabel: string;
  /** Medium completion detail: "🇺🇸 AS13335 · Cloudflare, Inc." */
  completionDetail: string;
  /** Full markdown hover content with rich formatting. */
  hoverMarkdown: string;
}
