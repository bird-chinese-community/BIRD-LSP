#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SUMMARY_PATH = path.join(".tmp", "npm-release-summary.json");

const parseBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  const lowered = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(lowered)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(lowered)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options.set(rawKey, inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(rawKey, next);
      index += 1;
      continue;
    }

    options.set(rawKey, "true");
  }

  const packagesInput = options.get("packages") ?? "";
  const packages = Array.from(
    new Set(
      packagesInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return {
    packages,
    npmTag: options.get("tag") ?? "latest",
    dryRun: parseBoolean(options.get("dry-run"), true),
    allowPrivateOverride: parseBoolean(
      options.get("allow-private-override"),
      false,
    ),
  };
};

const FORBIDDEN_RELEASE_PACKAGES = new Map([
  [
    "@birdcc/intel",
    "Publish @birdcc/intel via the 'Intel ASN Database Update (Weekly)' workflow instead of the manual NPM Release job.",
  ],
]);

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
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

const listWorkspacePackages = () => {
  const output = execFileSync(
    "pnpm",
    ["-r", "list", "--depth", "-1", "--json"],
    { encoding: "utf8" },
  );
  const entries = JSON.parse(output);
  const manifestByName = new Map();

  for (const entry of entries) {
    if (!entry?.name || !entry?.path || entry.path === process.cwd()) {
      continue;
    }

    manifestByName.set(entry.name, {
      name: entry.name,
      path: entry.path,
      version: entry.version ?? "0.0.0",
      private: Boolean(entry.private),
    });
  }

  return manifestByName;
};

const publishOnePackage = async (workspacePackage, options) => {
  const packageJsonPath = path.join(workspacePackage.path, "package.json");
  const originalContent = await readFile(packageJsonPath, "utf8");
  const originalManifest = JSON.parse(originalContent);
  let patchedPrivate = false;

  try {
    if (originalManifest.private === true) {
      if (!options.allowPrivateOverride) {
        throw new Error(
          `Package ${workspacePackage.name} is private=true. Re-run with --allow-private-override true if this publish is intentional.`,
        );
      }

      const patchedManifest = {
        ...originalManifest,
        private: false,
      };
      await writeFile(
        packageJsonPath,
        `${JSON.stringify(patchedManifest, null, 2)}\n`,
        "utf8",
      );
      patchedPrivate = true;
    }

    await runCommand("pnpm", ["--filter", `${workspacePackage.name}...`, "build"]);

    const publishArgs = [
      "--filter",
      workspacePackage.name,
      "publish",
      "--access",
      "public",
      "--tag",
      options.npmTag,
      "--no-git-checks",
    ];

    if (options.dryRun) {
      publishArgs.push("--dry-run");
    }

    await runCommand("pnpm", publishArgs);

    return {
      name: workspacePackage.name,
      version: originalManifest.version,
      tag: options.npmTag,
      dryRun: options.dryRun,
      privateOverridden: patchedPrivate,
      publishedAt: new Date().toISOString(),
    };
  } finally {
    if (patchedPrivate) {
      await writeFile(packageJsonPath, originalContent, "utf8");
    }
  }
};

const main = async () => {
  const options = parseArgs();

  if (options.packages.length === 0) {
    throw new Error("No packages selected. Pass --packages <comma-separated-names>.");
  }

  for (const name of options.packages) {
    const reason = FORBIDDEN_RELEASE_PACKAGES.get(name);
    if (reason) {
      throw new Error(reason);
    }
  }

  if (!options.dryRun && !process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
    throw new Error(
      "Missing npm auth token. Set NODE_AUTH_TOKEN or NPM_TOKEN for non-dry-run publish.",
    );
  }

  const workspacePackages = listWorkspacePackages();
  const missing = options.packages.filter((name) => !workspacePackages.has(name));
  if (missing.length > 0) {
    throw new Error(`Unknown workspace package(s): ${missing.join(", ")}`);
  }

  const summary = [];

  for (const packageName of options.packages) {
    const workspacePackage = workspacePackages.get(packageName);
    if (!workspacePackage) {
      continue;
    }

    const result = await publishOnePackage(workspacePackage, options);
    summary.push(result);
  }

  await mkdir(path.dirname(SUMMARY_PATH), { recursive: true });
  await writeFile(
    SUMMARY_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        options,
        packages: summary,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Release summary written to ${SUMMARY_PATH}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
