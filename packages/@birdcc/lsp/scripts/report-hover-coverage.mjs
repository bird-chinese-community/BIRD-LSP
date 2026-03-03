import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const HOVER_DOCS_DIR = path.join(packageRoot, "data", "hover-docs");
const HOVER_USAGE_DIR = path.join(packageRoot, "data", "hover-usage");

const MIN_DOC_COUNT = 100;
const MIN_WITH_PATH = 100;
const MIN_WITH_RELATED = 75;
const MIN_WITH_PARAMETERS = 75;
const MIN_WITH_USAGE = 100;

const loadYamlEntries = async (directoryPath) => {
  const fileNames = (await readdir(directoryPath))
    .filter((fileName) => fileName.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));

  const entries = [];
  for (const fileName of fileNames) {
    const content = await readFile(path.join(directoryPath, fileName), "utf8");
    const doc = parse(content) ?? {};
    if (Array.isArray(doc.entries)) {
      entries.push(...doc.entries);
    }
  }

  return entries;
};

const hoverEntries = await loadYamlEntries(HOVER_DOCS_DIR);
const usageEntries = await loadYamlEntries(HOVER_USAGE_DIR);

const usageKeywords = new Set(
  usageEntries
    .map((entry) =>
      typeof entry.keyword === "string"
        ? entry.keyword.trim().toLowerCase().replace(/\s+/g, " ")
        : "",
    )
    .filter((keyword) => keyword.length > 0),
);

const stats = hoverEntries.reduce(
  (acc, entry) => {
    const keyword =
      typeof entry.keyword === "string"
        ? entry.keyword.trim().toLowerCase().replace(/\s+/g, " ")
        : "";
    const hasUsageFromDocs =
      typeof entry.usage === "string" && entry.usage.trim().length > 0;
    const hasUsage = hasUsageFromDocs || usageKeywords.has(keyword);

    acc.total += 1;
    if (entry.path !== undefined) {
      acc.withPath += 1;
    }
    if (Array.isArray(entry.related) && entry.related.length > 0) {
      acc.withRelated += 1;
    }
    if (Array.isArray(entry.parameters) && entry.parameters.length > 0) {
      acc.withParameters += 1;
    }
    if (hasUsage) {
      acc.withUsage += 1;
    }

    return acc;
  },
  {
    total: 0,
    withPath: 0,
    withRelated: 0,
    withParameters: 0,
    withUsage: 0,
  },
);

console.log("[hover-coverage]", stats);

const checkMode = process.argv.includes("--check");
if (checkMode) {
  const failures = [];
  if (stats.total < MIN_DOC_COUNT) {
    failures.push(`total ${stats.total} < ${MIN_DOC_COUNT}`);
  }
  if (stats.withPath < MIN_WITH_PATH) {
    failures.push(`withPath ${stats.withPath} < ${MIN_WITH_PATH}`);
  }
  if (stats.withRelated < MIN_WITH_RELATED) {
    failures.push(`withRelated ${stats.withRelated} < ${MIN_WITH_RELATED}`);
  }
  if (stats.withParameters < MIN_WITH_PARAMETERS) {
    failures.push(
      `withParameters ${stats.withParameters} < ${MIN_WITH_PARAMETERS}`,
    );
  }
  if (stats.withUsage < MIN_WITH_USAGE) {
    failures.push(`withUsage ${stats.withUsage} < ${MIN_WITH_USAGE}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`[hover-coverage][FAIL] ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("[hover-coverage] thresholds passed");
  }
}
