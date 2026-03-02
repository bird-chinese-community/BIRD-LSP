import {
  ConfigurationTarget,
  Uri,
  commands,
  env,
  window,
  workspace,
  type Disposable,
  type OutputChannel,
} from "vscode";

import type { BirdClientLifecycle } from "../client/index.js";
import { CONFIG_SECTION, EXTENSION_ID, LANGUAGE_ID } from "../constants.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";

const DOCUMENTATION_URL =
  "https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode";
export const BIRD_COMMAND_IDS = {
  restartLanguageServer: "bird2-lsp.restartLanguageServer",
  enableLanguageServer: "bird2-lsp.enableLanguageServer",
  disableLanguageServer: "bird2-lsp.disableLanguageServer",
  validateActiveDocument: "bird2-lsp.validateActiveDocument",
  formatActiveDocument: "bird2-lsp.formatActiveDocument",
  openSettings: "bird2-lsp.openSettings",
  showOutputChannel: "bird2-lsp.showOutputChannel",
  showDocumentation: "bird2-lsp.showDocumentation",
  reloadConfiguration: "bird2-lsp.reloadConfiguration",
} as const;

export type BirdCommandId =
  (typeof BIRD_COMMAND_IDS)[keyof typeof BIRD_COMMAND_IDS];

export interface BirdCommandRegistrationContext {
  readonly outputChannel: OutputChannel;
  readonly lifecycle: BirdClientLifecycle;
  readonly getConfiguration: () => ExtensionConfiguration;
  readonly validateActiveDocument: () => Promise<void>;
  readonly reloadConfiguration: () => Promise<void>;
}

const resolveConfigurationTarget = (): ConfigurationTarget =>
  workspace.workspaceFolders && workspace.workspaceFolders.length > 0
    ? ConfigurationTarget.Workspace
    : ConfigurationTarget.Global;

const isBirdEditorActive = (): boolean => {
  const activeDocument = window.activeTextEditor?.document;
  if (!activeDocument) {
    return false;
  }

  return (
    activeDocument.languageId === LANGUAGE_ID &&
    activeDocument.uri.scheme === "file"
  );
};

const updateLanguageServerEnabled = async (enabled: boolean): Promise<void> => {
  await workspace
    .getConfiguration(CONFIG_SECTION)
    .update("enabled", enabled, resolveConfigurationTarget());
};

const registerCommand = (
  commandId: BirdCommandId,
  handler: () => Promise<void>,
): Disposable =>
  commands.registerCommand(commandId, () => {
    void handler();
  });

export const registerBirdCommands = (
  context: BirdCommandRegistrationContext,
): readonly Disposable[] => [
  registerCommand(BIRD_COMMAND_IDS.restartLanguageServer, async () => {
    if (!workspace.isTrusted) {
      void window.showWarningMessage(
        "BIRD2 LSP commands are disabled in untrusted workspaces.",
      );
      return;
    }

    const configuration = context.getConfiguration();
    if (!configuration.enabled) {
      void window.showInformationMessage(
        "Language server is disabled. Run 'BIRD2: Enable Language Server' first.",
      );
      return;
    }

    try {
      await context.lifecycle.restart(configuration);
      void window.showInformationMessage("BIRD2 language server restarted.");
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] restart command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to restart BIRD2 language server.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.enableLanguageServer, async () => {
    if (context.getConfiguration().enabled) {
      void window.showInformationMessage(
        "BIRD2 language server is already enabled.",
      );
      return;
    }

    try {
      await updateLanguageServerEnabled(true);
      void window.showInformationMessage("BIRD2 language server enabled.");
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] enable command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to enable BIRD2 language server.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.disableLanguageServer, async () => {
    if (!context.getConfiguration().enabled) {
      void window.showInformationMessage(
        "BIRD2 language server is already disabled.",
      );
      return;
    }

    try {
      await updateLanguageServerEnabled(false);
      void window.showInformationMessage(
        "BIRD2 language server disabled. Fallback validation remains available.",
      );
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] disable command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to disable BIRD2 language server.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.validateActiveDocument, async () => {
    if (!isBirdEditorActive()) {
      void window.showWarningMessage(
        "Open a BIRD2 file first to run validation.",
      );
      return;
    }

    try {
      await context.validateActiveDocument();
      void window.showInformationMessage("BIRD2 validation command finished.");
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] validate command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to validate active BIRD2 document.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.formatActiveDocument, async () => {
    if (!isBirdEditorActive()) {
      void window.showWarningMessage(
        "Open a BIRD2 file first to run formatting.",
      );
      return;
    }

    try {
      await commands.executeCommand("editor.action.formatDocument");
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] format command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to format active BIRD2 document.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.openSettings, async () => {
    try {
      await commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${EXTENSION_ID}`,
      );
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] open settings command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to open BIRD2 extension settings.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.showOutputChannel, async () => {
    context.outputChannel.show(true);
  }),
  registerCommand(BIRD_COMMAND_IDS.showDocumentation, async () => {
    try {
      await env.openExternal(Uri.parse(DOCUMENTATION_URL));
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] show documentation command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to open BIRD2 documentation.");
    }
  }),
  registerCommand(BIRD_COMMAND_IDS.reloadConfiguration, async () => {
    try {
      await context.reloadConfiguration();
      void window.showInformationMessage("BIRD2 configuration reloaded.");
    } catch (error) {
      context.outputChannel.appendLine(
        `[bird2-lsp] reload configuration command failed: ${toSanitizedErrorDetails(error)}`,
      );
      void window.showErrorMessage("Failed to reload BIRD2 configuration.");
    }
  }),
];
