import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const outputVsixPath = path.join(packageRoot, "dist", "bird2-lsp.vsix");
const temporaryVsixPath = path.join(packageRoot, "bird2-lsp.vsix");
const marketplaceExtensionName = "bird2-lsp";

const originalPackageJsonText = await readFile(packageJsonPath, "utf8");
const originalPackageJson = JSON.parse(originalPackageJsonText);

const marketplacePackageJson = {
  ...originalPackageJson,
  name: marketplaceExtensionName,
  private: false,
  devDependencies: {
    ...originalPackageJson.devDependencies,
  },
};

if (marketplacePackageJson.devDependencies) {
  delete marketplacePackageJson.devDependencies["@types/vscode"];
}

const runVscePackage = async () => {
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
      "https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode",
    ],
    { cwd: packageRoot },
  );

  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
};

try {
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(marketplacePackageJson, null, 2)}\n`,
    "utf8",
  );
  await runVscePackage();
  await mkdir(path.dirname(outputVsixPath), { recursive: true });
  await rename(temporaryVsixPath, outputVsixPath);
  process.stdout.write(
    `[marketplace] VSIX package generated: ${outputVsixPath}\n`,
  );
} finally {
  await rm(temporaryVsixPath, { force: true });
  await writeFile(packageJsonPath, originalPackageJsonText, "utf8");
}
