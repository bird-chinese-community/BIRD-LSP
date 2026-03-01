import { describe, expect, it } from "vitest";
import { buildCoreSnapshot } from "../src/index.js";

describe("@birdcc/core boundaries", () => {
  it("reports duplicate symbol definitions", async () => {
    const sample = `
      filter policy_a { accept; }
      filter policy_a { reject; }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/duplicate-definition" && item.severity === "error",
      ),
    ).toBe(true);
  });

  it("reports undefined template reference", async () => {
    const sample = `
      protocol bgp edge from missing_template {
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(result.diagnostics.some((item) => item.code === "semantic/undefined-reference")).toBe(
      true,
    );
  });

  it("reports invalid router id", async () => {
    const sample = `
      router id 999.0.0.1;
    `;

    const result = await buildCoreSnapshot(sample);
    expect(result.diagnostics.some((item) => item.code === "semantic/invalid-router-id")).toBe(
      true,
    );
  });

  it("reports invalid neighbor address", async () => {
    const sample = `
      protocol bgp edge {
        local as 65001;
        neighbor 203.0.113.999 as 65002;
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some((item) => item.code === "semantic/invalid-neighbor-address"),
    ).toBe(true);
  });

  it("reports invalid CIDR literal", async () => {
    const sample = `
      filter export_policy {
        if net ~ [ 2001:db8::/200 ] then reject;
        accept;
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(result.diagnostics.some((item) => item.code === "semantic/invalid-cidr")).toBe(true);
  });

  it("passes valid router and prefix literals", async () => {
    const sample = `
      router id 192.0.2.1;

      template bgp edge_tpl {
      }

      protocol bgp edge from edge_tpl {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          import where net.len <= 24;
        };
      }

      filter export_policy {
        if net ~ [ 10.0.0.0/8+, 2001:db8::/32{33,128} ] then reject;
        accept;
      }
    `;

    const result = await buildCoreSnapshot(sample);

    const errorCodes = result.diagnostics
      .filter((item) => item.severity === "error")
      .map((item) => item.code);

    expect(errorCodes).not.toContain("semantic/invalid-router-id");
    expect(errorCodes).not.toContain("semantic/invalid-neighbor-address");
    expect(errorCodes).not.toContain("semantic/invalid-cidr");
  });
});
