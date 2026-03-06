import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = dirname(scriptDir);

const generatedRootWasmCandidates = [
  join(pkgDir, "tree-sitter-birdcc.wasm"),
  join(pkgDir, "tree-sitter-bird.wasm"),
];
const srcWasm = join(pkgDir, "src", "tree-sitter-birdcc.wasm");
const distWasm = join(pkgDir, "dist", "tree-sitter-birdcc.wasm");

const generatedRootWasm = generatedRootWasmCandidates.find((path) =>
  existsSync(path),
);

if (generatedRootWasm && generatedRootWasm !== srcWasm) {
  renameSync(generatedRootWasm, srcWasm);
}

if (!existsSync(srcWasm)) {
  throw new Error(`Missing WASM grammar file: ${srcWasm}`);
}

mkdirSync(dirname(distWasm), { recursive: true });
copyFileSync(srcWasm, distWasm);
