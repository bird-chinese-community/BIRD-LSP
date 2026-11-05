import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const run = async () => {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.cjs");

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "birdcc-vscode-"));
  try {
    await mkdir(path.join(userDataDir, "workspace"));
    await mkdir(path.join(userDataDir, "secondary"));
    const workspacePath = path.join(userDataDir, "test.code-workspace");
    await writeFile(
      workspacePath,
      JSON.stringify({
        folders: [{ path: "workspace" }, { path: "secondary" }],
      }),
    );
    await runTests({
      version: process.env.VSCODE_TEST_VERSION ?? "stable",
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        "--disable-extensions",
        "--disable-workspace-trust",
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
