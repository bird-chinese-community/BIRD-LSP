import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import {
  benchmarkConfigFile,
  clampRepeats,
  loadWorkspaceApis,
  nowNs,
  nsToMs,
  runWarmup,
} from "./bench-realworld-core.mjs";
import { collectBirdConfigCandidates } from "./realworld-config-files.mjs";

const parseArgs = (argv) => {
  const options = {
    root: "refer/config-examples",
    limit: 50,
    maxBytes: 1024 * 1024,
    engine: "builtin",
    outputJson: undefined,
    includeLargest: true,
    warmup: true,
    repeats: 1,
    isolate: false,
    timeoutMs: 60_000,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--root":
        options.root = next ?? options.root;
        index += 1;
        break;
      case "--limit":
        options.limit = Number(next ?? options.limit);
        index += 1;
        break;
      case "--max-bytes":
        options.maxBytes = Number(next ?? options.maxBytes);
        index += 1;
        break;
      case "--engine":
        options.engine = next ?? options.engine;
        index += 1;
        break;
      case "--json":
        options.outputJson = next;
        index += 1;
        break;
      case "--no-warmup":
        options.warmup = false;
        break;
      case "--repeats":
        options.repeats = Number(next ?? options.repeats);
        index += 1;
        break;
      case "--isolate":
        options.isolate = true;
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next ?? options.timeoutMs);
        index += 1;
        break;
      case "--smallest":
        options.includeLargest = false;
        break;
      default:
        break;
    }
  }

  return options;
};

const percentile = (values, p) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rawIndex = (p / 100) * (sorted.length - 1);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(rawIndex)),
  );
  return sorted[index] ?? 0;
};

const runWorker = async ({
  filePath,
  engine,
  repeats,
  warmup,
  timeoutMs,
}) => {
  const workerPath = new URL("./bench-realworld-worker.mjs", import.meta.url);
  const workerFilePath = fileURLToPath(workerPath);

  return await new Promise((resolvePromise) => {
    const args = [
      workerFilePath,
      "--file",
      filePath,
      "--engine",
      String(engine),
      "--repeats",
      String(repeats),
    ];

    if (!warmup) {
      args.push("--no-warmup");
    }

    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const startedAt = nowNs();
    const stdoutChunks = [];
    const stderrChunks = [];

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, Math.max(1_000, timeoutMs));

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("close", (code, signal) => {
      clearTimeout(timeout);

      const durationMs = nsToMs(nowNs() - startedAt);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (signal) {
        resolvePromise({
          ok: false,
          filePath,
          durationMs,
          timedOut: true,
          reason: `killed by signal ${signal}`,
          stderr,
        });
        return;
      }

      if (code !== 0) {
        resolvePromise({
          ok: false,
          filePath,
          durationMs,
          timedOut: false,
          reason: `worker exited with code ${code}`,
          stderr: stderr || stdout,
        });
        return;
      }

      try {
        resolvePromise({
          ok: true,
          filePath,
          durationMs,
          result: JSON.parse(stdout),
        });
      } catch (error) {
        const message =
          error instanceof Error ? (error.stack ?? String(error)) : String(error);
        resolvePromise({
          ok: false,
          filePath,
          durationMs,
          timedOut: false,
          reason: "worker output is not valid JSON",
          stderr: `${message}\n${stdout}\n${stderr}`.trim(),
        });
      }
    });
  });
};

const main = async () => {
  const options = parseArgs(process.argv);
  const { parseBirdConfig, formatBirdConfig } = await loadWorkspaceApis();
  const root = isAbsolute(options.root)
    ? options.root
    : resolve(process.cwd(), options.root);

  const safeRepeats = clampRepeats(options.repeats);
  const warmup =
    options.warmup && !options.isolate
      ? await runWarmup({
          parseBirdConfig,
          formatBirdConfig,
          engine: options.engine,
        })
      : { parseMs: 0, formatMs: 0 };

  const candidates = await collectBirdConfigCandidates({
    root,
    maxBytes: options.maxBytes,
  });

  candidates.sort((left, right) =>
    options.includeLargest
      ? right.bytes - left.bytes
      : left.bytes - right.bytes,
  );

  const selected = candidates.slice(0, Math.max(0, options.limit));
  if (selected.length === 0) {
    console.log("No matching config files found for benchmarking.");
    return;
  }

  const results = [];

  for (const file of selected) {
    if (options.isolate) {
      // Run each file in a dedicated process so we can enforce timeouts on huge inputs.
      // This prioritizes robustness over micro-accurate steady-state numbers.
      // eslint-disable-next-line no-await-in-loop
      const worker = await runWorker({
        filePath: file.path,
        engine: options.engine,
        repeats: safeRepeats,
        warmup: options.warmup,
        timeoutMs: options.timeoutMs,
      });

      if (!worker.ok) {
        results.push({
          path: file.path,
          bytes: file.bytes,
          lines: 0,
          parseMs: 0,
          formatMs: 0,
          engine: options.engine,
          samples: safeRepeats,
          changed: false,
          formattedBytes: 0,
          issues: 0,
          runtimeError: false,
          worker: {
            ok: false,
            timedOut: worker.timedOut,
            durationMs: worker.durationMs,
            reason: worker.reason,
          },
        });
        continue;
      }

      const row = worker.result;
      results.push({
        ...row,
        worker: {
          ok: true,
          durationMs: worker.durationMs,
        },
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const row = await benchmarkConfigFile({
      filePath: file.path,
      bytesHint: file.bytes,
      engine: options.engine,
      repeats: safeRepeats,
      parseBirdConfig,
      formatBirdConfig,
    });

    results.push(row);
  }

  const parseTimes = results.map((row) => row.parseMs).filter((ms) => ms > 0);
  const formatTimes = results.map((row) => row.formatMs).filter((ms) => ms > 0);
  const runtimeErrors = results.filter((row) => row.runtimeError).length;
  const timedOut = results.filter(
    (row) => row.worker && row.worker.ok === false && row.worker.timedOut,
  ).length;
  const workerFailures = results.filter(
    (row) => row.worker && row.worker.ok === false && !row.worker.timedOut,
  ).length;

  const summary = {
    root,
    engine: options.engine,
    files: results.length,
    maxBytes: options.maxBytes,
    isolate: options.isolate,
    timeoutMs: options.timeoutMs,
    warmup,
    repeats: safeRepeats,
    parse: {
      totalMs: parseTimes.reduce((a, b) => a + b, 0),
      p50Ms: percentile(parseTimes, 50),
      p95Ms: percentile(parseTimes, 95),
    },
    format: {
      totalMs: formatTimes.reduce((a, b) => a + b, 0),
      p50Ms: percentile(formatTimes, 50),
      p95Ms: percentile(formatTimes, 95),
    },
    runtimeErrors,
    timedOut,
    workerFailures,
    memoryRssBytes: process.memoryUsage().rss,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (options.outputJson) {
    await writeFile(
      resolve(process.cwd(), options.outputJson),
      JSON.stringify({ summary, results }, null, 2),
      "utf8",
    );
  }
};

await main();
