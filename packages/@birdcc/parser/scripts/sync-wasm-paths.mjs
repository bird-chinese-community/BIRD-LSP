import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = dirname(scriptDir);

const rootWasm = join(pkgDir, "tree-sitter-birdcc.wasm");
const srcWasm = join(pkgDir, "src", "tree-sitter-birdcc.wasm");
const distWasm = join(pkgDir, "dist", "tree-sitter-birdcc.wasm");

if (existsSync(rootWasm)) {
  renameSync(rootWasm, srcWasm);
}

if (!existsSync(srcWasm)) {
  throw new Error(`Missing WASM grammar file: ${srcWasm}`);
}

mkdirSync(dirname(distWasm), { recursive: true });
copyFileSync(srcWasm, distWasm);
