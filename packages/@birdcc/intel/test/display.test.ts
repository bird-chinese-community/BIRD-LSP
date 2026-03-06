import { describe, it, expect } from "vitest";
import { formatAsnDisplay } from "../src/display.js";
import type { AsnEntry } from "../src/types.js";

describe("formatAsnDisplay", () => {
  const exampleContent: AsnEntry = {
    asn: 13335,
    name: "Example Content Network",
    cls: "Content",
    cc: "US",
  };

  const exampleTransit: AsnEntry = {
    asn: 4134,
    name: "Example Transit Backbone",
    cls: "Transit/Access",
    cc: "CN",
  };

  const longAsn: AsnEntry = {
    asn: 1234567890,
    name: "Very Long ASN Corp",
    cls: "",
    cc: "DE",
  };

  const reservedAsn: AsnEntry = {
    asn: 65500,
    name: "RFC 6996",
    cls: "Reserved",
    cc: "ZZ",
  };

  it("generates correct inlay label for normal ASN", () => {
    const display = formatAsnDisplay(exampleContent);
    expect(display.inlayLabel).toBe("🇺🇸 AS13335");
  });

  it("truncates ASN with > 6 digits in inlay label", () => {
    const display = formatAsnDisplay(longAsn);
    expect(display.inlayLabel).toBe("🇩🇪 AS123456..");
  });

  it("generates correct completion detail", () => {
    const display = formatAsnDisplay(exampleContent);
    expect(display.completionDetail).toBe(
      "🇺🇸 AS13335 · Example Content Network",
    );
  });

  it("generates hover markdown with table", () => {
    const display = formatAsnDisplay(exampleTransit);
    expect(display.hoverMarkdown).toContain("### 🇨🇳 AS4134");
    expect(display.hoverMarkdown).toContain("Example Transit Backbone");
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

  it("uses the white flag for reserved ASNs", () => {
    const display = formatAsnDisplay(reservedAsn);
    expect(display.inlayLabel).toBe("🏳️ AS65500");
    expect(display.completionDetail).toContain("RFC 6996");
    expect(display.hoverMarkdown).toContain("| **Type** | Reserved |");
  });
});
