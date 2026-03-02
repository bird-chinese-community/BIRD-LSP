import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutputChannel } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";

import { createLanguageClient } from "../src/client/client.js";
import { createBirdClientLifecycle } from "../src/client/lifecycle.js";
import { defaultExtensionConfiguration } from "../src/types.js";

vi.mock("../src/client/client.js", () => ({
  createLanguageClient: vi.fn(),
}));
vi.mock("../src/security/index.js", () => ({
  toSanitizedErrorDetails: (value: unknown) => String(value),
}));

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
};

const createOutputChannelMock = (): OutputChannel =>
  ({
    appendLine: vi.fn(),
    dispose: vi.fn(),
  }) as unknown as OutputChannel;

const createConfiguration = (startupTimeoutMs: number) => ({
  ...defaultExtensionConfiguration,
  lspStartupTimeoutMs: startupTimeoutMs,
});

describe("client lifecycle startup timeout cleanup", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits startup completion before stopping timed-out client", async () => {
    const startDeferred = createDeferred<void>();
    let running = false;
    const client = {
      start: vi.fn(async () => {
        await startDeferred.promise;
        running = true;
      }),
      stop: vi.fn(async () => {
        if (!running) {
          throw new Error("Cannot stop while Starting");
        }
        running = false;
      }),
    } as unknown as LanguageClient;

    vi.mocked(createLanguageClient).mockReturnValue(client);

    const lifecycle = createBirdClientLifecycle(createOutputChannelMock());
    const startPromise = lifecycle.start(createConfiguration(20));

    await sleep(40);
    expect(client.stop).not.toHaveBeenCalled();

    startDeferred.resolve();
    await expect(startPromise).rejects.toThrow(
      "language client startup timed out",
    );
    expect(client.stop).toHaveBeenCalledTimes(1);
    expect(lifecycle.state).toBe("error");
  });

  it("does not create a second client before timed-out startup cleanup finishes", async () => {
    const firstStartDeferred = createDeferred<void>();
    let firstRunning = false;
    const firstClient = {
      start: vi.fn(async () => {
        await firstStartDeferred.promise;
        firstRunning = true;
      }),
      stop: vi.fn(async () => {
        if (!firstRunning) {
          throw new Error("Cannot stop while Starting");
        }
        firstRunning = false;
      }),
    } as unknown as LanguageClient;

    const secondClient = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as LanguageClient;

    vi.mocked(createLanguageClient)
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const lifecycle = createBirdClientLifecycle(createOutputChannelMock());
    const firstStart = lifecycle.start(createConfiguration(20));

    await sleep(40);
    const secondStart = lifecycle.start(createConfiguration(20));
    await sleep(10);
    expect(vi.mocked(createLanguageClient)).toHaveBeenCalledTimes(1);

    firstStartDeferred.resolve();
    await expect(firstStart).rejects.toThrow("startup timed out");
    await secondStart;

    expect(vi.mocked(createLanguageClient)).toHaveBeenCalledTimes(2);
    expect(secondClient.start).toHaveBeenCalledTimes(1);
  });
});
