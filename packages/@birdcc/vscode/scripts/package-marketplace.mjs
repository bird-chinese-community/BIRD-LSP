import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "..", "..", "..");
const outputVsixPath = path.join(packageRoot, "release", "bird2-lsp.vsix");
const legacyOutputVsixPath = path.join(packageRoot, "dist", "bird2-lsp.vsix");
const temporaryVsixPath = path.join(packageRoot, "bird2-lsp.vsix");
const marketplaceExtensionName = "bird2-lsp";
const marketplaceBaseContentUrl =
  "https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode";

const readJson = async (targetPath) =>
  JSON.parse(await readFile(targetPath, "utf8"));

const runPnpmDeploy = async (deployDir) => {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    [
      "--config.node-linker=hoisted",
      "--filter",
      "@birdcc/vscode",
      "deploy",
      "--prod",
      "--legacy",
      deployDir,
    ],
    { cwd: workspaceRoot },
  );

  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
};

const runVscePackage = async (cwd) => {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    [
      "dlx",
      "@vscode/vsce",
      "package",
      "--out",
      temporaryVsixPath,
      "--no-dependencies",
      "--baseContentUrl",
      marketplaceBaseContentUrl,
    ],
    { cwd },
  );

  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
};

const prepareDeployPackageJson = async (deployDir) => {
  const deployPackageJsonPath = path.join(deployDir, "package.json");
  const deployPackageJson = await readJson(deployPackageJsonPath);

  const marketplacePackageJson = {
    ...deployPackageJson,
    name: marketplaceExtensionName,
    private: false,
    devDependencies: {
      ...deployPackageJson.devDependencies,
    },
  };

  if (marketplacePackageJson.devDependencies) {
    delete marketplacePackageJson.devDependencies["@types/vscode"];
  }

  await writeFile(
    deployPackageJsonPath,
    `${JSON.stringify(marketplacePackageJson, null, 2)}\n`,
    "utf8",
  );
};

const runCommand = async (command, args, cwd) => {
  const { stdout, stderr } = await execFileAsync(command, args, { cwd });
  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
};

const injectNodeModulesIntoVsix = async (deployDir, vsixPath) => {
  const patchDir = await mkdtemp(
    path.join(os.tmpdir(), "bird2-lsp-vsix-patch-"),
  );

  try {
    await runCommand("unzip", ["-q", vsixPath, "-d", patchDir], patchDir);
    await cp(
      path.join(deployDir, "node_modules"),
      path.join(patchDir, "extension", "node_modules"),
      {
        recursive: true,
      },
    );

    await rm(vsixPath, { force: true });
    await runCommand("zip", ["-q", "-r", vsixPath, "."], patchDir);
  } finally {
    await rm(patchDir, { recursive: true, force: true });
  }
};

let deployDir;

try {
  deployDir = await mkdtemp(path.join(os.tmpdir(), "bird2-lsp-deploy-"));
  await runPnpmDeploy(deployDir);
  await prepareDeployPackageJson(deployDir);

  await rm(outputVsixPath, { force: true });
  await rm(legacyOutputVsixPath, { force: true });
  await runVscePackage(deployDir);
  await injectNodeModulesIntoVsix(deployDir, temporaryVsixPath);
  await mkdir(path.dirname(outputVsixPath), { recursive: true });
  await rename(temporaryVsixPath, outputVsixPath);
  process.stdout.write(
    `[marketplace] VSIX package generated: ${outputVsixPath}\n`,
  );
} finally {
  await rm(temporaryVsixPath, { force: true });
  if (deployDir) {
    await rm(deployDir, { recursive: true, force: true });
  }
}
