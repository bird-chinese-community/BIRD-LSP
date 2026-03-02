import type { OutputChannel } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";

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

export const createBirdClientLifecycle = (
  outputChannel: OutputChannel,
): BirdClientLifecycle => {
  let state: ClientLifecycleState = "idle";
  let activeClient: LanguageClient | undefined;
  let activeOperation: Promise<void> | undefined;

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

  const start = async (configuration: ExtensionConfiguration): Promise<void> =>
    runExclusive(async () => {
      if (state === "running") {
        return;
      }

      state = "starting";
      outputChannel.appendLine("[bird2-lsp] starting language client");

      try {
        activeClient = createLanguageClient(configuration, outputChannel);
        await activeClient.start();
        state = "running";
        outputChannel.appendLine("[bird2-lsp] language client started");
      } catch (error) {
        state = "error";
        activeClient = undefined;
        outputChannel.appendLine(
          `[bird2-lsp] failed to start language client: ${String(error)}`,
        );
        throw error;
      }
    });

  const stop = async (): Promise<void> =>
    runExclusive(async () => {
      if (!activeClient) {
        state = "idle";
        return;
      }

      state = "stopping";
      outputChannel.appendLine("[bird2-lsp] stopping language client");

      try {
        await activeClient.stop();
      } finally {
        activeClient = undefined;
        state = "idle";
        outputChannel.appendLine("[bird2-lsp] language client stopped");
      }
    });

  const restart = async (
    configuration: ExtensionConfiguration,
  ): Promise<void> =>
    runExclusive(async () => {
      if (activeClient) {
        state = "stopping";
        outputChannel.appendLine("[bird2-lsp] restarting language client");
        await activeClient.stop();
      }

      state = "starting";
      activeClient = createLanguageClient(configuration, outputChannel);
      await activeClient.start();
      state = "running";
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
