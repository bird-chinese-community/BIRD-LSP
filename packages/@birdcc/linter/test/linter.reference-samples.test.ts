import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lintBirdConfig } from "../src/index.js";

const loadExample = async (fileName: string): Promise<string> => {
  const filePath = path.resolve(
    import.meta.dirname,
    "..",
    "examples",
    fileName,
  );
  return readFile(filePath, "utf8");
};

const lintExample = async (fileName: string) => {
  const text = await loadExample(fileName);
  return lintBirdConfig(text);
};

describe("@birdcc/linter reference samples", () => {
  it("does not report inline filter blocks as missing filter names", async () => {
    const result = await lintExample("basic.conf");
    const diagnostics = result.diagnostics.filter(
      (item) =>
        item.code === "sym/filter-required" &&
        item.message.includes("requires a filter name"),
    );

    expect(diagnostics).toHaveLength(0);
  });

  it("accepts prefix operators in filter sets", async () => {
    const result = await lintExample("basic.conf");
    const invalidLengthDiagnostics = result.diagnostics.filter(
      (item) =>
        item.code === "net/invalid-prefix-length" &&
        (item.message.includes("/8+") ||
          item.message.includes("/12+") ||
          item.message.includes("/16+")),
    );
    const iterableDiagnostics = result.diagnostics.filter(
      (item) =>
        item.code === "type/not-iterable" &&
        item.message.includes("net ~ 10.0.0.0"),
    );

    expect(invalidLengthDiagnostics).toHaveLength(0);
    expect(iterableDiagnostics).toHaveLength(0);
  });

  it("avoids false positives for built-in helpers and symbolic AS values", async () => {
    const result = await lintExample("protocol_phrases.conf");
    const diagnostics = result.diagnostics.filter(
      (item) =>
        (item.code === "sym/function-required" &&
          item.message.includes("append")) ||
        (item.code === "cfg/number-expected" &&
          item.message.includes("local as")) ||
        (item.code === "net/invalid-prefix-length" &&
          item.message.includes("tmp/bird.log")),
    );

    expect(diagnostics).toHaveLength(0);
  });

  it("treats named set constants as iterable match targets", async () => {
    const result = await lintExample("bogon.conf");
    const diagnostics = result.diagnostics.filter(
      (item) =>
        item.code === "type/not-iterable" &&
        (item.message.includes("BOGON_PREFIXES_V4") ||
          item.message.includes("BOGON_PREFIXES_V6") ||
          item.message.includes("BOGON_ASNS") ||
          item.message.includes("TIER_1_ASNS")),
    );

    expect(diagnostics).toHaveLength(0);
  });
});
