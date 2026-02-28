import { describe, expect, it } from "vitest";
import { buildCoreSnapshot } from "../src/index.js";

describe("@birdcc/core boundaries", () => {
  it("reports duplicate symbol definitions", () => {
    const sample = `
      filter policy_a { accept; }
      filter policy_a { reject; }
    `;

    const result = buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/duplicate-definition" && item.severity === "error",
      ),
    ).toBe(true);
  });

  it("reports undefined template reference", () => {
    const sample = `
      protocol bgp edge from missing_template {
      }
    `;

    const result = buildCoreSnapshot(sample);
    expect(result.diagnostics.some((item) => item.code === "semantic/undefined-reference")).toBe(
      true,
    );
  });

  it("passes when template exists", () => {
    const sample = `
      template bgp edge_tpl {
      }

      protocol bgp edge from edge_tpl {
      }
    `;

    const result = buildCoreSnapshot(sample);
    expect(result.diagnostics).toHaveLength(0);
  });
});
