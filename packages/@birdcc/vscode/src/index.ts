export { activate, deactivate, runtimeState } from "./extension.js";
export {
  CONFIG_SECTION,
  DEFAULT_HIDDEN_ERRORS,
  DEFAULT_LSP_ENABLED,
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_TYPE_HINTS_ENABLED,
  DEFAULT_TYPE_HINTS_HOVER_ENABLED,
  DEFAULT_TYPE_HINTS_INLAY_ENABLED,
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
  type BirdClientLifecycleOptions,
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
export {
  createBirdStatusBarManager,
  type BirdStatusBarManager,
  type BirdStatusSnapshot,
} from "./status/index.js";
export {
  registerBirdTypeHintProviders,
  collectFunctionReturnHints,
  type BirdTypeHintRegistrationContext,
  type BirdHintType,
  type FunctionReturnDetail,
  type FunctionReturnHint,
} from "./type-hints/index.js";
