import {
  extensionConfigurationFields,
  restartRequiredConfigurationPaths,
} from "./config/schema.js";

export const EXTENSION_ID = "birdcc.bird2-lsp";
export const EXTENSION_NAME = "BIRD2 LSP (Beta)";

export const CONFIG_SECTION = "bird2-lsp";
export const LANGUAGE_ID = "bird2";
export const LANGUAGE_SCOPE = "source.bird2";
export const BIRD_DOCUMENT_SELECTOR = [{ language: LANGUAGE_ID }] as const;

export const DEFAULT_LSP_ENABLED =
  extensionConfigurationFields.enabled.defaultValue;
export const DEFAULT_SERVER_PATH =
  extensionConfigurationFields.serverPath.defaultValue;
export const DEFAULT_TRACE_SERVER =
  extensionConfigurationFields.traceServer.defaultValue;
export const DEFAULT_HIDDEN_ERRORS =
  extensionConfigurationFields.hiddenErrors.defaultValue;
export const DEFAULT_VALIDATION_COMMAND =
  extensionConfigurationFields.validationCommand.defaultValue;
export const DEFAULT_VALIDATION_ON_SAVE =
  extensionConfigurationFields.validationOnSave.defaultValue;
export const DEFAULT_VALIDATION_TIMEOUT_MS =
  extensionConfigurationFields.validationTimeoutMs.defaultValue;
export const DEFAULT_PERFORMANCE_MAX_FILE_SIZE_BYTES =
  extensionConfigurationFields.performanceMaxFileSizeBytes.defaultValue;
export const DEFAULT_PERFORMANCE_STARTUP_TIMEOUT_MS =
  extensionConfigurationFields.lspStartupTimeoutMs.defaultValue;
export const DEFAULT_FORMATTER_ENGINE =
  extensionConfigurationFields.formatterEngine.defaultValue;
export const DEFAULT_FORMATTER_SAFE_MODE =
  extensionConfigurationFields.formatterSafeMode.defaultValue;
export const DEFAULT_TYPE_HINTS_ENABLED =
  extensionConfigurationFields.typeHintsEnabled.defaultValue;
export const DEFAULT_TYPE_HINTS_HOVER_ENABLED =
  extensionConfigurationFields.typeHintsHoverEnabled.defaultValue;
export const DEFAULT_TYPE_HINTS_INLAY_ENABLED =
  extensionConfigurationFields.typeHintsInlayEnabled.defaultValue;
export const DEFAULT_INTEL_ENABLED =
  extensionConfigurationFields.intelEnabled.defaultValue;
export const DEFAULT_INTEL_INLAY_HINTS =
  extensionConfigurationFields.intelInlayHints.defaultValue;
export const DEFAULT_INTEL_COMPLETION =
  extensionConfigurationFields.intelCompletion.defaultValue;
export const DEFAULT_INTEL_HOVER =
  extensionConfigurationFields.intelHover.defaultValue;

export const RESTART_REQUIRED_CONFIGURATION_PATHS =
  restartRequiredConfigurationPaths;
