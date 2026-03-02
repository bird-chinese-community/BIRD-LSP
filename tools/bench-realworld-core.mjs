import { readFile } from "node:fs/promises";

export const nowNs = () => process.hrtime.bigint();
export const nsToMs = (ns) => Number(ns) / 1e6;

export const clampRepeats = (repeats) => {
  const parsed = Number.isFinite(repeats) ? repeats : 1;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
};

const average = (values) =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

export const loadWorkspaceApis = async () => {
  try {
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
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? String(error)) : String(error);
    throw new Error(
      `Failed to load workspace dist modules. Run "pnpm build" first.\n\n${message}`,
    );
  }
};

export const runWarmup = async ({
  parseBirdConfig,
  formatBirdConfig,
  engine,
}) => {
  const warmupText = "router id 192.0.2.1;\n";

  const parseStart = nowNs();
  await parseBirdConfig(warmupText);
  const parseMs = nsToMs(nowNs() - parseStart);

  let formatMs = 0;
  if (engine !== "parse-only") {
    const formatStart = nowNs();
    await formatBirdConfig(warmupText, { engine });
    formatMs = nsToMs(nowNs() - formatStart);
  }

  return { parseMs, formatMs };
};

export const benchmarkConfigText = async ({
  filePath,
  text,
  bytes,
  engine,
  repeats,
  parseBirdConfig,
  formatBirdConfig,
}) => {
  const lines = text.split("\n").length;

  let parsed;
  const parseSamples = [];
  for (let sample = 0; sample < repeats; sample += 1) {
    const parseStart = nowNs();
    // eslint-disable-next-line no-await-in-loop
    parsed = await parseBirdConfig(text);
    parseSamples.push(nsToMs(nowNs() - parseStart));
  }

  const parseMs = average(parseSamples);
  const hasRuntimeIssue = parsed.issues.some(
    (issue) => issue.code === "parser/runtime-error",
  );

  let formatMs = 0;
  let changed = false;
  let formattedBytes = 0;

  if (engine !== "parse-only") {
    const formatSamples = [];
    let formatted;
    for (let sample = 0; sample < repeats; sample += 1) {
      const formatStart = nowNs();
      // eslint-disable-next-line no-await-in-loop
      formatted = await formatBirdConfig(text, { engine });
      formatSamples.push(nsToMs(nowNs() - formatStart));
    }

    formatMs = average(formatSamples);
    changed = formatted.changed;
    formattedBytes = Buffer.byteLength(formatted.text, "utf8");
  }

  return {
    path: filePath,
    bytes,
    lines,
    parseMs,
    formatMs,
    engine,
    samples: repeats,
    changed,
    formattedBytes,
    issues: parsed.issues.length,
    runtimeError: hasRuntimeIssue,
  };
};

export const benchmarkConfigFile = async ({
  filePath,
  bytesHint,
  engine,
  repeats,
  parseBirdConfig,
  formatBirdConfig,
}) => {
  const text = await readFile(filePath, "utf8");
  const bytes =
    Number.isFinite(bytesHint) && bytesHint > 0
      ? bytesHint
      : Buffer.byteLength(text, "utf8");

  return benchmarkConfigText({
    filePath,
    text,
    bytes,
    engine,
    repeats,
    parseBirdConfig,
    formatBirdConfig,
  });
};
