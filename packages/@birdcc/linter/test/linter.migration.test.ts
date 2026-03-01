import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

const LEGACY_PATTERNS = [
  /^protocol\//,
  /^security\//,
  /^performance\//,
  /^structure\//,
  /^semantic\//,
  /^parser\//,
  /^syntax\//,
];

describe("@birdcc/linter migration", () => {
  it("maps parser/core diagnostics to 32-rule taxonomy", async () => {
    const result = await lintBirdConfig(`
      filter dup_policy {
        accept;
      }

      filter dup_policy {
        x = 1;
        if net ~ [10.0.0.0/129] then accept;
      }

      protocol bgp edge from missing_tpl {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    const codes = result.diagnostics.map((item) => item.code);

    expect(codes).toContain("sym/duplicate");
    expect(codes).toContain("sym/undefined");
    expect(codes).toContain("sym/variable-scope");
    expect(codes).toContain("net/invalid-prefix-length");
  });

  it("maps parser recovery issues to cfg/syntax-error", async () => {
    const result = await lintBirdConfig(`
      protocol bgp edge {
        local as 65001
    `);

    const codes = result.diagnostics.map((item) => item.code);
    expect(codes).toContain("cfg/syntax-error");
  });

  it("does not output legacy code categories", async () => {
    const result = await lintBirdConfig(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        import filter missing_policy;
        ipv4 {
          max prefix 128;
        };
      }
    `);

    for (const code of result.diagnostics.map((item) => item.code)) {
      expect(LEGACY_PATTERNS.some((pattern) => pattern.test(code))).toBe(false);
    }
  });
});
