import { describe, it, expect } from "vitest";
import { formatAsnDisplay } from "../src/display.js";
import type { AsnEntry } from "../src/types.js";

describe("formatAsnDisplay", () => {
  const cloudflare: AsnEntry = {
    asn: 13335,
    name: "Cloudflare, Inc.",
    cls: "Content",
    cc: "US",
  };

  const chinanet: AsnEntry = {
    asn: 4134,
    name: "CHINANET-BACKBONE",
    cls: "Transit/Access",
    cc: "CN",
  };

  const longAsn: AsnEntry = {
    asn: 1234567890,
    name: "Very Long ASN Corp",
    cls: "",
    cc: "DE",
  };

  it("generates correct inlay label for normal ASN", () => {
    const display = formatAsnDisplay(cloudflare);
    expect(display.inlayLabel).toBe("🇺🇸 AS13335");
  });

  it("truncates ASN with > 6 digits in inlay label", () => {
    const display = formatAsnDisplay(longAsn);
    expect(display.inlayLabel).toBe("🇩🇪 AS123456..");
  });

  it("generates correct completion detail", () => {
    const display = formatAsnDisplay(cloudflare);
    expect(display.completionDetail).toBe("🇺🇸 AS13335 · Cloudflare, Inc.");
  });

  it("generates hover markdown with table", () => {
    const display = formatAsnDisplay(chinanet);
    expect(display.hoverMarkdown).toContain("### 🇨🇳 AS4134");
    expect(display.hoverMarkdown).toContain("CHINANET-BACKBONE");
    expect(display.hoverMarkdown).toContain("Transit/Access");
    expect(display.hoverMarkdown).toContain("BGP.Tools OpenDB");
  });

  it("handles entry with no country code", () => {
    const entry: AsnEntry = { asn: 1, name: "Test", cls: "", cc: "" };
    const display = formatAsnDisplay(entry);
    expect(display.inlayLabel).toBe("AS1");
    expect(display.completionDetail).toBe("AS1 · Test");
  });

  it("handles entry with no classification", () => {
    const display = formatAsnDisplay(longAsn);
    expect(display.hoverMarkdown).not.toContain("**Type**");
  });
});
