import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  type CompletionItem,
  type Diagnostic,
  type DocumentSymbol,
  type Hover,
  type InitializeResult,
  type Position,
  type Range,
  SymbolKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { BirdDeclaration, ParsedBirdDocument, SourceRange } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
import type { BirdDiagnostic } from "@birdcc/core";
import { lintBirdConfig } from "@birdcc/linter";
import { createValidationScheduler } from "./validation.js";

const KEYWORD_DOCS: Record<string, string> = {
  protocol: "Define a protocol instance. Example: `protocol bgp edge { ... }`.",
  template: "Define a reusable protocol template.",
  filter: "Define route filtering logic.",
  function: "Define reusable logic callable from filters.",
  include: "Include another configuration file.",
  import: "Control import policy for routes.",
  export: "Control export policy for routes.",
  neighbor: "Configure protocol neighbor endpoint and ASN.",
  local: "Used in `local as <asn>;` for local AS number.",
};

const COMPLETION_KEYWORDS = [
  "protocol",
  "template",
  "filter",
  "function",
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

const toLspSeverity = (severity: BirdDiagnostic["severity"]): DiagnosticSeverity => {
  if (severity === "error") {
    return DiagnosticSeverity.Error;
  }

  if (severity === "warning") {
    return DiagnosticSeverity.Warning;
  }

  return DiagnosticSeverity.Information;
};

const toLspRange = (range: SourceRange): Range => ({
  start: {
    line: Math.max(range.line - 1, 0),
    character: Math.max(range.column - 1, 0),
  },
  end: {
    line: Math.max(range.endLine - 1, 0),
    character: Math.max(range.endColumn - 1, 0),
  },
});

const declarationNameRange = (declaration: BirdDeclaration): SourceRange | null => {
  if (
    declaration.kind === "protocol" ||
    declaration.kind === "template" ||
    declaration.kind === "filter" ||
    declaration.kind === "function"
  ) {
    return declaration.nameRange;
  }

  return null;
};

const declarationSymbolKind = (declaration: BirdDeclaration): SymbolKind | null => {
  if (declaration.kind === "protocol") {
    return SymbolKind.Module;
  }

  if (declaration.kind === "template") {
    return SymbolKind.Class;
  }

  if (declaration.kind === "filter") {
    return SymbolKind.Method;
  }

  if (declaration.kind === "function") {
    return SymbolKind.Function;
  }

  return null;
};

const declarationDetail = (declaration: BirdDeclaration): string => {
  if (declaration.kind === "protocol") {
    return `protocol ${declaration.protocolType}`;
  }

  if (declaration.kind === "template") {
    return `template ${declaration.templateType}`;
  }

  if (declaration.kind === "filter") {
    return "filter";
  }

  if (declaration.kind === "function") {
    return "function";
  }

  return declaration.kind;
};

const hoverMarkdownForDeclaration = (declaration: BirdDeclaration): string => {
  if (declaration.kind === "protocol") {
    const fromTemplate = declaration.fromTemplate ? ` from \`${declaration.fromTemplate}\`` : "";
    return `**protocol** \`${declaration.name}\`\n\nType: \`${declaration.protocolType}\`${fromTemplate}`;
  }

  if (declaration.kind === "template") {
    return `**template** \`${declaration.name}\`\n\nType: \`${declaration.templateType}\``;
  }

  if (declaration.kind === "filter") {
    return `**filter** \`${declaration.name}\``;
  }

  if (declaration.kind === "function") {
    return `**function** \`${declaration.name}\``;
  }

  return `**${declaration.kind}**`;
};

const isPositionInRange = (position: Position, range: SourceRange): boolean => {
  const line = position.line + 1;
  const character = position.character + 1;

  if (line < range.line || line > range.endLine) {
    return false;
  }

  if (line === range.line && character < range.column) {
    return false;
  }

  if (line === range.endLine && character > range.endColumn) {
    return false;
  }

  return true;
};

const offsetAt = (document: TextDocument, position: Position): number => {
  const lines = document.getText().split("\n");
  let offset = 0;

  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return offset + position.character;
};

const keywordAtPosition = (
  document: TextDocument,
  position: Position,
): { word: string; range: Range } | null => {
  const text = document.getText();
  const positionOffset = offsetAt(document, position);

  if (positionOffset < 0 || positionOffset > text.length) {
    return null;
  }

  const isWordChar = (char: string): boolean => /[A-Za-z_]/.test(char);

  let start = positionOffset;
  while (start > 0 && isWordChar(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = positionOffset;
  while (end < text.length && isWordChar(text[end] ?? "")) {
    end += 1;
  }

  if (start === end) {
    return null;
  }

  const word = text.slice(start, end).toLowerCase();
  const startPosition = document.positionAt(start);
  const endPosition = document.positionAt(end);

  return {
    word,
    range: {
      start: startPosition,
      end: endPosition,
    },
  };
};

/** Maps Bird diagnostic schema into LSP Diagnostic schema. */
export const toLspDiagnostic = (diagnostic: BirdDiagnostic): Diagnostic => ({
  code: diagnostic.code,
  message: diagnostic.message,
  severity: toLspSeverity(diagnostic.severity),
  source: diagnostic.source,
  range: {
    start: {
      line: Math.max(diagnostic.range.line - 1, 0),
      character: Math.max(diagnostic.range.column - 1, 0),
    },
    end: {
      line: Math.max(diagnostic.range.endLine - 1, 0),
      character: Math.max(diagnostic.range.endColumn - 1, 0),
    },
  },
});

export const createDocumentSymbolsFromParsed = (parsed: ParsedBirdDocument): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];

  for (const declaration of parsed.program.declarations) {
    const range = declarationNameRange(declaration);
    const kind = declarationSymbolKind(declaration);

    if (!range || !kind) {
      continue;
    }

    const name =
      declaration.kind === "protocol" ||
      declaration.kind === "template" ||
      declaration.kind === "filter" ||
      declaration.kind === "function"
        ? declaration.name
        : declaration.kind;

    symbols.push({
      name,
      detail: declarationDetail(declaration),
      kind,
      range: toLspRange(declaration),
      selectionRange: toLspRange(range),
      children: [],
    });
  }

  return symbols;
};

export const createCompletionItemsFromParsed = (parsed: ParsedBirdDocument): CompletionItem[] => {
  const completionItems: CompletionItem[] = COMPLETION_KEYWORDS.map((keyword) => ({
    label: keyword,
    kind: CompletionItemKind.Keyword,
    detail: "BIRD keyword",
  }));

  const seenSymbols = new Set<string>();

  for (const declaration of parsed.program.declarations) {
    if (
      declaration.kind !== "protocol" &&
      declaration.kind !== "template" &&
      declaration.kind !== "filter" &&
      declaration.kind !== "function"
    ) {
      continue;
    }

    const symbolName = declaration.name;
    if (symbolName.length === 0 || seenSymbols.has(symbolName)) {
      continue;
    }

    seenSymbols.add(symbolName);
    completionItems.push({
      label: symbolName,
      kind: CompletionItemKind.Reference,
      detail: declarationDetail(declaration),
    });
  }

  return completionItems;
};

export const createHoverFromParsed = (
  parsed: ParsedBirdDocument,
  document: TextDocument,
  position: Position,
): Hover | null => {
  for (const declaration of parsed.program.declarations) {
    const nameRange = declarationNameRange(declaration);
    if (!nameRange || !isPositionInRange(position, nameRange)) {
      continue;
    }

    return {
      contents: {
        kind: "markdown",
        value: hoverMarkdownForDeclaration(declaration),
      },
      range: toLspRange(nameRange),
    };
  }

  const keyword = keywordAtPosition(document, position);
  if (!keyword) {
    return null;
  }

  const keywordDoc = KEYWORD_DOCS[keyword.word];
  if (!keywordDoc) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: `**${keyword.word}**\n\n${keywordDoc}`,
    },
    range: keyword.range,
  };
};

const VALIDATION_DEBOUNCE_MS = 120;

const toInternalErrorDiagnostic = (error: unknown): Diagnostic => ({
  code: "lsp/internal-error",
  message: error instanceof Error ? error.message : String(error),
  severity: DiagnosticSeverity.Error,
  source: "lsp",
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
});

const warmupParserRuntime = async (): Promise<void> => {
  try {
    await lintBirdConfig("");
  } catch {
    // Warmup is best-effort and must not block server startup.
  }
};

/** Starts the stdio LSP server with async lint validation and last-write-wins scheduling. */
export const startLspServer = (): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  let hasShutdownBeenRequested = false;

  void warmupParserRuntime();

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentSymbolProvider: true,
        hoverProvider: true,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: [" ", "."],
        },
      },
    }),
  );

  const scheduler = createValidationScheduler<TextDocument, Diagnostic>({
    debounceMs: VALIDATION_DEBOUNCE_MS,
    validate: async (textDocument): Promise<Diagnostic[]> => {
      try {
        const result = await lintBirdConfig(textDocument.getText());
        return result.diagnostics.map(toLspDiagnostic);
      } catch (error) {
        return [toInternalErrorDiagnostic(error)];
      }
    },
    publish: (payload) => {
      connection.sendDiagnostics(payload);
    },
  });

  documents.onDidOpen((event) => {
    scheduler.schedule(event.document);
  });

  documents.onDidChangeContent((event) => {
    scheduler.schedule(event.document);
  });

  documents.onDidClose((event) => {
    scheduler.close(event.document.uri);
  });

  connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await parseBirdConfig(document.getText());
    return createDocumentSymbolsFromParsed(parsed);
  });

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const parsed = await parseBirdConfig(document.getText());
    return createHoverFromParsed(parsed, document, params.position);
  });

  connection.onCompletion(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await parseBirdConfig(document.getText());
    return createCompletionItemsFromParsed(parsed);
  });

  connection.onShutdown(() => {
    hasShutdownBeenRequested = true;
  });

  connection.onExit(() => {
    if (!hasShutdownBeenRequested) {
      process.exitCode = 1;
    }
  });

  documents.listen(connection);
  connection.listen();
};
