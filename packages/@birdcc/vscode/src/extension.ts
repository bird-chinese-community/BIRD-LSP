import { window, workspace } from "vscode";
import type { ExtensionContext } from "vscode";

import { createBirdClientLifecycle } from "./client/index.js";
import { createConfigurationManager } from "./config/index.js";
import { EXTENSION_NAME } from "./constants.js";
import { createDefaultRuntimeState } from "./types.js";

export const runtimeState = createDefaultRuntimeState();

let deactivateTask: Promise<void> | undefined;

const runConfigurationLifecycle = async (
  change: ReturnType<
    ReturnType<typeof createConfigurationManager>["refreshFromWorkspace"]
  >,
  lifecycle: ReturnType<typeof createBirdClientLifecycle>,
): Promise<void> => {
  runtimeState.configuration = change.current;

  if (!change.current.enabled) {
    await lifecycle.stop();
    return;
  }

  if (lifecycle.state === "running" && change.requiresRestart) {
    await lifecycle.restart(change.current);
    return;
  }

  if (lifecycle.state !== "running") {
    await lifecycle.start(change.current);
  }
};

export const activate = async (context: ExtensionContext): Promise<void> => {
  runtimeState.activated = true;
  const outputChannel = window.createOutputChannel(EXTENSION_NAME);
  const configurationManager = createConfigurationManager();
  const lifecycle = createBirdClientLifecycle(outputChannel);

  const initialChange =
    configurationManager.refreshFromWorkspace("initial-load");
  await runConfigurationLifecycle(initialChange, lifecycle);

  context.subscriptions.push(
    configurationManager.onDidChange((event) => {
      void runConfigurationLifecycle(event, lifecycle);
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (!configurationManager.didSectionChange(event)) {
        return;
      }

      configurationManager.refreshFromWorkspace("workspace-change");
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      configurationManager.dispose();
      deactivateTask = lifecycle.dispose();
    },
  });
};

export const deactivate = async (): Promise<void> => {
  runtimeState.activated = false;
  if (deactivateTask) {
    await deactivateTask;
    deactivateTask = undefined;
  }
};
