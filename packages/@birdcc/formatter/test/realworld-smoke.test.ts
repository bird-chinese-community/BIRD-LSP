import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseBirdConfig } from "@birdcc/parser";

import { __formatBirdConfigBuiltinForTest } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const examplesRoot = resolve(repoRoot, "refer/config-examples");

const DEFAULT_MAX_BYTES = 128 * 1024;
const DEFAULT_LIMIT = 15;

const allowedExtensions = new Set([
  ".conf",
  ".bird",
  ".bird2",
  ".bird3",
  ".bird2.conf",
  ".bird3.conf",
]);

const allowedBasenames = new Set(["bird.conf", "bird2.conf", "bird3.conf"]);

const isBirdConfigFile = (path: string): boolean => {
  const extension = extname(path);
  if (allowedExtensions.has(extension)) {
    return true;
  }

  const filename = path.split("/").pop() ?? path;
  return allowedBasenames.has(filename);
};

const discoverFiles = async (root: string): Promise<readonly string[]> => {
  const output: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        output.push(entryPath);
      }
    }
  }

  return output;
};

describe("real-world config examples (formatter smoke)", () => {
  it("formats selected config examples with builtin engine", async () => {
    const maxBytes = Number(
      process.env.BIRDCC_REALWORLD_MAX_BYTES ?? DEFAULT_MAX_BYTES,
    );
    const limit = Number(process.env.BIRDCC_REALWORLD_LIMIT ?? DEFAULT_LIMIT);

    const allFiles = await discoverFiles(examplesRoot);
    const candidates: Array<{ path: string; bytes: number }> = [];

    for (const path of allFiles) {
      if (!isBirdConfigFile(path)) {
        continue;
      }

      let bytes = 0;
      try {
        bytes = (await stat(path)).size;
      } catch {
        continue;
      }

      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > maxBytes) {
        continue;
      }

      candidates.push({ path, bytes });
    }

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
