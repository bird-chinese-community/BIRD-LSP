import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sortedConfigExampleSources } from "./config-examples-registry.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targets = [
  {
    path: resolve(repoRoot, "README.md"),
    intro:
      "We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:",
  },
  {
    path: resolve(repoRoot, "README.zh.md"),
    intro:
      "我们衷心感谢这些上游仓库提供的真实世界 BIRD 配置示例；它们帮助本项目持续验证解析、格式化、Lint 与编辑器支持能力：",
  },
  {
    path: resolve(repoRoot, "packages/@birdcc/vscode/README.md"),
    intro:
      "We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:",
  },
];

const START_MARKER = "<!-- CI START -->";
const END_MARKER = "<!-- CI END -->";
const args = new Set(process.argv.slice(2));
const isCheckMode = args.has("--check");

const replaceGeneratedBlock = (content, intro) => {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error("README is missing CI acknowledgement markers.");
  }

  const acknowledgementLines = [
    intro,
    "",
    ...sortedConfigExampleSources.map(
      (source) => {
        if (source.visibility === "private" && source.ghUsername) {
          return `- [\`@${source.ghUsername}\`](https://github.com/${source.ghUsername}) *(private feed)*`;
        }

        if (!source.repo) {
          throw new Error(`Missing acknowledgement target for source: ${source.id}`);
        }

        return `- [\`${source.repo}\`](https://github.com/${source.repo})`;
      },
    ),
  ];

  const generatedBlock = [START_MARKER, ...acknowledgementLines, END_MARKER].join(
    "\n",
  );

  return `${content.slice(0, start)}${generatedBlock}${content.slice(
    end + END_MARKER.length,
  )}`;
};

let changed = false;

for (const target of targets) {
  const original = await readFile(target.path, "utf8");
  const next = replaceGeneratedBlock(original, target.intro);

  if (next === original) {
    continue;
  }

  changed = true;

  if (!isCheckMode) {
    await writeFile(target.path, next);
  }
}

if (isCheckMode && changed) {
  console.error("README acknowledgement blocks are out of date.");
  process.exitCode = 1;
}
