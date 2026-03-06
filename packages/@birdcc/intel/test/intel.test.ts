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

  it("exact lookup returns reserved fallback entries", () => {
    const reserved = intel.exactLookup(65500);
    expect(reserved).toBeDefined();
    expect(reserved!.name).toBe("RFC 6996");
    expect(reserved!.cls).toBe("Reserved");
    expect(reserved!.cc).toBe("ZZ");
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
    const display = intel.lookupDisplay(65500);
    expect(display).toBeDefined();
    expect(display!.inlayLabel).toBe("🏳️ AS65500");
    expect(display!.completionDetail).toContain("RFC 6996");
    expect(display!.hoverMarkdown).toContain("Reserved");
  });

  it("prefix search can surface exact reserved ASN matches", () => {
    const results = intel.prefixSearch("65500", 5);
    expect(results[0]?.asn).toBe(65500);
    expect(results[0]?.name).toBe("RFC 6996");
  });
});
