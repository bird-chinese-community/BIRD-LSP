import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const sourceHoverDocsDir = path.resolve(
  packageRoot,
  "..",
  "lsp",
  "data",
  "hover-docs",
);
const sourceHoverUsageDir = path.resolve(
  packageRoot,
  "..",
  "lsp",
  "data",
  "hover-usage",
);
const targetDir = path.join(packageRoot, "data");
const targetHoverDocsDir = path.join(targetDir, "hover-docs");
const targetHoverUsageDir = path.join(targetDir, "hover-usage");
const legacyTargetPath = path.join(targetDir, "hover-docs.yaml");

await mkdir(targetDir, { recursive: true });
await rm(legacyTargetPath, { force: true });
await rm(targetHoverDocsDir, { recursive: true, force: true });
await rm(targetHoverUsageDir, { recursive: true, force: true });
await cp(sourceHoverDocsDir, targetHoverDocsDir, { recursive: true });
await cp(sourceHoverUsageDir, targetHoverUsageDir, { recursive: true });
