import { describe, it, expect } from "vitest";
import { createAsnInlayHints } from "../src/asn-inlay-hints.js";
import type { AsnIntel } from "@birdcc/intel";

const mockIntel: AsnIntel = {
  available: true,
  count: 1,
  exactLookup: (asn) =>
    asn === 65001
      ? { asn: 65001, name: "TestNet", cls: "", cc: "US" }
      : asn === 13335
        ? { asn: 13335, name: "Cloudflare", cls: "Content", cc: "US" }
        : undefined,
  prefixSearch: () => [],
  formatDisplay: () => ({
    inlayLabel: "",
    completionDetail: "",
    hoverMarkdown: "",
  }),
  lookupDisplay: (asn) => {
    if (asn === 65001)
      return {
        inlayLabel: "🇺🇸 AS65001",
        completionDetail: "🇺🇸 AS65001 · TestNet",
        hoverMarkdown: "### 🇺🇸 AS65001\n\nTestNet",
      };
    if (asn === 13335)
      return {
        inlayLabel: "🇺🇸 AS13335",
        completionDetail: "🇺🇸 AS13335 · Cloudflare",
        hoverMarkdown: "### 🇺🇸 AS13335\n\nCloudflare",
      };
    return undefined;
  },
};

describe("createAsnInlayHints", () => {
  it("produces hints for local as statements", () => {
    const text = "  local as 65001;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toContain("AS65001");
    expect(hints[0].position.line).toBe(0);
  });

  it("produces hints for neighbor as statements", () => {
    const text = "  neighbor 192.0.2.1 as 13335;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for unavailable intel", () => {
    const noopIntel: AsnIntel = {
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
    const hints = createAsnInlayHints(noopIntel, "local as 65001;", {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 20 },
    });
    expect(hints).toHaveLength(0);
  });

  it("handles multiline text", () => {
    const text =
      "protocol bgp edge {\n  local as 65001;\n  neighbor 10.0.0.1 as 13335;\n}";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 3, character: 1 },
    });
    expect(hints.length).toBeGreaterThanOrEqual(2);
  });
});
