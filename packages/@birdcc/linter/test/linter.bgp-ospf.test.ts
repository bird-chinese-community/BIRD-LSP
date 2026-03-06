import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

const codesOf = async (
  text: string,
  options: { uri?: string } = {},
): Promise<string[]> => {
  const result = await lintBirdConfig(text, options);
  return result.diagnostics.map((item) => item.code);
};

const createTempProjectUri = async (
  relativePath: string,
  entryName = "bird.conf",
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-bgp-project-"));
  const targetPath = join(root, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(join(root, entryName), "# entry\n", "utf8");
  await writeFile(targetPath, "# fragment\n", "utf8");
  return new URL(`file://${targetPath}`).href;
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

  it("does not hit bgp/missing-local-as when protocol inherits from template", async () => {
    const codes = await codesOf(`
      template bgp base_tpl {
        local as 65001;
      }
      protocol bgp edge from base_tpl {
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).not.toContain("bgp/missing-local-as");
  });

  it("does not hit bgp/missing-local-as for local address with port and ASN", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local OWNIPv6_rr port 1179 as PUB_MYASN;
        neighbor 2001:db8::1 as 65002;
      }
    `);

    expect(codes).not.toContain("bgp/missing-local-as");
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
        neighbor 192.0.2.9 as internal;
        neighbor 192.0.2.1 as 65002;
      }
    `);

    expect(codes).toContain("bgp/as-mismatch");
  });

  it("does not hit bgp/missing-remote-as for internal/external sessions", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 as internal;
        neighbor 192.0.2.2 as external;
      }
    `);

    expect(codes).not.toContain("bgp/missing-remote-as");
  });

  it("does not hit bgp/missing-remote-as when neighbor uses scoped interface with ASN", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 % 'ens19' as 65002;
      }
    `);

    expect(codes).not.toContain("bgp/missing-remote-as");
  });

  it("hits bgp/missing-remote-as when neighbor uses scoped interface without ASN", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.1 % 'ens19';
      }
    `);

    expect(codes).toContain("bgp/missing-remote-as");
  });

  it("does not hit bgp/missing-remote-as for link-local IPv6 with interface scope", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor fe80::1980:1:1 % 'eth1' as 199594;
      }
    `);

    expect(codes).not.toContain("bgp/missing-remote-as");
  });

  it("does not hit bgp/missing-remote-as for symbolic ASN values", async () => {
    const codes = await codesOf(`
      protocol bgp edge {
        local as 65001;
        neighbor 2001:db8::1 as PUB_MYASN;
      }
    `);

    expect(codes).not.toContain("bgp/missing-remote-as");
  });

  it("does not hit bgp/missing-remote-as when ASN is inherited from template chain", async () => {
    const codes = await codesOf(`
      template bgp base_tpl {
        local as 65001;
        neighbor as internal;
      }

      template bgp child_tpl from base_tpl {
      }

      protocol bgp edge from child_tpl {
        neighbor 2001:db8::1;
      }
    `);

    expect(codes).not.toContain("bgp/missing-remote-as");
  });

  it("does not hit cfg/missing-router-id for nested route server fragments", async () => {
    const uri = await createTempProjectUri("route-server/edge.conf");
    const codes = await codesOf(
      `
        protocol bgp edge_rs_v4_1 {
          local as 65001;
          neighbor 203.0.113.1 as 65002;
          ipv4 {
            table table_edge_rs_v4;
          };
        }
      `,
      { uri },
    );

    expect(codes).not.toContain("cfg/missing-router-id");
    expect(codes).not.toContain("bgp/missing-local-as");
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
        area 1 {
          stub;
          asbr on;
        };
      }
    `);

    expect(codes).toContain("ospf/asbr-stub-area");
  });

  it("accepts area 0.0.0.0 as backbone area id", async () => {
    const codes = await codesOf(`
      protocol ospf core {
        area 0.0.0.0 stub;
      }
    `);

    expect(codes).toContain("ospf/backbone-stub");
  });
});
