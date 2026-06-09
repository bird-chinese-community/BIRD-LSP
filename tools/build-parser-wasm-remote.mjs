#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const defaultHost = "home-debian";
const defaultRemoteDir = "/tmp/bird-lsp-wasm-build";
const wasmPath = "packages/@birdcc/parser/src/tree-sitter-birdcc.wasm";
const repoRoot = new URL("..", import.meta.url).pathname;

const usage = `Usage: node tools/build-parser-wasm-remote.mjs [options]

Build the parser WASM on a remote host and sync the generated artifact back.

Options:
  --host <host>             SSH host to use. Default: ${defaultHost}
  --remote-dir <path>       Remote working directory. Default: ${defaultRemoteDir}
  --help                    Show this help text.
`;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    host: defaultHost,
    remoteDir: defaultRemoteDir,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") {
      continue;
    }

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    const [key, inlineValue] = token.startsWith("--")
      ? token.slice(2).split("=", 2)
      : [token, undefined];
    if (key !== "host" && key !== "remote-dir") {
      throw new Error(`Unknown option: ${token}`);
    }

    const nextValue = inlineValue ?? args[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    if (key === "host") {
      options.host = nextValue;
    } else {
      options.remoteDir = nextValue;
    }
  }

  return options;
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")} (exit code ${String(code)})`,
        ),
      );
    });
  });

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const ensureLocalRsync = async () => {
  await run("rsync", ["--version"], { stdio: "ignore" }).catch((error) => {
    throw new Error(
      `Local rsync is required before remote WASM builds can run.\n${error.message}`,
    );
  });
};

const ensureRemoteReady = async ({ host, remoteDir }) => {
  const command = [
    "command -v rsync >/dev/null",
    "command -v corepack >/dev/null",
    `mkdir -p ${shellQuote(remoteDir)}`,
  ].join(" && ");

  await run("ssh", [host, command]);
};

const syncToRemote = async ({ host, remoteDir }) => {
  await run("rsync", [
    "-az",
    "--delete",
    "--exclude",
    ".git/",
    "--exclude",
    "node_modules/",
    "--exclude",
    ".turbo/",
    "--exclude",
    ".tmp/",
    "--exclude",
    "dist/",
    "./",
    `${host}:${remoteDir}/`,
  ]);
};

const buildRemote = async ({ host, remoteDir }) => {
  const command = [
    `cd ${shellQuote(remoteDir)}`,
    "corepack enable",
    "corepack pnpm install --frozen-lockfile",
    "corepack pnpm --filter @birdcc/parser build:wasm",
  ].join(" && ");

  await run("ssh", [host, command]);
};

const syncFromRemote = async ({ host, remoteDir }) => {
  await run("rsync", ["-az", `${host}:${remoteDir}/${wasmPath}`, wasmPath]);
};

const main = async () => {
  const options = parseArgs();
  if (options.help) {
    console.log(usage.trimEnd());
    return;
  }

  console.log(`Building parser WASM on ${options.host}:${options.remoteDir}`);
  await ensureLocalRsync();
  await ensureRemoteReady(options);
  await syncToRemote(options);
  await buildRemote(options);
  await syncFromRemote(options);
  console.log(`Synced ${wasmPath} from ${options.host}`);
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
