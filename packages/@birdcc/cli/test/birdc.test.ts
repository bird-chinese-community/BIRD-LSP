import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const lintBirdConfigMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  writeFile: vi.fn(),
}));

vi.mock("@birdcc/linter", () => ({
  lintBirdConfig: lintBirdConfigMock,
}));

import { parseBirdcProtocolsOutput, runLint } from "../src/index.js";

const createLintResult = () => ({
  parsed: {
    program: {
      declarations: [
        {
          kind: "protocol",
          name: "edge_peer",
          protocolType: "bgp",
          nameRange: { line: 2, column: 16, endLine: 2, endColumn: 25 },
        },
        {
          kind: "protocol",
          name: "core_ospf",
          protocolType: "ospf",
          nameRange: { line: 8, column: 16, endLine: 8, endColumn: 24 },
        },
      ],
    },
  },
  core: { diagnostics: [] },
  diagnostics: [],
});

describe("@birdcc/cli birdc runtime checks", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    readFileMock.mockReset();
    lintBirdConfigMock.mockReset();

    readFileMock.mockResolvedValue("protocol bgp edge_peer {}");
    lintBirdConfigMock.mockResolvedValue(createLintResult());
  });

  it("does not execute birdc queries when withBirdc is disabled", async () => {
    const result = await runLint("/tmp/bird.conf", { withBirdc: false });

    expect(result.diagnostics).toHaveLength(0);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("reports warning when birdc runner fails", async () => {
    spawnSyncMock.mockReturnValue({
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("spawn birdc ENOENT"),
    });

    const result = await runLint("/tmp/bird.conf", { withBirdc: true });

    expect(result.diagnostics.some((item) => item.code === "birdc/runner-warning")).toBe(true);
  });

  it("reports status warning when status output is abnormal", async () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: "BIRD 2.0.0\nNo status",
      stderr: "",
      error: undefined,
    });

    const result = await runLint("/tmp/bird.conf", { withBirdc: true });

    expect(result.diagnostics.some((item) => item.code === "birdc/status-warning")).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it("reports non-up and missing protocols from show protocols output", async () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: "BIRD 2.0.0 ready.",
        stderr: "",
        error: undefined,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: `
          BIRD 2.0.0 ready.
          Name       Proto      Table      State  Since       Info
          edge_peer  BGP        master4    down   2026-03-01  Connect
        `,
        stderr: "",
        error: undefined,
      });

    const result = await runLint("/tmp/bird.conf", { withBirdc: true });
    const codes = result.diagnostics.map((item) => item.code);

    expect(codes).toContain("birdc/protocol-not-up");
    expect(codes).toContain("birdc/protocol-not-found");
  });

  it("supports combining bird -p and birdc checks", async () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "/tmp/bird.conf:12:9 syntax error",
        error: undefined,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "BIRD 2.0.0 ready.",
        stderr: "",
        error: undefined,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: `
          Name       Proto      Table      State  Since       Info
          edge_peer  BGP        master4    down   2026-03-01  Connect
          core_ospf  OSPF       ---        up     2026-03-01
        `,
        stderr: "",
        error: undefined,
      });

    const result = await runLint("/tmp/bird.conf", { withBird: true, withBirdc: true });
    const codes = result.diagnostics.map((item) => item.code);

    expect(codes).toContain("bird/parse-error");
    expect(codes).toContain("birdc/protocol-not-up");
  });

  it("parses birdc show protocols table rows", () => {
    const runtime = parseBirdcProtocolsOutput(`
      BIRD 2.0.0 ready.
      Name       Proto      Table      State  Since       Info
      edge_peer  BGP        master4    down   2026-03-01  Connect
      core_ospf  OSPF       ---        up     2026-03-01
    `);

    expect(runtime).toEqual([
      { name: "edge_peer", protocol: "BGP", state: "down" },
      { name: "core_ospf", protocol: "OSPF", state: "up" },
    ]);
  });
});
