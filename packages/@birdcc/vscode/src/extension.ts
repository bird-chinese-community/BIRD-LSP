import { languages, window, workspace } from "vscode";
import type { ExtensionContext } from "vscode";

import { createBirdClientLifecycle } from "./client/index.js";
import { createConfigurationManager } from "./config/index.js";
import { EXTENSION_NAME } from "./constants.js";
import {
  createFallbackValidator,
  type FallbackValidator,
} from "./fallback/index.js";
import { createBirdFormattingProvider } from "./formatter/index.js";
import { createDefaultRuntimeState } from "./types.js";
import { LANGUAGE_ID } from "./constants.js";

export const runtimeState = createDefaultRuntimeState();

let deactivateTask: Promise<void> | undefined;
let fallbackValidator: FallbackValidator | undefined;

const disposeFallbackValidator = (): void => {
  if (!fallbackValidator) {
    return;
  }

  fallbackValidator.dispose();
  fallbackValidator = undefined;
};

const runConfigurationLifecycle = async (
  change: ReturnType<
    ReturnType<typeof createConfigurationManager>["refreshFromWorkspace"]
  >,
  lifecycle: ReturnType<typeof createBirdClientLifecycle>,
  createOrGetFallbackValidator: () => FallbackValidator,
  isWorkspaceTrusted: boolean,
  onWorkspaceTrustBlocked: () => void,
): Promise<void> => {
  runtimeState.configuration = change.current;

  if (!isWorkspaceTrusted) {
    disposeFallbackValidator();
    await lifecycle.stop();
    onWorkspaceTrustBlocked();
    return;
  }

  if (!change.current.enabled) {
    await lifecycle.stop();
    const validator = createOrGetFallbackValidator();
    await validator.validateActiveEditor();
    return;
  }

  disposeFallbackValidator();

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
  const formattingProvider = createBirdFormattingProvider(
    () => runtimeState.configuration,
    outputChannel,
  );
  let workspaceTrustWarningShown = false;
  const createOrGetFallbackValidator = (): FallbackValidator => {
    if (!fallbackValidator) {
      fallbackValidator = createFallbackValidator(
        () => runtimeState.configuration,
        outputChannel,
      );
      fallbackValidator.activate();
    }

    return fallbackValidator;
  };
  const onWorkspaceTrustBlocked = (): void => {
    if (workspaceTrustWarningShown) {
      return;
    }

    outputChannel.appendLine(
      "[bird2-lsp] workspace is untrusted; language client and fallback validator are disabled",
    );
    workspaceTrustWarningShown = true;
  };
  const runLifecycle = (
    change: ReturnType<
      ReturnType<typeof createConfigurationManager>["refreshFromWorkspace"]
    >,
  ): Promise<void> => {
    if (workspace.isTrusted) {
      workspaceTrustWarningShown = false;
    }

    return runConfigurationLifecycle(
      change,
      lifecycle,
      createOrGetFallbackValidator,
      workspace.isTrusted,
      onWorkspaceTrustBlocked,
    );
  };

  const initialChange =
    configurationManager.refreshFromWorkspace("initial-load");
  await runLifecycle(initialChange);

  context.subscriptions.push(
    configurationManager.onDidChange((event) => {
      void runLifecycle(event);
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
  context.subscriptions.push(
    workspace.onDidGrantWorkspaceTrust(() => {
      workspaceTrustWarningShown = false;
      const change =
        configurationManager.refreshFromWorkspace("workspace-change");
      void runLifecycle(change);
    }),
  );

  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider(
      { language: LANGUAGE_ID, scheme: "file" },
      formattingProvider,
    ),
  );

  context.subscriptions.push({
    dispose: () => {
      configurationManager.dispose();
      disposeFallbackValidator();
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
