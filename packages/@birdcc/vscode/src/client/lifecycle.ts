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
  readonly extensionPath?: string;
}

class StartupTimeoutError extends Error {
  public readonly code = "BIRD2_LSP_STARTUP_TIMEOUT";
}

export const createBirdClientLifecycle = (
  outputChannel: OutputChannel,
  options: BirdClientLifecycleOptions = {},
): BirdClientLifecycle => {
  let state: ClientLifecycleState = "idle";
  let activeClient: LanguageClient | undefined;
  let activeOperation: Promise<void> | undefined;
  let startupCleanupPending = false;
  const setState = (nextState: ClientLifecycleState): void => {
    state = nextState;
    options.onStateChange?.(nextState);
  };

  const runExclusive = async (operation: () => Promise<void>) => {
    while (activeOperation) {
      try {
        await activeOperation;
      } catch {
        // previous operation failure must not block queued lifecycle operations
      }
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
    const startPromise = client.start();
    const startupTimeoutPromise = new Promise<"timed-out">((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve("timed-out");
      }, startupTimeoutMs);
    });

    try {
      const result = await Promise.race([
        startPromise.then(() => "started" as const),
        startupTimeoutPromise,
      ]);

      if (result !== "timed-out") {
        return;
      }

      const timeoutError = new StartupTimeoutError(
        `language client startup timed out after ${startupTimeoutMs}ms`,
      );
      startupCleanupPending = true;
      void (async () => {
        try {
          try {
            await startPromise;
          } catch (error) {
            outputChannel.appendLine(
              `[bird2-lsp] startup-timeout cleanup startup result: ${toSanitizedErrorDetails(error)}`,
            );
            return;
          }

          try {
            await client.stop();
          } catch (error) {
            outputChannel.appendLine(
              `[bird2-lsp] startup-timeout cleanup stop failed: ${toSanitizedErrorDetails(error)}`,
            );
          }
        } finally {
          startupCleanupPending = false;
        }
      })();
      throw timeoutError;
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
      if (startupCleanupPending) {
        throw new Error(
          "previous timed-out startup is still cleaning up in background",
        );
      }

      setState("starting");
      outputChannel.appendLine("[bird2-lsp] starting language client");

      try {
        activeClient = createLanguageClient(
          configuration,
          outputChannel,
          options.extensionPath,
        );
        await startClientWithTimeout(
          activeClient,
          configuration.lspStartupTimeoutMs,
        );
        setState("running");
        outputChannel.appendLine("[bird2-lsp] language client started");
      } catch (error) {
        if (activeClient && !(error instanceof StartupTimeoutError)) {
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
      if (startupCleanupPending) {
        throw new Error(
          "previous timed-out startup is still cleaning up in background",
        );
      }

      if (activeClient) {
        setState("stopping");
        outputChannel.appendLine("[bird2-lsp] restarting language client");
        await activeClient.stop();
      }

      try {
        setState("starting");
        activeClient = createLanguageClient(
          configuration,
          outputChannel,
          options.extensionPath,
        );
        await startClientWithTimeout(
          activeClient,
          configuration.lspStartupTimeoutMs,
        );
        setState("running");
        outputChannel.appendLine("[bird2-lsp] language client restarted");
      } catch (error) {
        if (activeClient && !(error instanceof StartupTimeoutError)) {
          try {
            await activeClient.stop();
          } catch {
            // best effort cleanup; startup may already be partially failed
          }
        }
        setState("error");
        activeClient = undefined;
        outputChannel.appendLine(
          `[bird2-lsp] failed to restart language client: ${toSanitizedErrorDetails(error)}`,
        );
        throw error;
      }
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
