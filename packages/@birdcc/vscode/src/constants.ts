export const EXTENSION_ID = "birdcc.bird2-lsp";
export const EXTENSION_NAME = "BIRD2 LSP";

export const CONFIG_SECTION = "bird2-lsp";
export const LANGUAGE_ID = "bird2";
export const LANGUAGE_SCOPE = "source.bird2";

export const DEFAULT_SERVER_PATH = ["birdcc", "lsp", "--stdio"] as const;
export const DEFAULT_VALIDATION_COMMAND = "bird -p -c {file}";
export const DEFAULT_FORMATTER_ENGINE = "dprint" as const;
export const DEFAULT_FORMATTER_SAFE_MODE = true;
