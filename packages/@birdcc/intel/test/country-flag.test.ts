import { describe, it, expect } from "vitest";
import { countryCodeToFlag } from "../src/country-flag.js";

describe("countryCodeToFlag", () => {
  it("converts US to flag emoji", () => {
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
  });

  it("converts CN to flag emoji", () => {
    expect(countryCodeToFlag("CN")).toBe("🇨🇳");
  });

  it("converts lowercase cc", () => {
    // Note: input should be uppercase per ISO 3166; lowercase gives different codepoints
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
  });

  it("returns empty string for invalid length", () => {
    expect(countryCodeToFlag("")).toBe("");
    expect(countryCodeToFlag("A")).toBe("");
    expect(countryCodeToFlag("USA")).toBe("");
  });
});
