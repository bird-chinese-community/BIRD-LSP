export { activate, deactivate, runtimeState } from "./extension.js";
export {
  CONFIG_SECTION,
  DEFAULT_HIDDEN_ERRORS,
  DEFAULT_LSP_ENABLED,
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_SERVER_PATH,
  DEFAULT_TRACE_SERVER,
  DEFAULT_VALIDATION_COMMAND,
  DEFAULT_VALIDATION_ON_SAVE,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  EXTENSION_ID,
  EXTENSION_NAME,
  LANGUAGE_ID,
  LANGUAGE_SCOPE,
} from "./constants.js";
export {
  createDefaultRuntimeState,
  defaultExtensionConfiguration,
  extensionConfigurationSchema,
  formatterEngineSchema,
  parseExtensionConfiguration,
  traceServerSchema,
} from "./types.js";
export type {
  ExtensionConfiguration,
  ExtensionRuntimeState,
  FormatterEngine,
  TraceServer,
} from "./types.js";
export {
  createConfigurationManager,
  type ExtensionConfigurationChange,
  type ExtensionConfigurationManager,
} from "./config/index.js";
export {
  createBirdClientLifecycle,
  createLanguageClient,
  type BirdClientLifecycle,
  type ClientLifecycleState,
} from "./client/index.js";
export {
  createFallbackValidator,
  parseBirdValidationOutput,
  type FallbackValidator,
} from "./fallback/index.js";
export { createBirdFormattingProvider } from "./formatter/index.js";
export {
  BIRD_COMMAND_IDS,
  registerBirdCommands,
  type BirdCommandId,
  type BirdCommandRegistrationContext,
} from "./commands/index.js";
