import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printHostLogs = async (userDataDir) => {
  const entries = await readdir(path.join(userDataDir, "logs"), {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries
    .filter(
      (item) =>
        item.isFile() &&
        (item.name.toLowerCase().includes("bird") ||
          item.name === "exthost.log"),
    )
    .slice(0, 20)) {
    const file = await open(path.join(entry.parentPath, entry.name), "r");
    try {
      const { size } = await file.stat();
      const buffer = Buffer.alloc(Math.min(size, 128 * 1024));
      await file.read(
        buffer,
        0,
        buffer.length,
        Math.max(0, size - buffer.length),
      );
      console.error(
        `Extension-host log: ${entry.name}\n${buffer.toString("utf8")}`,
      );
    } finally {
      await file.close();
    }
  }
};

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
        settings: { "birdcc.bird2-lsp.trace.server": "verbose" },
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
  } catch (error) {
    await printHostLogs(userDataDir).catch((logError) =>
      console.error(`Cannot read extension-host logs: ${String(logError)}`),
    );
    throw error;
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
