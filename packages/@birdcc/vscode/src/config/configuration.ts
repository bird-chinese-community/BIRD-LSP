import {
  EventEmitter,
  type ConfigurationChangeEvent,
  type Disposable,
  workspace,
} from "vscode";

import {
  CONFIG_SECTION,
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_TYPE_HINTS_ENABLED,
  DEFAULT_TYPE_HINTS_HOVER_ENABLED,
  DEFAULT_TYPE_HINTS_INLAY_ENABLED,
  DEFAULT_HIDDEN_ERRORS,
  DEFAULT_LSP_ENABLED,
  DEFAULT_SERVER_PATH,
  DEFAULT_TRACE_SERVER,
  DEFAULT_VALIDATION_COMMAND,
  DEFAULT_VALIDATION_ON_SAVE,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  DEFAULT_PERFORMANCE_MAX_FILE_SIZE_BYTES,
  RESTART_REQUIRED_CONFIGURATION_PATHS,
} from "../constants.js";
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

  return parseExtensionConfiguration({
    enabled: config.get("enabled", DEFAULT_LSP_ENABLED),
    serverPath: config.get("serverPath", [...DEFAULT_SERVER_PATH]),
    traceServer: config.get("trace.server", DEFAULT_TRACE_SERVER),
    hiddenErrors: config.get("hiddenErrors", [...DEFAULT_HIDDEN_ERRORS]),
    validationEnabled: config.get("validation.enabled", true),
    validationCommand: config.get(
      "validation.command",
      DEFAULT_VALIDATION_COMMAND,
    ),
    validationOnSave: config.get(
      "validation.onSave",
      DEFAULT_VALIDATION_ON_SAVE,
    ),
    validationTimeoutMs: config.get(
      "validation.timeout",
      DEFAULT_VALIDATION_TIMEOUT_MS,
    ),
    performanceMaxFileSizeBytes: config.get(
      "performance.maxFileSizeBytes",
      DEFAULT_PERFORMANCE_MAX_FILE_SIZE_BYTES,
    ),
    formatterEngine: config.get("formatter.engine", DEFAULT_FORMATTER_ENGINE),
    formatterSafeMode: config.get(
      "formatter.safeMode",
      DEFAULT_FORMATTER_SAFE_MODE,
    ),
    typeHintsEnabled: config.get(
      "typeHints.enabled",
      DEFAULT_TYPE_HINTS_ENABLED,
    ),
    typeHintsHoverEnabled: config.get(
      "typeHints.hover.enabled",
      DEFAULT_TYPE_HINTS_HOVER_ENABLED,
    ),
    typeHintsInlayEnabled: config.get(
      "typeHints.inlay.enabled",
      DEFAULT_TYPE_HINTS_INLAY_ENABLED,
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
