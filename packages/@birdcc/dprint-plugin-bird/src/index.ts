import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wasmPath = fileURLToPath(new URL("./dprint-plugin-bird.wasm", import.meta.url));

export const getPath = (): string => wasmPath;

export const getBuffer = (): Uint8Array => readFileSync(wasmPath);
