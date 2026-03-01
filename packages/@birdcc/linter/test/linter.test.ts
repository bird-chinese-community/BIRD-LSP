import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

describe("@birdcc/linter", () => {
  it("reports missing local as and neighbor in BGP", async () => {
    const sample = `
      protocol bgp edge_peer {
        import all;
      }
    `;

    const result = await lintBirdConfig(sample);
    const codes = result.diagnostics.map((item) => item.code);

    expect(codes).toContain("protocol/bgp-missing-local-as");
    expect(codes).toContain("protocol/bgp-missing-neighbor");
  });

  it("passes BGP protocol rule checks when fields exist", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `;

    const result = await lintBirdConfig(sample);
    const protocolDiagnostics = result.diagnostics.filter((item) =>
      item.code.startsWith("protocol/bgp-"),
    );

    expect(protocolDiagnostics).toHaveLength(0);
  });

  it("reports missing area for OSPF protocols", async () => {
    const sample = `
      protocol ospf core {
      }
    `;

    const result = await lintBirdConfig(sample);
    expect(result.diagnostics.some((item) => item.code === "protocol/ospf-area-required")).toBe(
      true,
    );
  });

  it("passes OSPF area required rule when area is configured", async () => {
    const sample = `
      protocol ospf core {
        area 0;
      }
    `;

    const result = await lintBirdConfig(sample);
    const ospfDiagnostics = result.diagnostics.filter(
      (item) => item.code === "protocol/ospf-area-required",
    );
    expect(ospfDiagnostics).toHaveLength(0);
  });

  it("does not treat comments as OSPF area configuration", async () => {
    const sample = `
      protocol ospf core {
        # area 0;
      }
    `;

    const result = await lintBirdConfig(sample);
    expect(result.diagnostics.some((item) => item.code === "protocol/ospf-area-required")).toBe(
      true,
    );
  });

  it("passes BGP next hop form checks for valid channel clauses", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          next hop self;
          next hop address;
          next hop keep;
          next hop 192.0.2.2;
          next hop ipv4 192.0.2.3;
          next hop prefer global;
        };
        ipv6 {
          next hop 2001:db8::2;
          next hop ipv6 2001:db8::3;
          next hop prefer local;
        };
      }
    `;

    const result = await lintBirdConfig(sample);
    const nextHopDiagnostics = result.diagnostics.filter(
      (item) => item.code === "protocol/bgp-next-hop-form",
    );

    expect(nextHopDiagnostics).toHaveLength(0);
  });

  it("reports invalid and misplaced BGP next hop clauses", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        next hop self;
        ipv4 {
          next hop foo;
        };
      }
    `;

    const result = await lintBirdConfig(sample);
    const nextHopDiagnostics = result.diagnostics.filter(
      (item) => item.code === "protocol/bgp-next-hop-form",
    );

    expect(nextHopDiagnostics).toHaveLength(2);
    expect(nextHopDiagnostics.some((item) => item.message.includes("outside channel block"))).toBe(
      true,
    );
    expect(nextHopDiagnostics.some((item) => item.message.includes("invalid next hop form"))).toBe(
      true,
    );
  });

  it("reports invalid statements based on protocol whitelist", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        area 0;
      }
    `;

    const result = await lintBirdConfig(sample);
    const diagnostics = result.diagnostics.filter(
      (item) => item.code === "structure/invalid-statement-in-protocol",
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("invalid statement");
  });

  it("reports missing authentication for BGP", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `;

    const result = await lintBirdConfig(sample);
    expect(result.diagnostics.some((item) => item.code === "security/missing-authentication")).toBe(
      true,
    );
  });

  it("passes authentication rule when password is configured", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        password "secret";
      }
    `;

    const result = await lintBirdConfig(sample);
    const diagnostics = result.diagnostics.filter(
      (item) => item.code === "security/missing-authentication",
    );
    expect(diagnostics).toHaveLength(0);
  });

  it("reports complex filters by performance rule", async () => {
    const statementLines = Array.from({ length: 60 }, (_, index) => `x${index} = ${index};`).join(
      "\n",
    );
    const sample = `
      filter massive_policy {
        ${statementLines}
        accept;
      }
    `;

    const result = await lintBirdConfig(sample);
    expect(
      result.diagnostics.some((item) => item.code === "performance/large-filter-expression"),
    ).toBe(true);
  });
});
