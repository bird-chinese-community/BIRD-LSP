import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const sourcePath = path.join(packageRoot, "src", "hover-docs.yaml");
const targetDir = path.join(packageRoot, "dist");
const targetPath = path.join(targetDir, "hover-docs.yaml");

await mkdir(targetDir, { recursive: true });
await copyFile(sourcePath, targetPath);
