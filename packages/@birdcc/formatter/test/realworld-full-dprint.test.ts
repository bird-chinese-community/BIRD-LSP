import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatBirdConfig } from "../src/index.js";

import { collectBirdConfigCandidates } from "../../../../tools/realworld-config-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const examplesRoot = resolve(repoRoot, "refer/config-examples");

describe("real-world config examples (full dprint formatter)", () => {
  it("formats all discovered config examples with dprint engine", async () => {
    const candidates = await collectBirdConfigCandidates({
      root: examplesRoot,
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
  });
});
