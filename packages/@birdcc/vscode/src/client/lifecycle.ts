import type { Disposable, OutputChannel } from "vscode";

import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import { createLanguageClient, type BirdLanguageClient } from "./client.js";

export type ClientLifecycleState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface BirdClientLifecycle {
  readonly state: ClientLifecycleState;
  start: (configuration: ExtensionConfiguration) => Promise<void>;
  stop: () => Promise<void>;
  restart: (configuration: ExtensionConfiguration) => Promise<void>;
  dispose: () => Promise<void>;
}

export interface BirdClientLifecycleOptions {
  readonly onStateChange?: (state: ClientLifecycleState) => void;
  readonly extensionPath?: string;
}

export const createBirdClientLifecycle = (
  outputChannel: OutputChannel,
  options: BirdClientLifecycleOptions = {},
): BirdClientLifecycle => {
  let state: ClientLifecycleState = "idle";
  let activeClient: BirdLanguageClient | undefined;
  let stateSubscription: Disposable | undefined;
  let activeOperation: Promise<void> | undefined;
  const setState = (next: ClientLifecycleState): void => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  const runExclusive = async (
    operation: () => Promise<void>,
  ): Promise<void> => {
    while (activeOperation) await activeOperation.catch(() => undefined);
    const task = operation();
    activeOperation = task;
    try {
      await task;
    } finally {
      activeOperation = undefined;
    }
  };

  const stopClient = async (): Promise<void> => {
    const client = activeClient;
    activeClient = undefined;
    stateSubscription?.dispose();
    stateSubscription = undefined;
    if (!client) return;
    try {
      await client.stop();
    } finally {
      await client.terminate();
    }
  };

  const startClient = async (
    configuration: ExtensionConfiguration,
  ): Promise<void> => {
    setState("starting");
    let client: BirdLanguageClient | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      client = createLanguageClient(
        configuration,
        outputChannel,
        options.extensionPath,
      );
      const observedClient = client;
      activeClient = client;
      stateSubscription = client.onDidChangeState(() => {
        if (activeClient !== observedClient || state === "stopping") return;
        setState(
          observedClient.isRunning()
            ? "running"
            : observedClient.needsStart()
              ? "error"
              : "starting",
        );
      });
      await Promise.race([
        client.start(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `language client startup timed out after ${configuration.lspStartupTimeoutMs}ms`,
                ),
              ),
            configuration.lspStartupTimeoutMs,
          );
        }),
      ]);
      setState("running");
    } catch (error) {
      stateSubscription?.dispose();
      stateSubscription = undefined;
      activeClient = undefined;
      await client?.terminate();
      setState("error");
      outputChannel.appendLine(
        `[bird2-lsp] language client startup failed: ${toSanitizedErrorDetails(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const start = (configuration: ExtensionConfiguration): Promise<void> =>
    runExclusive(async () => {
      if (state === "running") return;
      await stopClient();
      await startClient(configuration);
    });
  const stop = (): Promise<void> =>
    runExclusive(async () => {
      setState("stopping");
      try {
        await stopClient();
      } finally {
        setState("idle");
      }
    });
  const restart = (configuration: ExtensionConfiguration): Promise<void> =>
    runExclusive(async () => {
      setState("stopping");
      await stopClient();
      await startClient(configuration);
    });
  const dispose = async (): Promise<void> => {
    await stop();
    outputChannel.dispose();
  };
  return {
    get state() {
      return state;
    },
    start,
    stop,
    restart,
    dispose,
  };
};
