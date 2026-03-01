import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const formatBirdConfigMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

vi.mock("@birdcc/formatter", () => ({
  formatBirdConfig: formatBirdConfigMock,
}));

import { runFmt } from "../src/index.js";

describe("@birdcc/cli fmt runtime", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    formatBirdConfigMock.mockReset();

    readFileMock.mockResolvedValue("protocol bgp edge {}\n");
    writeFileMock.mockResolvedValue(undefined);
    formatBirdConfigMock.mockReturnValue({
      changed: false,
      text: "protocol bgp edge {}\n",
      engine: "dprint",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes explicit engine option to formatter", async () => {
    await runFmt("/tmp/bird.conf", { engine: "builtin" });

    expect(formatBirdConfigMock).toHaveBeenCalledWith("protocol bgp edge {}\n", {
      engine: "builtin",
    });
  });

  it("passes formatter style options to formatter package", async () => {
    await runFmt("/tmp/bird.conf", {
      indentSize: 4,
      lineWidth: 100,
      safeMode: false,
    });

    expect(formatBirdConfigMock).toHaveBeenCalledWith("protocol bgp edge {}\n", {
      indentSize: 4,
      lineWidth: 100,
      safeMode: false,
    });
  });

  it("does not fallback when explicit engine fails", async () => {
    formatBirdConfigMock.mockImplementation(() => {
      throw new Error("dprint failed");
    });

    await expect(runFmt("/tmp/bird.conf", { engine: "dprint" })).rejects.toThrow("dprint failed");
    expect(formatBirdConfigMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to builtin when default formatter call fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    formatBirdConfigMock
      .mockImplementationOnce(() => {
        throw new Error("unexpected formatter error");
      })
      .mockReturnValueOnce({
        changed: true,
        text: "protocol bgp edge {}\n",
        engine: "builtin",
      });

    const result = await runFmt("/tmp/bird.conf");

    expect(result.changed).toBe(true);
    expect(formatBirdConfigMock).toHaveBeenNthCalledWith(1, "protocol bgp edge {}\n", {});
    expect(formatBirdConfigMock).toHaveBeenNthCalledWith(2, "protocol bgp edge {}\n", {
      engine: "builtin",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
