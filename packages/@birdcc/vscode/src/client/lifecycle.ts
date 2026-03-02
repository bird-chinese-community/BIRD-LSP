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

  const start = async (configuration: ExtensionConfiguration): Promise<void> =>
    runExclusive(async () => {
      if (state === "running") {
        return;
      }

      setState("starting");
      outputChannel.appendLine("[bird2-lsp] starting language client");

      try {
        activeClient = createLanguageClient(configuration, outputChannel);
        await activeClient.start();
        setState("running");
        outputChannel.appendLine("[bird2-lsp] language client started");
      } catch (error) {
        setState("error");
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
      await activeClient.start();
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
