import { beforeEach, describe, expect, it, vi } from "vitest";

const createContextMock = vi.hoisted(() => vi.fn());
const getBufferMock = vi.hoisted(() => vi.fn());

const addPluginMock = vi.hoisted(() => vi.fn());
const formatTextMock = vi.hoisted(() => vi.fn());

vi.mock("@dprint/formatter", () => ({
  createContext: createContextMock,
}));

vi.mock("@birdcc/dprint-plugin-bird", () => ({
  getBuffer: getBufferMock,
}));

import {
  __formatBirdConfigBuiltinForTest,
  __resetFormatterStateForTest,
  checkBirdConfigFormat,
  formatBirdConfig,
} from "../src/index.js";

describe("@birdcc/formatter", () => {
  beforeEach(() => {
    addPluginMock.mockReset();
    formatTextMock.mockReset();
    createContextMock.mockReset();
    getBufferMock.mockReset();

    getBufferMock.mockReturnValue(new Uint8Array([0, 97, 115, 109]));
    formatTextMock.mockImplementation(({ fileText }: { fileText: string }) => fileText);
    createContextMock.mockReturnValue({
      addPlugin: addPluginMock,
      formatText: formatTextMock,
    });
    __resetFormatterStateForTest();
  });

  it("formats text with builtin fallback", async () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const result = await formatBirdConfig(input, { engine: "builtin" });

    expect(result.changed).toBe(true);
    expect(result.engine).toBe("builtin");
    expect(result.text).toBe("router id 192.0.2.1;\n\nprotocol bgp edge {}\n");
  });

  it("uses embedded dprint context when available", async () => {
    formatTextMock.mockReturnValueOnce("protocol bgp edge {}\n");

    const result = await formatBirdConfig("protocol bgp edge{}\n");

    expect(result.engine).toBe("dprint");
    expect(createContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        indentWidth: 2,
        lineWidth: 80,
      }),
    );
    expect(addPluginMock).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        indentWidth: 2,
        lineWidth: 80,
        safeMode: true,
      }),
    );
  });

  it("loads wasm plugin buffer once across multiple dprint contexts", async () => {
    await formatBirdConfig("protocol bgp edge{}\n");
    await formatBirdConfig("protocol bgp edge{}\n", { lineWidth: 100 });
    await formatBirdConfig("protocol bgp edge{}\n");

    expect(createContextMock).toHaveBeenCalledTimes(2);
    expect(getBufferMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to builtin when dprint fails in default mode", async () => {
    createContextMock.mockImplementationOnce(() => {
      throw new Error("plugin load failed");
    });

    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const result = await formatBirdConfig(input);

    expect(result.engine).toBe("builtin");
    expect(result.text).toBe("router id 192.0.2.1;\n\nprotocol bgp edge {}\n");
  });

  it("throws when explicit dprint engine fails", async () => {
    createContextMock.mockImplementationOnce(() => {
      throw new Error("plugin load failed");
    });

    await expect(formatBirdConfig("protocol bgp edge {}\n", { engine: "dprint" })).rejects.toThrow(
      "Formatting with 'dprint' failed",
    );
  });

  it("is idempotent after formatting", async () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const first = await formatBirdConfig(input, { engine: "builtin" });
    const second = await formatBirdConfig(first.text, { engine: "builtin" });

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("keeps high-risk filter expressions structure while normalizing indentation", async () => {
    const input = [
      "filter test {",
      "if ( net ~ [ 192.0.2.0/24 ] ) then {",
      "accept;",
      "}",
      "}",
      "",
    ].join("\n");
    const result = await formatBirdConfig(input, { engine: "builtin" });

    expect(result.text).toContain("if ( net ~ [ 192.0.2.0/24 ] ) then {");
    expect(result.text).toContain("  accept;");
  });

  it("does not treat keyword substrings as high-risk expressions", async () => {
    const input = "define iffy = 1;   \n";
    const output = await __formatBirdConfigBuiltinForTest(input);

    expect(output.stats.highRiskLines).toBe(0);
    expect(output.text).toBe("define iffy = 1;\n");
  });

  it("detects high-risk keywords case-insensitively in builtin formatter", async () => {
    const input = [
      "filter test {",
      "IF ( net ~ [ 192.0.2.0/24 ] ) Then {",
      "accept;",
      "}",
      "}",
    ].join("\n");
    const output = await __formatBirdConfigBuiltinForTest(`${input}\n`);

    expect(output.stats.highRiskLines).toBeGreaterThan(0);
    expect(output.text).toContain("IF ( net ~ [ 192.0.2.0/24 ] ) Then {");
  });

  it("keeps correct indentation level after standalone closing braces", async () => {
    const input = [
      "protocol bgp edge {",
      "ipv4 {",
      "import all;",
      "}",
      "router id 192.0.2.1;",
      "}",
      "",
    ].join("\n");

    const result = await formatBirdConfig(input, { engine: "builtin" });
    const lines = result.text.split("\n");
    expect(lines[4]).toBe("  router id 192.0.2.1;");
    expect(lines[5]).toBe("}");
  });

  it("rejects semantic changes in safe mode", async () => {
    formatTextMock.mockReturnValueOnce("router id 1;\n");

    await expect(formatBirdConfig("router id 192.0.2.1;\n", { engine: "dprint" })).rejects.toThrow(
      "safe mode rejected",
    );
  });

  it("exposes builtin formatting stats for regression assertions", async () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge{}\n";
    const output = await __formatBirdConfigBuiltinForTest(input);

    expect(output.stats.linesTotal).toBeGreaterThan(0);
    expect(output.stats.linesTouched).toBeGreaterThan(0);
    expect(output.stats.blankLinesCollapsed).toBeGreaterThan(0);
    expect(output.stats.parserProtectedLines).toBeGreaterThanOrEqual(0);
    expect(output.text.endsWith("\n")).toBe(true);
  });

  it("check result is consistent with format result", async () => {
    const input = "protocol bgp edge {}\n";
    const check = await checkBirdConfigFormat(input, { engine: "builtin" });
    const formatted = await formatBirdConfig(input, { engine: "builtin" });

    expect(check.changed).toBe(formatted.changed);
  });
});
