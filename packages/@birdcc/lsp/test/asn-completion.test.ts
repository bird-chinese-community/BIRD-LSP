import { describe, it, expect } from "vitest";
import {
  extractAsnPrefix,
  createAsnCompletionItems,
} from "../src/asn-completion.js";
import type { AsnIntel } from "@birdcc/intel";

describe("extractAsnPrefix", () => {
  it("extracts from local as context", () => {
    expect(extractAsnPrefix("  local as 651")).toBe("651");
  });

  it("extracts from neighbor as context", () => {
    expect(extractAsnPrefix("  neighbor 192.0.2.1 as 133")).toBe("133");
  });

  it("extracts from remote as context", () => {
    expect(extractAsnPrefix("  remote as 4")).toBe("4");
  });

  it("extracts from define context", () => {
    expect(extractAsnPrefix("define MY_ASN = 650")).toBe("650");
  });

  it("extracts from bgp_community.add context", () => {
    expect(extractAsnPrefix("  bgp_community.add((1333")).toBe("1333");
  });

  it("extracts from bgp_path.prepend context", () => {
    expect(extractAsnPrefix("  bgp_path.prepend(650")).toBe("650");
  });

  it("extracts from comment AS annotation", () => {
    expect(extractAsnPrefix("# AS133")).toBe("133");
  });

  it("returns undefined for non-ASN context", () => {
    expect(extractAsnPrefix("protocol bgp edge")).toBeUndefined();
    expect(extractAsnPrefix("  import filter")).toBeUndefined();
    expect(extractAsnPrefix("")).toBeUndefined();
  });
});

describe("createAsnCompletionItems", () => {
  const mockIntel: AsnIntel = {
    available: true,
    count: 2,
    exactLookup: (asn) =>
      asn === 13335
        ? { asn: 13335, name: "Cloudflare, Inc.", cls: "Content", cc: "US" }
        : undefined,
    prefixSearch: (prefix) => {
      if (prefix === "133") {
        return [
          { asn: 13335, name: "Cloudflare, Inc.", cls: "Content", cc: "US" },
        ];
      }
      return [];
    },
    formatDisplay: (entry) => ({
      inlayLabel: `AS${entry.asn}`,
      completionDetail: `AS${entry.asn} · ${entry.name}`,
      hoverMarkdown: `### AS${entry.asn}\n${entry.name}`,
    }),
    lookupDisplay: () => undefined,
  };

  it("returns ASN completions in ASN context", () => {
    const items = createAsnCompletionItems(mockIntel, "  local as 133");
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("13335");
    expect(items[0].detail).toContain("Cloudflare");
  });

  it("returns empty array for non-ASN context", () => {
    const items = createAsnCompletionItems(mockIntel, "protocol bgp");
    expect(items).toHaveLength(0);
  });

  it("returns empty array when intel is unavailable", () => {
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
    const items = createAsnCompletionItems(noopIntel, "  local as 133");
    expect(items).toHaveLength(0);
  });
});
