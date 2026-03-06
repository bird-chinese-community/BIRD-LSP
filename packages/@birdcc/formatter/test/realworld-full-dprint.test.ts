import { readFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatBirdConfig } from "../src/index.js";

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

describe("real-world config examples (full dprint formatter)", () => {
  it("formats all discovered config examples with dprint engine", async () => {
    const candidates = await collectBirdConfigCandidatesFromRoots({
      roots: examplesRoots,
      maxBytes: Number.MAX_SAFE_INTEGER,
    });

    candidates.sort((left, right) => left.path.localeCompare(right.path));
    expect(candidates.length).toBeGreaterThan(0);

    for (const file of candidates) {
      const text = await readFile(file.path, "utf8");
      const output = await formatBirdConfig(text, {
        engine: "dprint",
        safeMode: false,
      });

      expect(output.text.endsWith("\n"), file.path).toBe(true);
    }
  }, 30_000);
});
