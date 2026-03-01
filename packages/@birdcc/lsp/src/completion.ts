import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
} from "vscode-languageserver/node.js";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { declarationMetadata, KEYWORD_DOCS } from "./shared.js";

const COMPLETION_KEYWORDS = [
  "protocol",
  "template",
  "filter",
  "function",
  "define",
  "include",
  "import",
  "export",
  "neighbor",
  "local as",
  "router id",
  "table",
  "ipv4",
  "ipv6",
];

interface CompletionSnippet {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
}

const COMPLETION_SNIPPETS: CompletionSnippet[] = [
  {
    label: 'include "..."',
    detail: "BIRD snippet",
    documentation: "Insert include statement.",
    insertText: 'include "${1:path/to/file.conf}";',
  },
  {
    label: "define NAME = value;",
    detail: "BIRD snippet",
    documentation: "Insert define statement.",
    insertText: "define ${1:NAME} = ${2:value};",
  },
  {
    label: "router id 1.1.1.1;",
    detail: "BIRD snippet",
    documentation: "Insert router id statement.",
    insertText: "router id ${1:1.1.1.1};",
  },
  {
    label: "protocol bgp ...",
    detail: "BIRD snippet",
    documentation: "Insert minimal BGP protocol block.",
    insertText:
      "protocol bgp ${1:name} {\n  neighbor ${2:192.0.2.1} as ${3:65001};\n  local as ${4:65000};\n}",
  },
];

export interface CompletionContextOptions {
  linePrefix?: string;
}

const isFromTemplateContext = (linePrefix: string): boolean =>
  /\bfrom\s+[A-Za-z_][A-Za-z0-9_]*$/i.test(linePrefix) || /\bfrom\s*$/i.test(linePrefix);

const isIncludePathContext = (linePrefix: string): boolean =>
  /\binclude\s+["'][^"']*$/i.test(linePrefix);

const keywordCompletionItems = (): CompletionItem[] =>
  COMPLETION_KEYWORDS.map((keyword) => ({
    label: keyword,
    kind: CompletionItemKind.Keyword,
    detail: "BIRD keyword",
    documentation: KEYWORD_DOCS[keyword] ?? "",
  }));

const snippetCompletionItems = (): CompletionItem[] =>
  COMPLETION_SNIPPETS.map((snippet) => ({
    label: snippet.label,
    kind: CompletionItemKind.Snippet,
    detail: snippet.detail,
    documentation: snippet.documentation,
    insertText: snippet.insertText,
    insertTextFormat: InsertTextFormat.Snippet,
  }));

const includePathCompletionItems = (
  parsed: ParsedBirdDocument,
  options: { quoteWrapped: boolean },
): CompletionItem[] => {
  const paths = new Set<string>();

  for (const declaration of parsed.program.declarations) {
    if (declaration.kind !== "include") {
      continue;
    }

    if (declaration.path.length > 0) {
      paths.add(declaration.path);
    }
  }

  return Array.from(paths).map((path) => ({
    label: path,
    kind: CompletionItemKind.File,
    detail: "include path",
    insertText: options.quoteWrapped ? path : `"${path}"`,
  }));
};

const collectDeclarationCompletionItems = (
  parsed: ParsedBirdDocument,
  predicate: (declaration: ParsedBirdDocument["program"]["declarations"][number]) => boolean,
): CompletionItem[] => {
  const items: CompletionItem[] = [];
  const seen = new Set<string>();

  for (const declaration of parsed.program.declarations) {
    if (!predicate(declaration)) {
      continue;
    }

    const metadata = declarationMetadata(declaration);
    if (!metadata?.completionLabel || seen.has(metadata.completionLabel)) {
      continue;
    }

    seen.add(metadata.completionLabel);
    items.push({
      label: metadata.completionLabel,
      kind: metadata.completionKind ?? CompletionItemKind.Reference,
      detail: metadata.completionDetail ?? metadata.detail,
    });
  }

  return items;
};

const templateCompletionItems = (parsed: ParsedBirdDocument): CompletionItem[] =>
  collectDeclarationCompletionItems(parsed, (declaration) => declaration.kind === "template");

const declarationCompletionItems = (parsed: ParsedBirdDocument): CompletionItem[] => {
  return collectDeclarationCompletionItems(parsed, () => true);
};

export const createCompletionItemsFromParsed = (
  parsed: ParsedBirdDocument,
  options: CompletionContextOptions = {},
): CompletionItem[] => {
  const linePrefix = options.linePrefix ?? "";

  if (isIncludePathContext(linePrefix)) {
    return includePathCompletionItems(parsed, { quoteWrapped: true });
  }

  if (isFromTemplateContext(linePrefix)) {
    return templateCompletionItems(parsed);
  }

  return [
    ...keywordCompletionItems(),
    ...snippetCompletionItems(),
    ...declarationCompletionItems(parsed),
  ];
};
