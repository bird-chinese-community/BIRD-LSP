import { readFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseBirdConfig } from "@birdcc/parser";

import { __formatBirdConfigBuiltinForTest } from "../src/index.js";

import { collectBirdConfigCandidatesFromRoots } from "../../../../tools/realworld-config-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const additionalRoots = (process.env.BIRDCC_PRIVATE_CONFIG_EXAMPLE_ROOTS ?? "")
  .split(delimiter)
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const examplesRoots = [
  resolve(repoRoot, "refer/config-examples"),
  ...additionalRoots,
];

const DEFAULT_MAX_BYTES = 128 * 1024;
const DEFAULT_LIMIT = 15;

describe("real-world config examples (formatter smoke)", () => {
  it("formats selected config examples with builtin engine", async () => {
    const maxBytes = Number(
      process.env.BIRDCC_REALWORLD_MAX_BYTES ?? DEFAULT_MAX_BYTES,
    );
    const limit = Number(process.env.BIRDCC_REALWORLD_LIMIT ?? DEFAULT_LIMIT);

    const candidates = await collectBirdConfigCandidatesFromRoots({
      roots: examplesRoots,
      maxBytes,
    });

    candidates.sort((left, right) => right.bytes - left.bytes);
    const selected = candidates.slice(0, Math.max(0, limit));
    if (selected.length === 0) {
      return;
    }

    for (const file of selected) {
      const text = await readFile(file.path, "utf8");
      const output = await __formatBirdConfigBuiltinForTest(text);

      expect(output.text.endsWith("\n"), file.path).toBe(true);
      const parsed = await parseBirdConfig(output.text);
      const runtimeIssues = parsed.issues.filter(
        (issue) => issue.code === "parser/runtime-error",
      );
      expect(runtimeIssues, file.path).toHaveLength(0);
    }
  });
});
