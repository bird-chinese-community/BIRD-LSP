import { Language, Parser } from "web-tree-sitter";
import { fileURLToPath } from "node:url";

const LANGUAGE_WASM_PATH = fileURLToPath(new URL("./tree-sitter-birdcc.wasm", import.meta.url));

let parserPromise: Promise<Parser> | null = null;

const createParser = async (): Promise<Parser> => {
  await Parser.init();
  const language = await Language.load(LANGUAGE_WASM_PATH);

  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
};

export const getParser = async (): Promise<Parser> => {
  if (!parserPromise) {
    parserPromise = createParser();
  }

  return parserPromise;
};
