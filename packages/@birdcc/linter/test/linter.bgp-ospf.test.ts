import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

const codesOf = async (text: string): Promise<string[]> => {
  const result = await lintBirdConfig(text);
  return result.diagnostics.map((item) => item.code);
};

describe("@birdcc/linter bgp+ospf rules", () => {
  it("hits bgp/missing-local-as", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("bgp/missing-local-as");
  });

  it("hits bgp/missing-neighbor", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
      }
    `);

    expect(codes).toContain("bgp/missing-neighbor");
  });

  it("hits bgp/missing-remote-as", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1;
      }
    `);

    expect(codes).toContain("bgp/missing-remote-as");
  });

  it("hits bgp/as-mismatch", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        internal;
      }
    `);

    expect(codes).toContain("bgp/as-mismatch");
  });

  it("hits bgp/timer-invalid", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65001;
        hold 2;
        keepalive 10;
      }
    `);

    expect(codes).toContain("bgp/timer-invalid");
  });

  it("hits ospf/missing-area", async () => {
    const codes = await codesOf(`
      protocol ospf core {
      }
    `);

    expect(codes).toContain("ospf/missing-area");
  });

  it("hits ospf/backbone-stub", async () => {
    const codes = await codesOf(`
      protocol ospf core {
        area 0 stub;
      }
    `);

    expect(codes).toContain("ospf/backbone-stub");
  });

  it("hits ospf/vlink-in-backbone", async () => {
    const codes = await codesOf(`
      protocol ospf core {
        area 0 vlink 192.0.2.1;
      }
    `);

    expect(codes).toContain("ospf/vlink-in-backbone");
  });

  it("hits ospf/asbr-stub-area", async () => {
    const codes = await codesOf(`
      protocol ospf core {
        area 1 stub;
        asbr on;
      }
    `);

    expect(codes).toContain("ospf/asbr-stub-area");
  });
});
