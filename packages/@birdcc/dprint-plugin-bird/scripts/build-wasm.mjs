import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cargoTargetDir = resolve(packageDir, "target");
const outputWasmPath = resolve(
  cargoTargetDir,
  "wasm32-unknown-unknown",
  "release",
  "dprint_plugin_bird.wasm",
);
const distWasmPath = resolve(packageDir, "dist", "dprint-plugin-bird.wasm");

const rustupAvailable =
  spawnSync("rustup", ["--version"], { encoding: "utf8" }).status === 0;
const [rustcCommand, rustcArgs] = rustupAvailable
  ? ["rustup", ["run", "stable", "rustc", "--print", "target-libdir"]]
  : ["rustc", ["--print", "target-libdir"]];
const rustcResult = spawnSync(rustcCommand, rustcArgs, { encoding: "utf8" });
if (rustcResult.status !== 0) {
  throw new Error(
    `Failed to locate Rust toolchain: ${rustcResult.stderr || rustcResult.error?.message}`,
  );
}
const llvmAr = resolve(
  dirname(rustcResult.stdout.trim()),
  "bin",
  process.platform === "win32" ? "llvm-ar.exe" : "llvm-ar",
);
const archiveTool =
  process.env.AR_wasm32_unknown_unknown ??
  process.env["AR_wasm32-unknown-unknown"] ??
  llvmAr;
if (archiveTool === llvmAr && !existsSync(archiveTool)) {
  throw new Error(
    "WASM compilation requires LLVM archive tools. Run 'rustup component add llvm-tools --toolchain stable' or set AR_wasm32_unknown_unknown to llvm-ar.",
  );
}

const cargoArgs = [
  "build",
  "--release",
  "--target",
  "wasm32-unknown-unknown",
  "--target-dir",
  cargoTargetDir,
  "--features",
  "wasm",
];

// `rustup run` keeps the toolchain's dynamic library paths, which rust-lld
// needs to locate libLLVM on macOS.
const [buildCommand, buildArgs] = rustupAvailable
  ? ["rustup", ["run", "stable", "cargo", ...cargoArgs]]
  : ["cargo", cargoArgs];

const buildResult = spawnSync(buildCommand, buildArgs, {
  cwd: packageDir,
  encoding: "utf8",
  env: { ...process.env, AR_wasm32_unknown_unknown: archiveTool },
});

if (buildResult.status !== 0) {
  const reason =
    buildResult.stderr?.trim() ||
    buildResult.stdout?.trim() ||
    "unknown cargo error";
  throw new Error(`Failed to build dprint plugin wasm: ${reason}`);
}

if (!existsSync(outputWasmPath)) {
  throw new Error(
    `Cargo build succeeded but wasm artifact is missing: ${outputWasmPath}`,
  );
}

mkdirSync(dirname(distWasmPath), { recursive: true });
copyFileSync(outputWasmPath, distWasmPath);
