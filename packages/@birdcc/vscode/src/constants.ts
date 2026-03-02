export const EXTENSION_ID = "birdcc.bird2-lsp";
export const EXTENSION_NAME = "BIRD2 LSP";

export const CONFIG_SECTION = "bird2-lsp";
export const LANGUAGE_ID = "bird2";
export const LANGUAGE_SCOPE = "source.bird2";

export const DEFAULT_LSP_ENABLED = true;
export const DEFAULT_SERVER_PATH = ["birdcc", "lsp", "--stdio"] as const;
export const DEFAULT_TRACE_SERVER = "off" as const;
export const DEFAULT_HIDDEN_ERRORS = [
  "textDocument/definition",
  "textDocument/references",
] as const;
export const DEFAULT_VALIDATION_COMMAND = "bird -p -c {file}";
export const DEFAULT_FORMATTER_ENGINE = "dprint" as const;
export const DEFAULT_FORMATTER_SAFE_MODE = true;

export const RESTART_REQUIRED_CONFIGURATION_PATHS = [
  "enabled",
  "serverPath",
  "trace.server",
  "hiddenErrors",
] as const;
