import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { parseBirdConfig } from "../src/index.js";
import {
  getParser,
  resetParserRuntimeForTests,
  setLanguageWasmPathsForTests,
} from "../src/runtime.js";

const VALID_WASM_PATH = fileURLToPath(
  new URL("../src/tree-sitter-birdcc.wasm", import.meta.url),
);

describe("@birdcc/parser runtime", () => {
  afterEach(() => {
    setLanguageWasmPathsForTests([VALID_WASM_PATH]);
    resetParserRuntimeForTests();
  });

  it("reuses a single parser instance for concurrent callers", async () => {
    const [parserA, parserB, parserC] = await Promise.all([
      getParser(),
      getParser(),
      getParser(),
    ]);

    expect(parserA).toBe(parserB);
    expect(parserA).toBe(parserC);
  });

  it("recovers from initialization failure and supports retry", async () => {
    setLanguageWasmPathsForTests(["/tmp/not-found-tree-sitter-birdcc.wasm"]);
    await expect(getParser()).rejects.toThrow(
      "Unable to load Tree-sitter WASM language",
    );

    setLanguageWasmPathsForTests([VALID_WASM_PATH]);
    await expect(getParser()).resolves.toBeDefined();
  });

  it("returns degraded parse result when runtime cannot be initialized", async () => {
    setLanguageWasmPathsForTests(["/tmp/not-found-tree-sitter-birdcc.wasm"]);
    const parsed = await parseBirdConfig(
      "protocol bgp edge { local as 65001; }",
    );

    expect(parsed.program.declarations).toHaveLength(0);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].code).toBe("parser/runtime-error");
  });
});
