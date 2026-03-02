import { readFile, stat } from "node:fs/promises";

const loadWorkspaceApis = async () => {
  const parser = await import(
    new URL("../packages/@birdcc/parser/dist/index.js", import.meta.url)
  );
  const formatter = await import(
    new URL("../packages/@birdcc/formatter/dist/index.js", import.meta.url)
  );

  return {
    parseBirdConfig: parser.parseBirdConfig,
    formatBirdConfig: formatter.formatBirdConfig,
  };
};

const parseArgs = (argv) => {
  const options = {
    filePath: undefined,
    engine: "builtin",
    repeats: 1,
    warmup: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--file":
        options.filePath = next;
        index += 1;
        break;
      case "--engine":
        options.engine = next ?? options.engine;
        index += 1;
        break;
      case "--repeats":
        options.repeats = Number(next ?? options.repeats);
        index += 1;
        break;
      case "--no-warmup":
        options.warmup = false;
        break;
      default:
        break;
    }
  }

  return options;
};

const nowNs = () => process.hrtime.bigint();
const nsToMs = (ns) => Number(ns) / 1e6;

const main = async () => {
  const options = parseArgs(process.argv);
  if (!options.filePath) {
    throw new Error("Missing --file argument");
  }

  const { parseBirdConfig, formatBirdConfig } = await loadWorkspaceApis();

  const repeats = Number.isFinite(options.repeats) ? options.repeats : 1;
  const safeRepeats = Math.max(1, Math.min(20, Math.floor(repeats)));

  const warmupText = "router id 192.0.2.1;\n";
  if (options.warmup) {
    await parseBirdConfig(warmupText);
    if (options.engine !== "parse-only") {
      await formatBirdConfig(warmupText, { engine: options.engine });
    }
  }

  const text = await readFile(options.filePath, "utf8");
  const bytes = (await stat(options.filePath)).size;
  const lines = text.split("\n").length;

  let parsed;
  const parseSamples = [];
  for (let sample = 0; sample < safeRepeats; sample += 1) {
    const parseStart = nowNs();
    // eslint-disable-next-line no-await-in-loop
    parsed = await parseBirdConfig(text);
    parseSamples.push(nsToMs(nowNs() - parseStart));
  }
  const parseMs = parseSamples.reduce((a, b) => a + b, 0) / parseSamples.length;

  const hasRuntimeIssue = parsed.issues.some(
    (issue) => issue.code === "parser/runtime-error",
  );

  let formatMs = 0;
  let changed = false;
  let formattedBytes = 0;

  if (options.engine !== "parse-only") {
    const formatSamples = [];
    let formatted;
    for (let sample = 0; sample < safeRepeats; sample += 1) {
      const formatStart = nowNs();
      // eslint-disable-next-line no-await-in-loop
      formatted = await formatBirdConfig(text, { engine: options.engine });
      formatSamples.push(nsToMs(nowNs() - formatStart));
    }
    formatMs =
      formatSamples.reduce((a, b) => a + b, 0) / formatSamples.length;
    changed = formatted.changed;
    formattedBytes = Buffer.byteLength(formatted.text, "utf8");
  }

  process.stdout.write(
    JSON.stringify({
      path: options.filePath,
      bytes,
      lines,
      parseMs,
      formatMs,
      engine: options.engine,
      samples: safeRepeats,
      changed,
      formattedBytes,
      issues: parsed.issues.length,
      runtimeError: hasRuntimeIssue,
    }),
  );
};

await main();

