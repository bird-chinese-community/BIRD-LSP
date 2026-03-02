import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

const codesOf = async (text: string): Promise<string[]> => {
  const result = await lintBirdConfig(text);
  return result.diagnostics.map((item) => item.code);
};

describe("@birdcc/linter net+type rules", () => {
  it("hits net/invalid-prefix-length", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ [10.0.0.0/129] then accept;
      }
    `);

    expect(codes).toContain("net/invalid-prefix-length");
  });

  it("hits net/invalid-ipv4-prefix", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ [10.0.500.0/24] then accept;
      }
    `);

    expect(codes).toContain("net/invalid-ipv4-prefix");
  });

  it("hits net/invalid-ipv6-prefix", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ [2001:db8::zz/64] then accept;
      }
    `);

    expect(codes).toContain("net/invalid-ipv6-prefix");
  });

  it("hits net/invalid-ipv4-prefix for unknown address token", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ [example/24] then accept;
      }
    `);

    expect(codes).toContain("net/invalid-ipv4-prefix");
  });

  it("hits net/max-prefix-length", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ [10.0.0.0/33] then accept;
      }
    `);

    expect(codes).toContain("net/max-prefix-length");
  });

  it("hits net/invalid-prefix-length for negative max prefix", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          max prefix -100;
        };
      }
    `);

    expect(codes).toContain("net/invalid-prefix-length");
  });

  it("hits net/max-prefix-length for ipv6 channel max prefix overflow", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 2001:db8::1 as 65002;
        ipv6 {
          max prefix 129;
        };
      }
    `);

    expect(codes).toContain("net/max-prefix-length");
  });

  it("hits net/invalid-prefix-length for non-numeric max prefix token", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          max prefix unlimited;
        };
      }
    `);

    expect(codes).toContain("net/invalid-prefix-length");
  });

  it("hits type/mismatch", async () => {
    const codes = await codesOf(`
      filter f1 {
        int x = "hello";
        accept;
      }
    `);

    expect(codes).toContain("type/mismatch");
  });

  it("hits type/not-iterable", async () => {
    const codes = await codesOf(`
      filter f1 {
        if net ~ 1 then accept;
      }
    `);

    expect(codes).toContain("type/not-iterable");
  });

  it("hits type/set-incompatible", async () => {
    const codes = await codesOf(`
      filter f1 {
        if 10.0.0.1 ~ [1, 2, 3] then accept;
      }
    `);

    expect(codes).toContain("type/set-incompatible");
  });
});
