import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { lintBirdConfig } from "../src/index.js";

import { collectBirdConfigCandidates } from "../../../../tools/realworld-config-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const examplesRoot = resolve(repoRoot, "refer/config-examples");

const DEFAULT_MAX_BYTES = 1024 * 1024;

describe("real-world config examples (linter smoke)", () => {
  it("lints discovered config examples within the configured size budget", async () => {
    const maxBytes = Number(
      process.env.BIRDCC_REALWORLD_LINTER_MAX_BYTES ?? DEFAULT_MAX_BYTES,
    );

    const candidates = await collectBirdConfigCandidates({
      root: examplesRoot,
      maxBytes,
    });

    candidates.sort((left, right) => left.path.localeCompare(right.path));
    expect(candidates.length).toBeGreaterThan(0);

    for (const file of candidates) {
      const text = await readFile(file.path, "utf8");
      const result = await lintBirdConfig(text, {
        uri: pathToFileURL(file.path).toString(),
      });

      const runtimeIssues = result.diagnostics.filter(
        (issue) => issue.code === "parser/runtime-error",
      );
      expect(runtimeIssues, file.path).toHaveLength(0);
    }
  });
});
