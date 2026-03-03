import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const sourceHoverDocsDir = path.join(packageRoot, "data", "hover-docs");
const targetHoverDocsDir = path.join(packageRoot, "dist", "hover-docs");
const sourceHoverUsageDir = path.join(packageRoot, "data", "hover-usage");
const targetHoverUsageDir = path.join(packageRoot, "dist", "hover-usage");
const legacyTargetPath = path.join(packageRoot, "dist", "hover-docs.yaml");

await rm(legacyTargetPath, { force: true });
await rm(targetHoverDocsDir, { recursive: true, force: true });
await rm(targetHoverUsageDir, { recursive: true, force: true });
await mkdir(path.dirname(targetHoverDocsDir), { recursive: true });
await cp(sourceHoverDocsDir, targetHoverDocsDir, { recursive: true });
await cp(sourceHoverUsageDir, targetHoverUsageDir, { recursive: true });
