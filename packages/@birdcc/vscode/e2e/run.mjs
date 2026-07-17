import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const run = async () => {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.cjs");

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "birdcc-vscode-"));
  try {
    await runTests({
      version: "stable",
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions", `--user-data-dir=${userDataDir}`],
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
