import { describe, it, expect } from "vitest";
import { createAsnInlayHints } from "../src/asn-inlay-hints.js";
import type { AsnIntel } from "@birdcc/intel";

const mockIntel: AsnIntel = {
  available: true,
  count: 4,
  exactLookup: (asn) =>
    asn === 42
      ? { asn: 42, name: "Example Short ASN", cls: "Transit", cc: "DE" }
      : asn === 65001
        ? { asn: 65001, name: "Example Transit ASN", cls: "", cc: "US" }
        : asn === 13335
          ? {
              asn: 13335,
              name: "Example Content ASN",
              cls: "Content",
              cc: "US",
            }
          : asn === 65500
            ? { asn: 65500, name: "RFC 6996", cls: "Reserved", cc: "ZZ" }
            : undefined,
  prefixSearch: () => [],
  formatDisplay: () => ({
    inlayLabel: "",
    completionDetail: "",
    hoverMarkdown: "",
  }),
  lookupDisplay: (asn) => {
    if (asn === 42)
      return {
        inlayLabel: "🇩🇪 AS42",
        completionDetail: "🇩🇪 AS42 · Example Short ASN",
        hoverMarkdown: "### 🇩🇪 AS42\n\nExample Short ASN",
      };
    if (asn === 65001)
      return {
        inlayLabel: "🇺🇸 AS65001",
        completionDetail: "🇺🇸 AS65001 · Example Transit ASN",
        hoverMarkdown: "### 🇺🇸 AS65001\n\nExample Transit ASN",
      };
    if (asn === 13335)
      return {
        inlayLabel: "🇺🇸 AS13335",
        completionDetail: "🇺🇸 AS13335 · Example Content ASN",
        hoverMarkdown: "### 🇺🇸 AS13335\n\nExample Content ASN",
      };
    if (asn === 65500)
      return {
        inlayLabel: "🏳️ AS65500",
        completionDetail: "🏳️ AS65500 · RFC 6996",
        hoverMarkdown: "### 🏳️ AS65500\n\nRFC 6996\n\nType: Reserved",
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

  it("keeps AS42 as the short ASN exemption", () => {
    const text = "  local as 42;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toContain("AS42");
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

  it("skips non-ASN define assignments", () => {
    const text = "define PUB_REGION = 44;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(0);
  });

  it("skips short non-exempt ASNs", () => {
    const text = "local as 44;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(0);
  });

  it("skips well-known communities", () => {
    const text = "bgp_community.add((65535, 65281));";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(0);
  });

  it("keeps reserved ASNs matchable in ASN contexts", () => {
    const text = "local as 65500;";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toBe(" 🏳️ AS65500");
  });

  it("produces hints for community matching and bgp_path lists", () => {
    const text = `
      if (65001, 100) ~ bgp_community then accept;
      bgp_path ~ [65001, 13335];
      bgp_path.delete(65001);
    `.trim();
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 2, character: 30 },
    });

    expect(hints).toHaveLength(4);
    expect(hints.map((hint) => hint.label)).toEqual([
      " 🇺🇸 AS65001",
      " 🇺🇸 AS65001",
      " 🇺🇸 AS13335",
      " 🇺🇸 AS65001",
    ]);
  });

  it("ignores ASN-looking text inside comments", () => {
    const text = "# neighbor 192.0.2.1 as 65001";
    const hints = createAsnInlayHints(mockIntel, text, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
    expect(hints).toHaveLength(0);
  });
});
