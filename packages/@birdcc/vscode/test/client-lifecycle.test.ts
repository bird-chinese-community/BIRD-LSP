import { describe, expect, it, vi } from "vitest";
import type { OutputChannel } from "vscode";

import {
  createLanguageClient,
  type BirdLanguageClient,
} from "../src/client/client.js";
import { createBirdClientLifecycle } from "../src/client/lifecycle.js";
import { createServerProcess } from "../src/client/server-process.js";
import { defaultExtensionConfiguration } from "../src/types.js";

vi.mock("../src/client/client.js", () => ({ createLanguageClient: vi.fn() }));
vi.mock("../src/security/index.js", () => ({
  toSanitizedErrorDetails: String,
}));

const output = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
} as never as OutputChannel;

const createClient = () => {
  let listener = () => {};
  let running = false;
  let starting = false;
  const client = {
    start: vi.fn(async () => {
      running = true;
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    terminate: vi.fn(async () => {}),
    onDidChangeState: (next: () => void) => {
      listener = next;
      return {
        dispose: () => {
          listener = () => {};
        },
      };
    },
    isRunning: () => running,
    needsStart: () => !running && !starting,
  };
  return {
    client: client as never as BirdLanguageClient,
    update: (next: "running" | "starting" | "stopped") => {
      running = next === "running";
      starting = next === "starting";
      listener();
    },
  };
};

describe("client lifecycle", () => {
  it("terminates a real unresponsive stdio process and permits restart", async () => {
    const processOwner = createServerProcess(process.execPath, [
      "-e",
      "process.stdin.resume()",
    ]);
    const child = await processOwner.start();
    const hung = createClient().client;
    vi.mocked(hung.start).mockImplementation(() => new Promise<void>(() => {}));
    vi.mocked(hung.terminate).mockImplementation(processOwner.terminate);
    const recovered = createClient().client;
    vi.mocked(createLanguageClient)
      .mockReturnValueOnce(hung)
      .mockReturnValueOnce(recovered);
    const lifecycle = createBirdClientLifecycle(output);
    try {
      await expect(
        lifecycle.start({
          ...defaultExtensionConfiguration,
          lspStartupTimeoutMs: 30,
        }),
      ).rejects.toThrow("startup timed out");
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(lifecycle.state).toBe("error");
      await lifecycle.restart(defaultExtensionConfiguration);
      expect(lifecycle.state).toBe("running");
      expect(recovered.start).toHaveBeenCalledOnce();
    } finally {
      await processOwner.terminate();
      await lifecycle.dispose();
    }
  });

  it("tracks actual disconnect and recovery events and disposes the listener", async () => {
    const { client, update } = createClient();
    vi.mocked(createLanguageClient).mockReturnValueOnce(client);
    const states: string[] = [];
    const lifecycle = createBirdClientLifecycle(output, {
      onStateChange: (state) => states.push(state),
    });
    await lifecycle.start(defaultExtensionConfiguration);
    update("starting");
    expect(lifecycle.state).toBe("starting");
    update("running");
    expect(lifecycle.state).toBe("running");
    update("stopped");
    expect(lifecycle.state).toBe("error");
    await lifecycle.stop();
    update("running");
    expect(lifecycle.state).toBe("idle");
    expect(states).toContain("error");
    expect(client.terminate).toHaveBeenCalledOnce();
  });
});
