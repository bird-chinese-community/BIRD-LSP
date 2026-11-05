import {
  birdProjectConfigSchema,
  applyLintConfiguration,
  resolveAnalysisBudget,
} from "../src/project-config.js";
import type { BirdDiagnostic } from "../src/types.js";
import { expect, it } from "vitest";

it("validates nested config fields and accepts reserved linter.extends", () => {
  expect(
    birdProjectConfigSchema.safeParse({ crossFile: { maxDocumentBytes: 0 } })
      .success,
  ).toBe(false);
  expect(
    birdProjectConfigSchema.safeParse({ crossFile: { maxTotalBytes: 2.5 } })
      .success,
  ).toBe(false);
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

it("combines project byte budgets with the editor resource limit", () => {
  expect(resolveAnalysisBudget()).toEqual({
    maxDocumentBytes: 2 * 1024 * 1024,
    maxTotalBytes: 16 * 1024 * 1024,
  });
  expect(
    resolveAnalysisBudget(undefined, 4 * 1024 * 1024).maxDocumentBytes,
  ).toBe(4 * 1024 * 1024);
  expect(
    resolveAnalysisBudget({ maxDocumentBytes: 512, maxTotalBytes: 1024 }, 128),
  ).toEqual({ maxDocumentBytes: 128, maxTotalBytes: 1024 });
  expect(
    resolveAnalysisBudget({ maxDocumentBytes: 512, maxTotalBytes: 1024 }),
  ).toEqual({ maxDocumentBytes: 512, maxTotalBytes: 1024 });
});
