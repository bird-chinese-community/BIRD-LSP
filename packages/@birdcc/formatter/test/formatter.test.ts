import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

import {
  __formatBirdConfigBuiltinForTest,
  checkBirdConfigFormat,
  formatBirdConfig,
} from "../src/index.js";

describe("@birdcc/formatter", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it("formats text with builtin fallback", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const result = formatBirdConfig(input, { engine: "builtin" });

    expect(result.changed).toBe(true);
    expect(result.engine).toBe("builtin");
    expect(result.text).toBe("router id 192.0.2.1;\n\nprotocol bgp edge {}\n");
  });

  it("uses dprint when available and sets timeout options", () => {
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "protocol bgp edge {}\n",
      stderr: "",
    });

    const result = formatBirdConfig("protocol bgp edge {}\n");

    expect(result.engine).toBe("dprint");
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "dprint",
      ["fmt", "--stdin", "bird.conf"],
      expect.objectContaining({
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }),
    );
  });

  it("falls back to builtin when dprint fails in default mode", () => {
    spawnSyncMock.mockReturnValueOnce({
      error: new Error("dprint not found"),
      status: 1,
      stdout: "",
      stderr: "",
    });

    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const result = formatBirdConfig(input);

    expect(result.engine).toBe("builtin");
    expect(result.text).toBe("router id 192.0.2.1;\n\nprotocol bgp edge {}\n");
  });

  it("throws when explicit dprint engine fails", () => {
    spawnSyncMock.mockReturnValue({
      error: new Error("dprint not found"),
      status: 1,
      stdout: "",
      stderr: "",
    });

    expect(() => formatBirdConfig("protocol bgp edge {}\n", { engine: "dprint" })).toThrow(
      "Formatting with 'dprint' failed",
    );
  });

  it("is idempotent after formatting", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const first = formatBirdConfig(input, { engine: "builtin" });
    const second = formatBirdConfig(first.text, { engine: "builtin" });

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("keeps high-risk filter expressions structure while normalizing indentation", () => {
    const input = [
      "filter test {",
      "if ( net ~ [ 192.0.2.0/24 ] ) then {",
      "accept;",
      "}",
      "}",
      "",
    ].join("\n");
    const result = formatBirdConfig(input, { engine: "builtin" });

    expect(result.text).toContain("if ( net ~ [ 192.0.2.0/24 ] ) then {");
    expect(result.text).toContain("  accept;");
  });

  it("exposes builtin formatting stats for regression assertions", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge{}\n";
    const output = __formatBirdConfigBuiltinForTest(input);

    expect(output.stats.linesTotal).toBeGreaterThan(0);
    expect(output.stats.linesTouched).toBeGreaterThan(0);
    expect(output.stats.blankLinesCollapsed).toBeGreaterThan(0);
    expect(output.text.endsWith("\n")).toBe(true);
  });

  it("check result is consistent with format result", () => {
    const input = "protocol bgp edge {}\n";
    const check = checkBirdConfigFormat(input, { engine: "builtin" });
    const formatted = formatBirdConfig(input, { engine: "builtin" });

    expect(check.changed).toBe(formatted.changed);
  });
});
