import { readFile } from "node:fs/promises";
import { delimiter, dirname, relative, resolve } from "node:path";
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
const candidates = await collectBirdConfigCandidatesFromRoots({
  roots: examplesRoots,
  maxBytes: Number.MAX_SAFE_INTEGER,
});
candidates.sort((left, right) => left.path.localeCompare(right.path));

describe("real-world config examples (full dprint formatter)", () => {
  it("discovers config examples", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it.each(
    candidates.map((file) => [relative(repoRoot, file.path), file] as const),
  )(
    "formats %s with dprint engine",
    async (_, file) => {
      const text = await readFile(file.path, "utf8");
      await expect(
        formatBirdConfig(text, { engine: "dprint", safeMode: false }),
        file.path,
      ).resolves.toMatchObject({
        engine: "dprint",
        text: expect.stringMatching(/\n$/u),
      });
    },
    90_000,
  );
});
