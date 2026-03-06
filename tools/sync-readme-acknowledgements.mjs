import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sortedConfigExampleSources } from "./config-examples-registry.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targets = [
  resolve(repoRoot, "README.md"),
  resolve(repoRoot, "packages/@birdcc/vscode/README.md"),
];

const START_MARKER = "<!-- CI START -->";
const END_MARKER = "<!-- CI END -->";
const args = new Set(process.argv.slice(2));
const isCheckMode = args.has("--check");

const acknowledgementLines = [
  "We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:",
  "",
  ...sortedConfigExampleSources.map(
    (source) =>
      `- [\`${source.repo}\`](https://github.com/${source.repo})`,
  ),
];

const generatedBlock = [START_MARKER, ...acknowledgementLines, END_MARKER].join(
  "\n",
);

const replaceGeneratedBlock = (content) => {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error("README is missing CI acknowledgement markers.");
  }

  return `${content.slice(0, start)}${generatedBlock}${content.slice(
    end + END_MARKER.length,
  )}`;
};

let changed = false;

for (const target of targets) {
  const original = await readFile(target, "utf8");
  const next = replaceGeneratedBlock(original);

  if (next === original) {
    continue;
  }

  changed = true;

  if (!isCheckMode) {
    await writeFile(target, next);
  }
}

if (isCheckMode && changed) {
  console.error("README acknowledgement blocks are out of date.");
  process.exitCode = 1;
}
