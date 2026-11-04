import { languages, Uri, window, workspace } from "vscode";
import type { ExtensionContext } from "vscode";

import { createBirdClientLifecycle } from "./client/index.js";
import { registerBirdCommands } from "./commands/index.js";
import { createConfigurationManager } from "./config/index.js";
import { announceProjectConfigGuidance } from "./config/project-config-guidance.js";
import { EXTENSION_NAME } from "./constants.js";
import type { ClientLifecycleState } from "./client/index.js";
import {
  createFallbackValidator,
  type FallbackValidator,
} from "./fallback/index.js";
import { createBirdFormattingProvider } from "./formatter/index.js";
import { createBirdDocumentEligibilityGate } from "./eligibility/index.js";
import { registerBirdKeywordHoverProvider } from "./hover/index.js";
import { createBirdStatusBarManager } from "./status/index.js";
import { registerBirdTypeHintProviders } from "./type-hints/index.js";
import { createDefaultRuntimeState } from "./types.js";
import { BIRD_DOCUMENT_SELECTOR } from "./constants.js";
import { toSanitizedErrorDetails } from "./security/index.js";
import { enforceLargeFileGuard } from "./performance/large-file.js";

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
  onStatusUpdated: () => void,
): Promise<void> => {
  runtimeState.configuration = change.current;
  onStatusUpdated();

  try {
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
  } finally {
    onStatusUpdated();
  }
};

export const activate = async (context: ExtensionContext): Promise<void> => {
  runtimeState.activated = true;
  const outputChannel = window.createOutputChannel(EXTENSION_NAME, {
    log: true,
  });
  outputChannel.appendLine(
    `[bird2-lsp] activating extension v${String(context.extension.packageJSON.version ?? "unknown")}`,
  );
  void announceProjectConfigGuidance(outputChannel);
  const configurationManager = createConfigurationManager((message) =>
    outputChannel.appendLine(message),
  );
  const eligibilityGate = createBirdDocumentEligibilityGate();
  const statusBarManager = createBirdStatusBarManager();
  let lifecycleState: ClientLifecycleState = "idle";
  let resourceFallbackValidator: FallbackValidator | undefined;
  const hoverWarningCache = new Set<string>();
  const refreshStatus = (): void => {
    statusBarManager.render({
      isWorkspaceTrusted: workspace.isTrusted,
      lifecycleState,
      configuration: window.activeTextEditor
        ? configurationManager.getForResource(
            window.activeTextEditor.document.uri,
          )
        : runtimeState.configuration,
    });
  };
  const lifecycle = createBirdClientLifecycle(outputChannel, {
    extensionPath: context.extensionPath,
    getConfigurationForResource: (uri) =>
      uri
        ? configurationManager.getForResource(Uri.parse(uri))
        : configurationManager.snapshot,
    onStateChange: (state) => {
      lifecycleState = state;
      if (state === "running") disposeFallbackValidator();
      else if (state === "error" && workspace.isTrusted) {
        createOrGetFallbackValidator();
      }
      syncResourceFallback();
      refreshStatus();
    },
  });
  lifecycleState = lifecycle.state;
  refreshStatus();
  outputChannel.appendLine("[bird2-lsp] status bar initialized");
  const formattingProvider = createBirdFormattingProvider(
    (document) => configurationManager.getForResource(document.uri),
    outputChannel,
    eligibilityGate.isEligible,
  );
  let workspaceTrustWarningShown = false;
  const createOrGetFallbackValidator = (): FallbackValidator => {
    if (!fallbackValidator) {
      fallbackValidator = createFallbackValidator(
        (document) => configurationManager.getForResource(document.uri),
        outputChannel,
        eligibilityGate.isEligible,
      );
      fallbackValidator.activate();
    }

    return fallbackValidator;
  };
  const syncResourceFallback = (): void => {
    if (lifecycleState !== "running" || !workspace.isTrusted) {
      resourceFallbackValidator?.dispose();
      resourceFallbackValidator = undefined;
      return;
    }
    if (!resourceFallbackValidator) {
      resourceFallbackValidator = createFallbackValidator(
        (document) => {
          const configuration = configurationManager.getForResource(
            document.uri,
          );
          return {
            ...configuration,
            validationEnabled:
              configuration.validationEnabled && !configuration.enabled,
          };
        },
        outputChannel,
        eligibilityGate.isEligible,
      );
      resourceFallbackValidator.activate();
    }
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
      refreshStatus,
    );
  };
  const runLifecycleSafely = (
    change: ReturnType<
      ReturnType<typeof createConfigurationManager>["refreshFromWorkspace"]
    >,
    source: "initial-load" | "configuration-change" | "workspace-trust",
  ): void => {
    void runLifecycle(change).catch((error) => {
      outputChannel.appendLine(
        `[bird2-lsp] lifecycle update failed (${source}): ${toSanitizedErrorDetails(error)}`,
      );
      const validator = createOrGetFallbackValidator();
      void validator.validateActiveEditor();
      refreshStatus();
    });
  };
  const reloadConfiguration = async (): Promise<void> => {
    configurationManager.refreshFromWorkspace("workspace-change");
  };
  const manualValidator = createFallbackValidator(
    (document) => configurationManager.getForResource(document.uri),
    outputChannel,
    eligibilityGate.isEligible,
  );
  manualValidator.activate({ background: false });
  const validateActiveDocument = async (): Promise<void> => {
    await manualValidator.validateActiveEditor({ saveDirty: true });
  };

  const initialChange =
    configurationManager.refreshFromWorkspace("initial-load");
  runLifecycleSafely(initialChange, "initial-load");

  context.subscriptions.push(
    configurationManager.onDidChange((event) => {
      runLifecycleSafely(event, "configuration-change");
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (!configurationManager.didSectionChange(event)) {
        return;
      }

      configurationManager.refreshFromWorkspace("workspace-change");
      syncResourceFallback();
      fallbackValidator?.refreshConfiguration();
      resourceFallbackValidator?.refreshConfiguration();
      manualValidator.refreshConfiguration();
      refreshStatus();
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(() => {
      configurationManager.refreshFromWorkspace("workspace-change");
    }),
  );
  context.subscriptions.push(
    workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "bird2")
        configurationManager.refreshFromWorkspace("workspace-change");
    }),
    workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === "bird2")
        configurationManager.refreshFromWorkspace("workspace-change");
    }),
  );
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(() => {
      refreshStatus();
      void resourceFallbackValidator?.validateActiveEditor();
    }),
  );
  context.subscriptions.push(
    workspace.onDidGrantWorkspaceTrust(() => {
      workspaceTrustWarningShown = false;
      const change =
        configurationManager.refreshFromWorkspace("workspace-change");
      runLifecycleSafely(change, "workspace-trust");
    }),
  );

  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider(
      [...BIRD_DOCUMENT_SELECTOR],
      formattingProvider,
    ),
  );
  context.subscriptions.push(
    languages.registerDocumentRangeFormattingEditProvider(
      [...BIRD_DOCUMENT_SELECTOR],
      formattingProvider,
    ),
  );
  context.subscriptions.push(
    registerBirdKeywordHoverProvider({
      isLspActive: (document) =>
        lifecycleState === "running" &&
        configurationManager.getForResource(document.uri).enabled,
      isDocumentEligible: async (document) => {
        const guard = await enforceLargeFileGuard({
          document,
          configuration: configurationManager.getForResource(document.uri),
          outputChannel,
          featureName: "keyword hover",
          warningCache: hoverWarningCache,
        });
        return !guard.skipped && eligibilityGate.isEligible(document);
      },
    }),
  );
  context.subscriptions.push(
    ...registerBirdTypeHintProviders({
      getConfiguration: (document) =>
        configurationManager.getForResource(document.uri),
      outputChannel,
      isDocumentEligible: eligibilityGate.isEligible,
    }),
  );
  context.subscriptions.push(
    ...registerBirdCommands({
      outputChannel,
      lifecycle,
      getConfiguration: () => {
        const document = window.activeTextEditor?.document;
        return document
          ? configurationManager.getForResource(document.uri)
          : configurationManager.snapshot;
      },
      validateActiveDocument,
      reloadConfiguration,
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      outputChannel.appendLine("[bird2-lsp] disposing extension");
      statusBarManager.dispose();
      configurationManager.dispose();
      eligibilityGate.dispose();
      disposeFallbackValidator();
      manualValidator.dispose();
      resourceFallbackValidator?.dispose();
      resourceFallbackValidator = undefined;
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
