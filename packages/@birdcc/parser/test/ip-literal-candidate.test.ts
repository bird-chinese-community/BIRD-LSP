import { describe, expect, it } from "vitest";
import {
  isIpLiteralCandidate,
  isStrictIpLiteral,
  isStrictIpv4Literal,
  isStrictIpv6Literal,
} from "../src/declarations/shared.js";

describe("ip literal candidate helpers", () => {
  it("accepts strict IPv4/IPv6 literals", () => {
    expect(isStrictIpv4Literal("192.0.2.1")).toBe(true);
    expect(isStrictIpv6Literal("2001:db8::1")).toBe(true);
    expect(isStrictIpLiteral("192.0.2.1")).toBe(true);
    expect(isStrictIpLiteral("2001:db8::1")).toBe(true);
  });

  it("rejects invalid strict literals", () => {
    expect(isStrictIpv4Literal("203.0.113.999")).toBe(false);
    expect(isStrictIpv6Literal("2001:db8::gg")).toBe(false);
    expect(isStrictIpLiteral("not-an-ip")).toBe(false);
  });

  it("keeps ip-like malformed inputs as candidates for semantic diagnostics", () => {
    expect(isIpLiteralCandidate("203.0.113.999")).toBe(true);
    expect(isIpLiteralCandidate("2001:db8::fffff")).toBe(true);
    expect(isIpLiteralCandidate("2001:db8:::1")).toBe(true);
  });

  it("filters out non-ip tokens and malformed shapes", () => {
    expect(isIpLiteralCandidate("")).toBe(false);
    expect(isIpLiteralCandidate("  ")).toBe(false);
    expect(isIpLiteralCandidate("router-id")).toBe(false);
    expect(isIpLiteralCandidate("203.0.113")).toBe(false);
    expect(isIpLiteralCandidate("203..113.1")).toBe(false);
    expect(isIpLiteralCandidate("::ffff:203.0.113.999")).toBe(false);
    expect(isIpLiteralCandidate("2001:db8::gg")).toBe(false);
    expect(isIpLiteralCandidate("2001:db8::1/64")).toBe(false);
  });
});
