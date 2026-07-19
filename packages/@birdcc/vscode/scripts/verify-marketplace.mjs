#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INITIAL_DELAY_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_MAX_WAIT_MS = 600_000;
const supportedRegistries = new Set(["vscode", "openvsx"]);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseNonNegativeInteger = (value, optionName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return parsed;
};

export const parseArguments = (arguments_) => {
  const options = {
    initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs: DEFAULT_MAX_WAIT_MS,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];

    if (!argument.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument: ${argument}`);
    }

    index += 1;
    switch (argument) {
      case "--registry":
        options.registry = value;
        break;
      case "--manifest":
        options.manifestPath = value;
        break;
      case "--extension-name":
        options.extensionName = value;
        break;
      case "--version":
        options.version = value;
        break;
      case "--initial-delay-ms":
        options.initialDelayMs = parseNonNegativeInteger(value, argument);
        break;
      case "--poll-interval-ms":
        options.pollIntervalMs = parseNonNegativeInteger(value, argument);
        break;
      case "--max-wait-ms":
        options.maxWaitMs = parseNonNegativeInteger(value, argument);
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!supportedRegistries.has(options.registry)) {
    throw new Error("--registry must be either vscode or openvsx");
  }
  if (!options.manifestPath) {
    throw new Error("--manifest is required");
  }
  if (!options.extensionName) {
    throw new Error("--extension-name is required");
  }
  if (options.pollIntervalMs === 0 && options.maxWaitMs > 0) {
    throw new Error("--poll-interval-ms must be positive when polling");
  }

  return options;
};

export const buildMarketplaceTarget = ({
  registry,
  publisher,
  extensionName,
  version,
}) => {
  const encodedPublisher = encodeURIComponent(publisher);
  const encodedName = encodeURIComponent(extensionName);
  const encodedVersion = encodeURIComponent(version);

  if (registry === "vscode") {
    return {
      label: "VS Code Marketplace",
      statusUrl:
        `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/` +
        `${encodedPublisher}/vsextensions/${encodedName}/${encodedVersion}/vspackage`,
      previewUrl:
        "https://marketplace.visualstudio.com/items?itemName=" +
        `${encodedPublisher}.${encodedName}`,
    };
  }

  if (registry === "openvsx") {
    return {
      label: "Open VSX",
      statusUrl: `https://open-vsx.org/api/${encodedPublisher}/${encodedName}/${encodedVersion}`,
      previewUrl: `https://open-vsx.org/extension/${encodedPublisher}/${encodedName}`,
    };
  }

  throw new Error(`Unsupported marketplace registry: ${registry}`);
};

const fetchStatus = async (url, fetchImplementation) => {
  try {
    const response = await fetchImplementation(url, { method: "GET" });
    await response.body?.cancel();
    return response.status;
  } catch (error) {
    console.error(
      `Marketplace request failed: ${error instanceof Error ? error.message : error}`,
    );
    return 0;
  }
};

export const verifyMarketplace = async ({
  registry,
  publisher,
  extensionName,
  version,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  fetchImplementation = fetch,
  sleepImplementation = sleep,
}) => {
  const target = buildMarketplaceTarget({
    registry,
    publisher,
    extensionName,
    version,
  });

  console.log(
    `Verifying ${target.label} publication for ${publisher}.${extensionName} v${version}...`,
  );

  if (initialDelayMs > 0) {
    console.log(`Waiting ${initialDelayMs / 1000}s before the first check...`);
    await sleepImplementation(initialDelayMs);
  }

  const startedAt = Date.now();
  const deadline = startedAt + maxWaitMs;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const status = await fetchStatus(target.statusUrl, fetchImplementation);
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (status === 200) {
      console.log(
        `Extension v${version} verified on ${target.label} after ${elapsedSeconds}s.`,
      );
      console.log(`Listing: ${target.previewUrl}`);
      return;
    }

    console.log(
      `[${elapsedSeconds}s] Attempt ${attempt}: HTTP ${status}; publication is not ready.`,
    );

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Extension v${version} was not found on ${target.label} within ${maxWaitMs / 1000}s. Check ${target.previewUrl}`,
      );
    }

    await sleepImplementation(Math.min(pollIntervalMs, remainingMs));
  }
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(
    await readFile(path.resolve(process.cwd(), options.manifestPath), "utf8"),
  );

  if (!manifest.publisher || !manifest.version) {
    throw new Error("The extension manifest must define publisher and version");
  }

  await verifyMarketplace({
    ...options,
    publisher: manifest.publisher,
    version: options.version ?? manifest.version,
  });
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
