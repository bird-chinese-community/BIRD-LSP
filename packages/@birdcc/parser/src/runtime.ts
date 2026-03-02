import { Language, Parser } from "web-tree-sitter";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_LANGUAGE_WASM_PATHS = [
  fileURLToPath(new URL("./tree-sitter-birdcc.wasm", import.meta.url)),
  fileURLToPath(new URL("../src/tree-sitter-birdcc.wasm", import.meta.url)),
];

let parserPromise: Promise<Parser> | null = null;
let languageWasmPaths: string[] = [...DEFAULT_LANGUAGE_WASM_PATHS];

const loadLanguage = async (): Promise<Language> => {
  let lastError: unknown;

  for (const path of languageWasmPaths) {
    if (!existsSync(path)) {
      continue;
    }

    try {
      return await Language.load(path);
    } catch (error) {
      lastError = error;
    }
  }

  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  const availablePaths = languageWasmPaths.join(", ");
  throw new Error(
    `Unable to load Tree-sitter WASM language from any candidate path: ${availablePaths}. Last error: ${errorMessage}`,
  );
};

const createParser = async (): Promise<Parser> => {
  await Parser.init();
  const language = await loadLanguage();

  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
};

export const getParser = async (): Promise<Parser> => {
  if (!parserPromise) {
    parserPromise = createParser().catch((error: unknown) => {
      parserPromise = null;
      throw error;
    });
  }

  return parserPromise;
};

export const resetParserRuntimeForTests = (): void => {
  parserPromise = null;
  languageWasmPaths = [...DEFAULT_LANGUAGE_WASM_PATHS];
};

export const setLanguageWasmPathsForTests = (paths: string[]): void => {
  languageWasmPaths = [...paths];
  parserPromise = null;
};
