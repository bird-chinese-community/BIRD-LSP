import { describe, it, expect } from "vitest";
import { createAsnHover } from "../src/asn-hover.js";
import type { AsnIntel } from "@birdcc/intel";

const mockIntel: AsnIntel = {
  available: true,
  count: 1,
  exactLookup: () => undefined,
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
    return undefined;
  },
};

describe("createAsnHover", () => {
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
});
