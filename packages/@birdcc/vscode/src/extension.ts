import { workspace } from "vscode";
import type { ExtensionContext } from "vscode";

import {
  CONFIG_SECTION,
  DEFAULT_SERVER_PATH,
  DEFAULT_VALIDATION_COMMAND,
} from "./constants.js";
import {
  createDefaultRuntimeState,
  parseExtensionConfiguration,
} from "./types.js";

export const runtimeState = createDefaultRuntimeState();

const readConfiguration = () => {
  const config = workspace.getConfiguration(CONFIG_SECTION);

  return parseExtensionConfiguration({
    serverPath: config.get("serverPath", [...DEFAULT_SERVER_PATH]),
    validationEnabled: config.get("validation.enabled", true),
    validationCommand: config.get(
      "validation.command",
      DEFAULT_VALIDATION_COMMAND,
    ),
    formatterEngine: config.get(
      "formatter.engine",
      runtimeState.configuration.formatterEngine,
    ),
    formatterSafeMode: config.get(
      "formatter.safeMode",
      runtimeState.configuration.formatterSafeMode,
    ),
  });
};

export const activate = async (context: ExtensionContext): Promise<void> => {
  runtimeState.activated = true;
  runtimeState.configuration = readConfiguration();

  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }

      runtimeState.configuration = readConfiguration();
    }),
  );
};

export const deactivate = async (): Promise<void> => {
  runtimeState.activated = false;
};
