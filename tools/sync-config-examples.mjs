import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sortedConfigExampleSources } from "./config-examples-registry.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const configExamplesRoot = resolve(repoRoot, "refer/config-examples");
const indexFilePath = resolve(configExamplesRoot, "ci-lock.json");
const workRoot = resolve(repoRoot, ".tmp/config-examples-sync");
const cloneRoot = resolve(workRoot, "clones");
const stageRoot = resolve(workRoot, "stage");

const args = new Set(process.argv.slice(2));
const isCheckMode = args.has("--check");
const verbose = args.has("--verbose");

const configSnapshotExtensions = [
  ".conf",
  ".bird",
  ".bird2",
  ".bird3",
  ".bird2.conf",
  ".bird3.conf",
];
const configSnapshotBasenames = ["bird.conf", "bird2.conf", "bird3.conf"];

const log = (...parts) => {
  if (!verbose) {
    return;
  }
  console.log(...parts);
};

const runCommand = async ({ cmd, args: commandArgs, cwd }) => {
  const stdoutChunks = [];
  const stderrChunks = [];

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${cmd} ${commandArgs.join(" ")} failed with code ${code}\n${Buffer.concat(
            stderrChunks,
          ).toString("utf8")}`,
        ),
      );
    });
  });

  return {
    stdout: Buffer.concat(stdoutChunks).toString("utf8").trim(),
    stderr: Buffer.concat(stderrChunks).toString("utf8").trim(),
  };
};

const isConfigSnapshotFile = (filePath) => {
  const loweredPath = filePath.toLowerCase();
  const loweredBase = basename(filePath).toLowerCase();

  if (configSnapshotBasenames.includes(loweredBase)) {
    return true;
  }

  return configSnapshotExtensions.some((extension) =>
    loweredPath.endsWith(extension),
  );
};

const isConfFile = (filePath) => filePath.toLowerCase().endsWith(".conf");

const collectFiles = async (root) => {
  const output = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }

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

const fetchRepoMetadata = async (repo) => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bird-lsp-config-example-sync",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed for ${repo}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  return {
    defaultBranch: payload.default_branch ?? "main",
    ghUsername: payload.owner?.login ?? repo.split("/")[0] ?? "",
    licenseSpdx: payload.license?.spdx_id ?? "NOASSERTION",
  };
};

const syncOneSource = async ({ source, previousEntry }) => {
  const metadata = await fetchRepoMetadata(source.repo);
  const cloneDir = resolve(cloneRoot, source.id);
  const stageDir = resolve(stageRoot, source.path);

  log(`[${source.id}] cloning ${source.repoGit}`);
  await runCommand({
    cmd: "git",
    args: [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      metadata.defaultBranch,
      source.repoGit,
      cloneDir,
    ],
  });

  const commitResult = await runCommand({
    cmd: "git",
    args: ["-C", cloneDir, "rev-parse", "HEAD"],
  });
  const commit = commitResult.stdout;
  const changed = previousEntry?.commit !== commit;
  const syncedAt =
    !changed && previousEntry?.syncedAt
      ? previousEntry.syncedAt
      : new Date().toISOString();

  const allFiles = await collectFiles(cloneDir);
  const selectedFiles = allFiles.filter((filePath) =>
    isConfigSnapshotFile(filePath),
  );

  let confFiles = 0;
  let confBytes = 0;

  for (const filePath of selectedFiles) {
    const relPath = relative(cloneDir, filePath);
    const outputPath = resolve(stageDir, relPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(filePath, outputPath);

    if (isConfFile(filePath)) {
      confFiles += 1;
      confBytes += (await stat(filePath)).size;
    }
  }

  return {
    changed,
    entry: {
      id: source.id,
      birdMajor: source.birdMajor,
      path: source.path,
      repo: source.repo,
      repoGit: source.repoGit,
      ghUsername: metadata.ghUsername,
      licenseSpdx: metadata.licenseSpdx,
      defaultBranch: metadata.defaultBranch,
      commit,
      confFiles,
      confBytes,
      syncedAt,
    },
  };
};

const snapshotFiles = async (root) => {
  const exists = await stat(root)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return new Map();
  }

  const files = await collectFiles(root);
  const entries = await Promise.all(
    files.map(async (path) => {
      const content = await readFile(path);
      const digest = createHash("sha256").update(content).digest("hex");
      const fileStat = await stat(path);
      return [relative(root, path), `${fileStat.size}:${digest}`];
    }),
  );
  return new Map(entries.sort((a, b) => a[0].localeCompare(b[0])));
};

const snapshotsEqual = (left, right) => {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left.entries()) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
};

const loadPreviousIndex = async () => {
  try {
    const raw = await readFile(indexFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const byId = new Map(sources.map((item) => [item.id, item]));
    return {
      generatedAt:
        typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined,
      byId,
    };
  } catch {
    return {
      generatedAt: undefined,
      byId: new Map(),
    };
  }
};

const main = async () => {
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(cloneRoot, { recursive: true });
  await mkdir(stageRoot, { recursive: true });
  const previousIndex = await loadPreviousIndex();

  const sourceEntries = [];
  let hasSourceChanges = false;
  for (const source of sortedConfigExampleSources) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncOneSource({
      source,
      previousEntry: previousIndex.byId.get(source.id),
    });
    sourceEntries.push(result.entry);
    hasSourceChanges ||= result.changed;
  }

  sourceEntries.sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    generatedAt:
      hasSourceChanges || !previousIndex.generatedAt
        ? new Date().toISOString()
        : previousIndex.generatedAt,
    ranked: false,
    sources: sourceEntries,
  };
  const indexContent = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(resolve(stageRoot, "ci-lock.json"), indexContent, "utf8");

  const desiredSnapshot = await snapshotFiles(stageRoot);
  const currentSnapshot = await snapshotFiles(configExamplesRoot);
  const hasChanges = !snapshotsEqual(desiredSnapshot, currentSnapshot);

  if (isCheckMode) {
    console.log(
      hasChanges
        ? "Config examples are out of date."
        : "Config examples are up to date.",
    );
    process.exitCode = hasChanges ? 1 : 0;
    return;
  }

  await rm(configExamplesRoot, { recursive: true, force: true });
  await mkdir(dirname(indexFilePath), { recursive: true });
  await cp(stageRoot, configExamplesRoot, { recursive: true });

  console.log(
    `Synced ${sourceEntries.length} config-example sources to refer/config-examples`,
  );
};

try {
  await main();
} finally {
  await rm(workRoot, { recursive: true, force: true });
}
