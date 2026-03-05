import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createAsnIntel } from "../src/intel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../db/asn-db.bin.gz");
const hasDb = existsSync(DB_PATH);

describe("createAsnIntel", () => {
  it("returns a no-op stub when db file does not exist", () => {
    const intel = createAsnIntel("/non/existent/path.bin.gz");
    expect(intel.available).toBe(false);
    expect(intel.count).toBe(0);
    expect(intel.exactLookup(1)).toBeUndefined();
    expect(intel.prefixSearch("1")).toEqual([]);
    expect(intel.lookupDisplay(1)).toBeUndefined();
  });
});

describe.skipIf(!hasDb)("createAsnIntel with real database", () => {
  const intel = hasDb ? createAsnIntel(DB_PATH) : createAsnIntel("/nope");

  it("loads the database successfully", () => {
    expect(intel.available).toBe(true);
    expect(intel.count).toBeGreaterThan(100_000);
  });

  it("exact lookup for well-known ASNs", () => {
    const cloudflare = intel.exactLookup(13335);
    expect(cloudflare).toBeDefined();
    expect(cloudflare!.name).toContain("Cloudflare");
    expect(cloudflare!.cc).toBe("US");
  });

  it("prefix search returns progressive results", () => {
    const results = intel.prefixSearch("1333", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => String(r.asn).startsWith("1333"))).toBe(true);
  });

  it("exact match is prioritized in prefix search", () => {
    const results = intel.prefixSearch("13335", 5);
    expect(results[0]?.asn).toBe(13335);
  });

  it("lookupDisplay returns formatted info", () => {
    const display = intel.lookupDisplay(13335);
    expect(display).toBeDefined();
    expect(display!.inlayLabel).toContain("AS13335");
    expect(display!.completionDetail).toContain("Cloudflare");
    expect(display!.hoverMarkdown).toContain("###");
  });
});
