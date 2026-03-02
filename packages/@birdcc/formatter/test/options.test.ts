import { describe, expect, it } from "vitest";
import { resolveOptions } from "../src/options.js";

describe("resolveOptions", () => {
  it("applies defaults when options are omitted", () => {
    expect(resolveOptions()).toEqual({
      engine: "dprint",
      indentSize: 2,
      lineWidth: 80,
      safeMode: true,
    });
  });

  it("keeps explicit valid values", () => {
    expect(
      resolveOptions({
        engine: "builtin",
        indentSize: 4,
        lineWidth: 120,
        safeMode: false,
      }),
    ).toEqual({
      engine: "builtin",
      indentSize: 4,
      lineWidth: 120,
      safeMode: false,
    });
  });

  it("falls back to defaults for invalid numeric values", () => {
    expect(
      resolveOptions({
        indentSize: 0,
        lineWidth: -1,
      }),
    ).toMatchObject({
      indentSize: 2,
      lineWidth: 80,
    });

    expect(
      resolveOptions({
        indentSize: 1.5,
        lineWidth: Number.NaN,
      }),
    ).toMatchObject({
      indentSize: 2,
      lineWidth: 80,
    });
  });
});
