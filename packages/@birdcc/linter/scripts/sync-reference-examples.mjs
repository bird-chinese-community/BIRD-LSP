import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "..", "..", "..");

const sourceDir = path.join(
  workspaceRoot,
  "refer",
  "vscode-bird2",
  "syntaxes",
  "bird-tm-grammar",
  "sample",
);
const targetDir = path.join(packageRoot, "examples");

await mkdir(targetDir, { recursive: true });

const existingEntries = await readdir(targetDir, { withFileTypes: true });
for (const entry of existingEntries) {
  if (!entry.name.endsWith(".conf")) {
    continue;
  }

  await rm(path.join(targetDir, entry.name), { force: true });
}

const sourceEntries = await readdir(sourceDir, { withFileTypes: true });
for (const entry of sourceEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".conf")) {
    continue;
  }

  await cp(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
}
