import { describe, expect, it } from "vitest";
import { isValidPrefixLiteral } from "../src/prefix.js";

describe("isValidPrefixLiteral", () => {
  it("accepts valid IPv4 and IPv6 prefix literals", () => {
    expect(isValidPrefixLiteral("10.0.0.0/8")).toBe(true);
    expect(isValidPrefixLiteral("10.0.0.0/8+")).toBe(true);
    expect(isValidPrefixLiteral("10.0.0.0/8-")).toBe(true);
    expect(isValidPrefixLiteral("10.0.0.0/8{16,24}")).toBe(true);
    expect(isValidPrefixLiteral("2001:db8::/32")).toBe(true);
    expect(isValidPrefixLiteral("2001:db8::/32{48,64}")).toBe(true);
  });

  it("rejects malformed literals", () => {
    expect(isValidPrefixLiteral("")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/")).toBe(false);
    expect(isValidPrefixLiteral("/24")).toBe(false);
    expect(isValidPrefixLiteral("invalid/24")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{16}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{16,}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{,24}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{a,24}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{16,a}")).toBe(false);
  });

  it("rejects out-of-range prefix lengths", () => {
    expect(isValidPrefixLiteral("10.0.0.0/33")).toBe(false);
    expect(isValidPrefixLiteral("2001:db8::/129")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/-1")).toBe(false);
  });

  it("rejects invalid prefix range constraints", () => {
    expect(isValidPrefixLiteral("10.0.0.0/8{7,24}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{16,40}")).toBe(false);
    expect(isValidPrefixLiteral("10.0.0.0/8{24,16}")).toBe(false);
    expect(isValidPrefixLiteral("2001:db8::/32{16,64}")).toBe(false);
    expect(isValidPrefixLiteral("2001:db8::/32{48,140}")).toBe(false);
  });
});
