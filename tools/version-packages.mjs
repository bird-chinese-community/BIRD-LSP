import { spawnSync } from "node:child_process";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

run(packageManager, ["exec", "changeset", "version"]);
run(packageManager, ["install", "--lockfile-only"]);

const changedFiles = spawnSync(
  "git",
  [
    "ls-files",
    "--modified",
    "--others",
    "--exclude-standard",
    "--",
    "packages",
  ],
  { encoding: "utf8" },
);

if (changedFiles.error) {
  throw changedFiles.error;
}

if (changedFiles.status !== 0) {
  process.exit(changedFiles.status ?? 1);
}

const changedChangelogs = changedFiles.stdout
  .split("\n")
  .filter((file) => file.endsWith("/CHANGELOG.md"));

if (changedChangelogs.length > 0) {
  run(packageManager, ["exec", "oxfmt", ...changedChangelogs]);
}
