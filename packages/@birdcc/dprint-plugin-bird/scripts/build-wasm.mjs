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
const ensureTarget = rustupAvailable
  ? spawnSync(
      "rustup",
      ["target", "add", "--toolchain", "stable", "wasm32-unknown-unknown"],
      {
        cwd: packageDir,
        encoding: "utf8",
      },
    )
  : { status: 0, stderr: "", stdout: "" };

if (ensureTarget.status !== 0) {
  const reason =
    ensureTarget.stderr?.trim() ||
    ensureTarget.stdout?.trim() ||
    "unknown rustup error";
  throw new Error(`Failed to add wasm32 target: ${reason}`);
}

const cargoArgs = [
  "build",
  "--release",
  "--target",
  "wasm32-unknown-unknown",
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
