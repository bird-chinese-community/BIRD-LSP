import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseBirdConfig } from "../src/index.js";

import { collectBirdConfigCandidates } from "../../../../tools/realworld-config-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const examplesRoot = resolve(repoRoot, "refer/config-examples");

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_LIMIT = 20;

describe("real-world config examples (smoke)", () => {
  it("parses selected config examples without parser runtime failure", async () => {
    const maxBytes = Number(
      process.env.BIRDCC_REALWORLD_MAX_BYTES ?? DEFAULT_MAX_BYTES,
    );
    const limit = Number(process.env.BIRDCC_REALWORLD_LIMIT ?? DEFAULT_LIMIT);

    const candidates = await collectBirdConfigCandidates({
      root: examplesRoot,
      maxBytes,
    });

    candidates.sort((left, right) => right.bytes - left.bytes);
    const selected = candidates.slice(0, Math.max(0, limit));
    if (selected.length === 0) {
      return;
    }

    for (const file of selected) {
      const text = await readFile(file.path, "utf8");
      const parsed = await parseBirdConfig(text);

      const runtimeIssues = parsed.issues.filter(
        (issue) => issue.code === "parser/runtime-error",
      );
      expect(runtimeIssues, file.path).toHaveLength(0);
    }
  });
});
