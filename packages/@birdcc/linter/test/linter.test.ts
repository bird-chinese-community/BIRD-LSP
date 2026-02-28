import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

describe("@birdcc/linter", () => {
  it("reports missing local as and neighbor in BGP", () => {
    const sample = `
      protocol bgp edge_peer {
        import all;
      }
    `;

    const result = lintBirdConfig(sample);
    const codes = result.diagnostics.map((item) => item.code);

    expect(codes).toContain("protocol/bgp-missing-local-as");
    expect(codes).toContain("protocol/bgp-missing-neighbor");
  });

  it("passes BGP protocol rule checks when fields exist", () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
      }
    `;

    const result = lintBirdConfig(sample);
    const protocolDiagnostics = result.diagnostics.filter((item) =>
      item.code.startsWith("protocol/bgp-"),
    );

    expect(protocolDiagnostics).toHaveLength(0);
  });
});
