import {
  StatusBarAlignment,
  ThemeColor,
  window,
  type Disposable,
} from "vscode";

import type { ClientLifecycleState } from "../client/index.js";
import { BIRD_COMMAND_IDS } from "../commands/index.js";
import type { ExtensionConfiguration } from "../types.js";

export interface BirdStatusSnapshot {
  readonly isWorkspaceTrusted: boolean;
  readonly lifecycleState: ClientLifecycleState;
  readonly configuration: ExtensionConfiguration;
}

export interface BirdStatusBarManager extends Disposable {
  render: (snapshot: BirdStatusSnapshot) => void;
}

const createFallbackTooltip = (): string =>
  [
    "BIRD2 fallback mode is active (bird -p validation).",
    "Click to validate the active document.",
  ].join("\n");

const createTrustedTooltip = (state: ClientLifecycleState): string => {
  switch (state) {
    case "starting":
      return "BIRD2 language server is starting.";
    case "stopping":
      return "BIRD2 language server is stopping.";
    case "running":
      return "BIRD2 language server is running.\nClick to restart.";
    case "error":
      return "BIRD2 language server encountered an error.\nClick to open output channel.";
    case "idle":
      return "BIRD2 language server is idle.\nClick to restart.";
    default: {
      const exhaustiveCheck: never = state;
      return `BIRD2 language server is in an unknown state: ${String(exhaustiveCheck)}`;
    }
  }
};

export const createBirdStatusBarManager = (): BirdStatusBarManager => {
  const statusBarItem = window.createStatusBarItem(
    StatusBarAlignment.Right,
    100,
  );
  statusBarItem.name = "BIRD2 LSP Status";

  const render = (snapshot: BirdStatusSnapshot): void => {
    if (!snapshot.isWorkspaceTrusted) {
      statusBarItem.text = "$(shield) BIRD2: Untrusted";
      statusBarItem.tooltip =
        "Workspace is untrusted. BIRD2 LSP and fallback validation are disabled.";
      statusBarItem.command = "workbench.trust.manage";
      statusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      statusBarItem.show();
      return;
    }

    if (!snapshot.configuration.enabled) {
      statusBarItem.text = "$(warning) BIRD2: Fallback";
      statusBarItem.tooltip = createFallbackTooltip();
      statusBarItem.command = BIRD_COMMAND_IDS.validateActiveDocument;
      statusBarItem.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      statusBarItem.show();
      return;
    }

    switch (snapshot.lifecycleState) {
      case "starting":
        statusBarItem.text = "$(sync~spin) BIRD2: Starting";
        statusBarItem.command = BIRD_COMMAND_IDS.showOutputChannel;
        break;
      case "stopping":
        statusBarItem.text = "$(sync~spin) BIRD2: Stopping";
        statusBarItem.command = BIRD_COMMAND_IDS.showOutputChannel;
        break;
      case "running":
        statusBarItem.text = "$(check) BIRD2: LSP";
        statusBarItem.command = BIRD_COMMAND_IDS.restartLanguageServer;
        break;
      case "error":
        statusBarItem.text = "$(error) BIRD2: Error";
        statusBarItem.command = BIRD_COMMAND_IDS.showOutputChannel;
        statusBarItem.backgroundColor = new ThemeColor(
          "statusBarItem.errorBackground",
        );
        break;
      case "idle":
        statusBarItem.text = "$(clock) BIRD2: Idle";
        statusBarItem.command = BIRD_COMMAND_IDS.restartLanguageServer;
        break;
      default: {
        const exhaustiveCheck: never = snapshot.lifecycleState;
        statusBarItem.text = `$(question) BIRD2: Unknown (${String(exhaustiveCheck)})`;
        statusBarItem.command = BIRD_COMMAND_IDS.showOutputChannel;
        break;
      }
    }

    if (snapshot.lifecycleState !== "error") {
      statusBarItem.backgroundColor = undefined;
    }

    statusBarItem.tooltip = createTrustedTooltip(snapshot.lifecycleState);
    statusBarItem.show();
  };

  const dispose = (): void => {
    statusBarItem.hide();
    statusBarItem.dispose();
  };

  return {
    render,
    dispose,
  };
};
