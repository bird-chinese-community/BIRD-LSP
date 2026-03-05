import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

const codesOf = async (text: string): Promise<string[]> => {
  const result = await lintBirdConfig(text);
  return result.diagnostics.map((item) => item.code);
};

describe("@birdcc/linter sym+cfg rules", () => {
  it("hits sym/duplicate", async () => {
    const codes = await codesOf(`
      filter dup_policy { accept; }
      filter dup_policy { reject; }
    `);

    expect(codes).toContain("sym/duplicate");
  });

  it("hits sym/undefined", async () => {
    const codes = await codesOf(`
      protocol bgp edge from missing_tpl {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("sym/undefined");
  });

  it("hits sym/proto-type-mismatch", async () => {
    const codes = await codesOf(`
      template ospf base_tpl { }
      protocol bgp edge from base_tpl {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("sym/proto-type-mismatch");
  });

  it("hits sym/filter-required", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        import filter missing_policy;
      }
    `);

    expect(codes).toContain("sym/filter-required");
  });

  it("does not hit sym/filter-required for built-in filter names", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        import filter all;
      }
    `);

    expect(codes).not.toContain("sym/filter-required");
  });

  it("hits sym/function-required", async () => {
    const codes = await codesOf(`
      filter f1 {
        missing_fn(1);
        accept;
      }
    `);

    expect(codes).toContain("sym/function-required");
  });

  it("does not hit sym/function-required for method calls or builtins", async () => {
    const codes = await codesOf(`
      filter f1 {
        bgp_community.contains((65000, 100));
        len(bgp_path);
        accept;
      }
    `);

    expect(codes).not.toContain("sym/function-required");
  });

  it("does not hit sym/function-required for delete() built-in", async () => {
    const codes = await codesOf(`
      function f1() {
        bgp_path = delete(bgp_path, 65001);
      }
    `);

    expect(codes).not.toContain("sym/function-required");
  });

  it("does not hit sym/function-required for comment text", async () => {
    const codes = await codesOf(`
      function f1() {
        # Implement(action)
        return true;
      }
    `);

    expect(codes).not.toContain("sym/function-required");
  });

  it("hits sym/table-required", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          table missing_table;
        };
      }
    `);

    expect(codes).toContain("sym/table-required");
  });

  it("hits sym/variable-scope", async () => {
    const codes = await codesOf(`
      filter f1 {
        x = 1;
        accept;
      }
    `);

    expect(codes).toContain("sym/variable-scope");
  });

  it("does not hit sym/variable-scope for function-leading declarations", async () => {
    const codes = await codesOf(`
      function f1 (int a; bgppath p)
      int remain;
      {
        remain = p.len;
        a = 1;
        return true;
      }
    `);

    expect(codes).not.toContain("sym/variable-scope");
  });

  it("hits cfg/no-protocol and cfg/missing-router-id", async () => {
    const codes = await codesOf(`
      filter only_filter {
        accept;
      }
    `);

    expect(codes).toContain("cfg/no-protocol");
    expect(codes).toContain("cfg/missing-router-id");
  });

  it("hits cfg/syntax-error", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001
    `);

    expect(codes).toContain("cfg/syntax-error");
  });

  it("hits cfg/value-out-of-range", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 5000000000;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("cfg/value-out-of-range");
  });

  it("hits cfg/value-out-of-range for reserved ASN 4294967295", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 4294967295;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("cfg/value-out-of-range");
  });

  it("does not hit cfg/value-out-of-range for large route limits", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv6 {
          import limit 99999999 action block;
          export limit 99999999 action block;
        };
      }
    `);

    expect(codes).not.toContain("cfg/value-out-of-range");
  });

  it("hits cfg/value-out-of-range for overflow route limits", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv6 {
          import limit 4294967296 action block;
        };
      }
    `);

    expect(codes).toContain("cfg/value-out-of-range");
  });

  it("hits cfg/switch-value-expected", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          import keep filtered maybe;
        };
      }
    `);

    expect(codes).toContain("cfg/switch-value-expected");
  });

  it("hits cfg/number-expected", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as abc;
        neighbor 192.0.2.1 as hello;
      }
    `);

    expect(codes).toContain("cfg/number-expected");
  });

  it("hits cfg/incompatible-type", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor neighbor-host as 65002;
      }
    `);

    expect(codes).toContain("cfg/incompatible-type");
  });

  it("hits cfg/ip-network-mismatch", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          next hop 2001:db8::1;
        };
      }
    `);

    expect(codes).toContain("cfg/ip-network-mismatch");
  });

  it("hits cfg/circular-template", async () => {
    const codes = await codesOf(`
      template bgp a from b { }
      template bgp b from a { }
    `);

    expect(codes).toContain("cfg/circular-template");
  });

  it("hits cfg/circular-template for multi-hop cycle", async () => {
    const codes = await codesOf(`
      template bgp a from b { }
      template bgp b from c { }
      template bgp c from a { }
    `);

    expect(codes).toContain("cfg/circular-template");
  });

  it("does not report missing protocol name for anonymous declarations", async () => {
    const result = await lintBirdConfig(
      "protocol static {\n  route 2001:db8::/32 reject;\n}\n",
    );
    const diagnostic = result.diagnostics.find((item) =>
      item.message.includes("Missing name for protocol declaration"),
    );

    expect(diagnostic).toBeUndefined();
  });
});
