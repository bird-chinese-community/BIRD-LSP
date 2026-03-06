import { describe, it, expect } from "vitest";
import { createAsnHover } from "../src/asn-hover.js";
import type { AsnIntel } from "@birdcc/intel";

const mockIntel: AsnIntel = {
  available: true,
  count: 3,
  exactLookup: () => undefined,
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

describe("createAsnHover", () => {
  it("returns hover for AS42 as the short ASN exemption", () => {
    const hover = createAsnHover(mockIntel, "  local as 42;", {
      line: 0,
      character: 12,
    });
    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("AS42");
  });

  it("returns hover for local as integer", () => {
    const hover = createAsnHover(mockIntel, "  local as 65001;", {
      line: 0,
      character: 13,
    });
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty("value");
    expect((hover!.contents as { value: string }).value).toContain("AS65001");
  });

  it("returns null when cursor is outside digit span", () => {
    const hover = createAsnHover(mockIntel, "  local as 65001;", {
      line: 0,
      character: 2,
    });
    expect(hover).toBeNull();
  });

  it("returns null for unknown ASN", () => {
    const hover = createAsnHover(mockIntel, "  local as 99999;", {
      line: 0,
      character: 13,
    });
    expect(hover).toBeNull();
  });

  it("returns null when intel is unavailable", () => {
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
    const hover = createAsnHover(noopIntel, "  local as 65001;", {
      line: 0,
      character: 13,
    });
    expect(hover).toBeNull();
  });

  it("returns hover for bgp_path list entries", () => {
    const line = "bgp_path ~ [65001, 13335];";
    const hover = createAsnHover(mockIntel, line, {
      line: 0,
      character: line.indexOf("13335") + 2,
    });

    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("AS13335");
  });

  it("returns hover for reserved ASNs", () => {
    const line = "local as 65500;";
    const hover = createAsnHover(mockIntel, line, {
      line: 0,
      character: line.indexOf("65500") + 2,
    });

    expect(hover).not.toBeNull();
    expect((hover!.contents as { value: string }).value).toContain("RFC 6996");
  });

  it("returns null for well-known community values", () => {
    const line = "bgp_community.add((65535, 65281));";
    const hover = createAsnHover(mockIntel, line, {
      line: 0,
      character: line.indexOf("65535") + 2,
    });

    expect(hover).toBeNull();
  });

  it("returns null for non-ASN define assignments", () => {
    const line = "define PUB_REGION = 44;";
    const hover = createAsnHover(mockIntel, line, {
      line: 0,
      character: line.indexOf("44"),
    });

    expect(hover).toBeNull();
  });

  it("returns null for short non-exempt ASNs", () => {
    const line = "local as 44;";
    const hover = createAsnHover(mockIntel, line, {
      line: 0,
      character: line.indexOf("44"),
    });

    expect(hover).toBeNull();
  });
});
