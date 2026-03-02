import {
  EventEmitter,
  type ConfigurationChangeEvent,
  type Disposable,
  workspace,
} from "vscode";

import {
  CONFIG_SECTION,
  RESTART_REQUIRED_CONFIGURATION_PATHS,
} from "../constants.js";
import { extensionConfigurationFields } from "./schema.js";
import {
  defaultExtensionConfiguration,
  parseExtensionConfiguration,
  type ExtensionConfiguration,
} from "../types.js";

export type ConfigurationChangeReason = "initial-load" | "workspace-change";

export interface ExtensionConfigurationChange {
  readonly previous: ExtensionConfiguration;
  readonly current: ExtensionConfiguration;
  readonly changedPaths: readonly string[];
  readonly requiresRestart: boolean;
  readonly reason: ConfigurationChangeReason;
}

export interface ExtensionConfigurationManager {
  readonly snapshot: ExtensionConfiguration;
  refreshFromWorkspace: (
    reason: ConfigurationChangeReason,
  ) => ExtensionConfigurationChange;
  onDidChange: (
    listener: (event: ExtensionConfigurationChange) => void,
  ) => Disposable;
  didSectionChange: (event: ConfigurationChangeEvent) => boolean;
  dispose: () => void;
}

const areValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const readWorkspaceConfiguration = (): ExtensionConfiguration => {
  const config = workspace.getConfiguration(CONFIG_SECTION);
  const fields = extensionConfigurationFields;

  return parseExtensionConfiguration({
    enabled: config.get(
      fields.enabled.workspaceKey,
      fields.enabled.defaultValue,
    ),
    serverPath: config.get(fields.serverPath.workspaceKey, [
      ...fields.serverPath.defaultValue,
    ]),
    traceServer: config.get(
      fields.traceServer.workspaceKey,
      fields.traceServer.defaultValue,
    ),
    hiddenErrors: config.get(fields.hiddenErrors.workspaceKey, [
      ...fields.hiddenErrors.defaultValue,
    ]),
    validationEnabled: config.get(
      fields.validationEnabled.workspaceKey,
      fields.validationEnabled.defaultValue,
    ),
    validationCommand: config.get(
      fields.validationCommand.workspaceKey,
      fields.validationCommand.defaultValue,
    ),
    validationOnSave: config.get(
      fields.validationOnSave.workspaceKey,
      fields.validationOnSave.defaultValue,
    ),
    validationTimeoutMs: config.get(
      fields.validationTimeoutMs.workspaceKey,
      fields.validationTimeoutMs.defaultValue,
    ),
    performanceMaxFileSizeBytes: config.get(
      fields.performanceMaxFileSizeBytes.workspaceKey,
      fields.performanceMaxFileSizeBytes.defaultValue,
    ),
    lspStartupTimeoutMs: config.get(
      fields.lspStartupTimeoutMs.workspaceKey,
      fields.lspStartupTimeoutMs.defaultValue,
    ),
    formatterEngine: config.get(
      fields.formatterEngine.workspaceKey,
      fields.formatterEngine.defaultValue,
    ),
    formatterSafeMode: config.get(
      fields.formatterSafeMode.workspaceKey,
      fields.formatterSafeMode.defaultValue,
    ),
    typeHintsEnabled: config.get(
      fields.typeHintsEnabled.workspaceKey,
      fields.typeHintsEnabled.defaultValue,
    ),
    typeHintsHoverEnabled: config.get(
      fields.typeHintsHoverEnabled.workspaceKey,
      fields.typeHintsHoverEnabled.defaultValue,
    ),
    typeHintsInlayEnabled: config.get(
      fields.typeHintsInlayEnabled.workspaceKey,
      fields.typeHintsInlayEnabled.defaultValue,
    ),
  });
};

const diffConfiguration = (
  previous: ExtensionConfiguration,
  current: ExtensionConfiguration,
): readonly string[] =>
  (Object.keys(previous) as Array<keyof ExtensionConfiguration>)
    .filter((key) => !areValuesEqual(previous[key], current[key]))
    .map((key) => String(key));

const shouldRestart = (changedPaths: readonly string[]): boolean =>
  changedPaths.some((path) =>
    RESTART_REQUIRED_CONFIGURATION_PATHS.includes(
      path as (typeof RESTART_REQUIRED_CONFIGURATION_PATHS)[number],
    ),
  );

export const createConfigurationManager = (): ExtensionConfigurationManager => {
  let snapshot = defaultExtensionConfiguration;
  const emitter = new EventEmitter<ExtensionConfigurationChange>();

  const refreshFromWorkspace = (
    reason: ConfigurationChangeReason,
  ): ExtensionConfigurationChange => {
    const previous = snapshot;
    const current = readWorkspaceConfiguration();
    const changedPaths = diffConfiguration(previous, current);

    snapshot = current;

    const event: ExtensionConfigurationChange = {
      previous,
      current,
      changedPaths,
      requiresRestart: shouldRestart(changedPaths),
      reason,
    };

    if (changedPaths.length > 0) {
      emitter.fire(event);
    }

    return event;
  };

  const didSectionChange = (event: ConfigurationChangeEvent): boolean =>
    event.affectsConfiguration(CONFIG_SECTION);

  const dispose = (): void => {
    emitter.dispose();
  };

  return {
    get snapshot() {
      return snapshot;
    },
    refreshFromWorkspace,
    onDidChange: emitter.event,
    didSectionChange,
    dispose,
  };
};
