import {
  birdProjectConfigSchema,
  applyLintConfiguration,
} from "../src/project-config.js";
import type { BirdDiagnostic } from "../src/types.js";
import { expect, it } from "vitest";

it("validates nested config fields and accepts reserved linter.extends", () => {
  expect(
    birdProjectConfigSchema.safeParse({ crossFile: { maxDepth: 65 } }).success,
  ).toBe(false);
  expect(
    birdProjectConfigSchema.safeParse({ crossFile: { maxFiles: 1025 } })
      .success,
  ).toBe(false);
  expect(
    birdProjectConfigSchema.safeParse({ formatter: { safeMode: "yes" } })
      .success,
  ).toBe(false);
  expect(
    birdProjectConfigSchema.safeParse({
      linter: { extends: ["bird-recommended"] },
    }).success,
  ).toBe(true);
  expect(
    birdProjectConfigSchema.safeParse({ linter: { extends: [42] } }).success,
  ).toBe(false);
  expect(
    birdProjectConfigSchema.safeParse({
      linter: { extends: "bird-recommended" },
    }).success,
  ).toBe(false);
});

it("applies enabled and exact or longest-prefix severity overrides", () => {
  const diagnostic: BirdDiagnostic = {
    code: "cfg/missing-router-id",
    message: "Missing router ID",
    severity: "error",
    source: "linter",
    range: { line: 1, column: 1, endLine: 1, endColumn: 1 },
  };
  expect(applyLintConfiguration([diagnostic], { enabled: false })).toEqual([]);
  expect(
    applyLintConfiguration([diagnostic], { rules: { "cfg/*": "info" } })[0]
      .severity,
  ).toBe("info");
  expect(
    applyLintConfiguration([diagnostic], {
      rules: { "cfg/*": "info", "cfg/missing-router-id": "off" },
    }),
  ).toEqual([]);
});
