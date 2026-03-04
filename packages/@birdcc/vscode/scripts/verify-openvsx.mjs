#!/usr/bin/env node
/**
 * Verify OpenVSX extension publication
 * Polls the OpenVSX API until the extension version is available or timeout
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_JSON_PATH = path.resolve(__dirname, "../package.json");

// Config
const INITIAL_DELAY_MS = 30_000; // Wait 30s before first check
const POLL_INTERVAL_MS = 10_000; // Poll every 10s
const MAX_WAIT_MS = 600_000; // Max 10 minutes
const MAX_RETRIES = Math.floor(
  (MAX_WAIT_MS - INITIAL_DELAY_MS) / POLL_INTERVAL_MS,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchExtensionStatus = async (publisher, name, version) => {
  const url = `https://open-vsx.org/api/${publisher}/${name}/${version}`;
  try {
    const response = await fetch(url, { method: "GET" });
    return { url, status: response.status };
  } catch {
    return 0;
  }
};

const main = async () => {
  // Read package.json to get extension info
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));
  const { publisher, name, version } = packageJson;

  if (!publisher || !name || !version) {
    console.error("Error: Missing publisher, name, or version in package.json");
    process.exit(1);
  }

  console.log(
    `Verifying OpenVSX publication for ${publisher}.${name} v${version}...`,
  );
  console.log(`Initial delay: ${INITIAL_DELAY_MS / 1000}s`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Max wait: ${MAX_WAIT_MS / 1000 / 60}min`);
  console.log("");

  // Initial delay for OpenVSX to process
  console.log(`Waiting ${INITIAL_DELAY_MS / 1000}s for OpenVSX to process...`);
  await sleep(INITIAL_DELAY_MS);

  // Start polling
  const startTime = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] Attempt ${attempt}/${MAX_RETRIES}: Checking...`);

    const { url, status } = await fetchExtensionStatus(
      publisher,
      name,
      version,
    );

    if (status === 200) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `✓ Extension v${version} verified on OpenVSX (${totalTime}s)`,
      );
      console.log(
        `  Preview URL: https://open-vsx.org/extension/${publisher}/${name}`,
      );
      process.exit(0);
    }

    console.log(`  Status: [${url}] HTTP ${status} (not ready yet)`);

    if (attempt < MAX_RETRIES) {
      console.log(`  Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // Timeout
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(
    `✗ Extension v${version} not found on OpenVSX after ${totalTime}s`,
  );
  console.error("  The extension may have been rejected by moderation.");
  console.error(`  Check: https://open-vsx.org/extension/${publisher}/${name}`);
  process.exit(1);
};

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
