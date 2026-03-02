import { describe, expect, it } from "vitest";
import { lintBirdConfig } from "../src/index.js";

describe("@birdcc/linter smoke", () => {
  it("returns diagnostics in 32-rule taxonomy", async () => {
    const sample = `
      router id 192.0.2.1;
      protocol bgp edge {
        local as 65001;
        neighbor 192.0.2.2 as 65002;
      }
    `;

    const result = await lintBirdConfig(sample);

    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.diagnostics.every((item) => item.code.includes("/"))).toBe(
      true,
    );
  });
});
