import type { OutputChannel } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";

import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import { createLanguageClient } from "./client.js";

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
}

export const createBirdClientLifecycle = (
  outputChannel: OutputChannel,
  options: BirdClientLifecycleOptions = {},
): BirdClientLifecycle => {
  let state: ClientLifecycleState = "idle";
  let activeClient: LanguageClient | undefined;
  let activeOperation: Promise<void> | undefined;
  const setState = (nextState: ClientLifecycleState): void => {
    state = nextState;
    options.onStateChange?.(nextState);
  };

  const runExclusive = async (operation: () => Promise<void>) => {
    while (activeOperation) {
      await activeOperation;
    }

    const operationPromise = operation();
    activeOperation = operationPromise;
    try {
      await operationPromise;
    } finally {
      activeOperation = undefined;
    }
  };

  const startClientWithTimeout = async (
    client: LanguageClient,
    startupTimeoutMs: number,
  ): Promise<void> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const startupTimeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `language client startup timed out after ${startupTimeoutMs}ms`,
          ),
        );
      }, startupTimeoutMs);
    });

    try {
      await Promise.race([client.start(), startupTimeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  };

  const start = async (configuration: ExtensionConfiguration): Promise<void> =>
    runExclusive(async () => {
      if (state === "running") {
        return;
      }

      setState("starting");
      outputChannel.appendLine("[bird2-lsp] starting language client");

      try {
        activeClient = createLanguageClient(configuration, outputChannel);
        await startClientWithTimeout(
          activeClient,
          configuration.lspStartupTimeoutMs,
        );
        setState("running");
        outputChannel.appendLine("[bird2-lsp] language client started");
      } catch (error) {
        if (activeClient) {
          try {
            await activeClient.stop();
          } catch {
            // best effort cleanup; startup may already be partially failed
          }
        }
        setState("error");
        activeClient = undefined;
        outputChannel.appendLine(
          `[bird2-lsp] failed to start language client: ${toSanitizedErrorDetails(error)}`,
        );
        throw error;
      }
    });

  const stop = async (): Promise<void> =>
    runExclusive(async () => {
      if (!activeClient) {
        setState("idle");
        return;
      }

      setState("stopping");
      outputChannel.appendLine("[bird2-lsp] stopping language client");

      try {
        await activeClient.stop();
      } finally {
        activeClient = undefined;
        setState("idle");
        outputChannel.appendLine("[bird2-lsp] language client stopped");
      }
    });

  const restart = async (
    configuration: ExtensionConfiguration,
  ): Promise<void> =>
    runExclusive(async () => {
      if (activeClient) {
        setState("stopping");
        outputChannel.appendLine("[bird2-lsp] restarting language client");
        await activeClient.stop();
      }

      setState("starting");
      activeClient = createLanguageClient(configuration, outputChannel);
      await startClientWithTimeout(
        activeClient,
        configuration.lspStartupTimeoutMs,
      );
      setState("running");
      outputChannel.appendLine("[bird2-lsp] language client restarted");
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
