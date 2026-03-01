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
  define: "Define a reusable constant. Example: `define ASN = 65001;`.",
  include: "Include another configuration file.",
  table: "Define a routing table resource for protocol/channel usage.",
  import: "Control import policy for routes.",
  export: "Control export policy for routes.",
  neighbor: "Configure protocol neighbor endpoint and ASN.",
  "local as": "Configure local ASN via `local as <asn>;`.",
  "router id": "Set explicit router ID or select from runtime source.",
  ipv4: "IPv4 address family/channel/table scope keyword.",
  ipv6: "IPv6 address family/channel/table scope keyword.",
};

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

interface LspDeclarationMetadata {
  symbolName: string;
  selectionRange: SourceRange;
  symbolKind: SymbolKind;
  detail: string;
  hoverMarkdown: string;
  completionLabel?: string;
  completionKind?: CompletionItemKind;
  completionDetail?: string;
}

const declarationMetadata = (declaration: BirdDeclaration): LspDeclarationMetadata | null => {
  switch (declaration.kind) {
    case "protocol": {
      const fromTemplate = declaration.fromTemplate ? ` from \`${declaration.fromTemplate}\`` : "";
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Module,
        detail: `protocol ${declaration.protocolType}`,
        hoverMarkdown: `**protocol** \`${declaration.name}\`\n\nType: \`${declaration.protocolType}\`${fromTemplate}`,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: `protocol ${declaration.protocolType}`,
      };
    }
    case "template":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Class,
        detail: `template ${declaration.templateType}`,
        hoverMarkdown: `**template** \`${declaration.name}\`\n\nType: \`${declaration.templateType}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: `template ${declaration.templateType}`,
      };
    case "filter":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Method,
        detail: "filter",
        hoverMarkdown: `**filter** \`${declaration.name}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: "filter",
      };
    case "function":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Function,
        detail: "function",
        hoverMarkdown: `**function** \`${declaration.name}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: "function",
      };
    case "define":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Constant,
        detail: "define",
        hoverMarkdown: `**define** \`${declaration.name}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Constant,
        completionDetail: "define",
      };
    case "table":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Object,
        detail: `table ${declaration.tableType}`,
        hoverMarkdown: `**table** \`${declaration.name}\`\n\nType: \`${declaration.tableType}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Variable,
        completionDetail: `table ${declaration.tableType}`,
      };
    case "include":
      return {
        symbolName: declaration.path,
        selectionRange: declaration.pathRange,
        symbolKind: SymbolKind.File,
        detail: "include",
        hoverMarkdown: `**include** \`${declaration.path}\``,
      };
    case "router-id": {
      const fromSource = declaration.fromSource ? ` (${declaration.fromSource})` : "";
      return {
        symbolName: `router id ${declaration.value}`,
        selectionRange: declaration.valueRange,
        symbolKind: SymbolKind.Property,
        detail: `router-id ${declaration.valueKind}`,
        hoverMarkdown: `**router id** \`${declaration.value}\`${fromSource}`,
      };
    }
    default:
      return null;
  }
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const keywordAtPosition = (
  document: TextDocument,
  position: Position,
): { word: string; range: Range } | null => {
  const text = document.getText();
  const positionOffset = document.offsetAt(position);

  if (positionOffset < 0 || positionOffset > text.length) {
    return null;
  }

  const keywords = Object.keys(KEYWORD_DOCS).sort((left, right) => right.length - left.length);
  for (const keyword of keywords) {
    const keywordPattern = new RegExp(
      `\\b${escapeRegExp(keyword).replaceAll("\\ ", "\\\\s+")}\\b`,
      "gi",
    );
    let match = keywordPattern.exec(text);

    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (positionOffset >= start && positionOffset <= end) {
        return {
          word: keyword,
          range: {
            start: document.positionAt(start),
            end: document.positionAt(end),
          },
        };
      }

      match = keywordPattern.exec(text);
    }
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
    const metadata = declarationMetadata(declaration);
    if (!metadata) {
      continue;
    }

    symbols.push({
      name: metadata.symbolName,
      detail: metadata.detail,
      kind: metadata.symbolKind,
      range: toLspRange(declaration),
      selectionRange: toLspRange(metadata.selectionRange),
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
    const metadata = declarationMetadata(declaration);
    if (!metadata?.completionLabel) {
      continue;
    }

    const symbolName = metadata.completionLabel;
    if (symbolName.length === 0 || seenSymbols.has(symbolName)) {
      continue;
    }

    seenSymbols.add(symbolName);
    completionItems.push({
      label: symbolName,
      kind: metadata.completionKind ?? CompletionItemKind.Reference,
      detail: metadata.completionDetail ?? metadata.detail,
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
    const metadata = declarationMetadata(declaration);
    if (!metadata || !isPositionInRange(position, metadata.selectionRange)) {
      continue;
    }

    return {
      contents: {
        kind: "markdown",
        value: metadata.hoverMarkdown,
      },
      range: toLspRange(metadata.selectionRange),
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
  const parsedByUri = new Map<string, { version: number; parsed: ParsedBirdDocument }>();
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
        parsedByUri.set(textDocument.uri, {
          version: textDocument.version,
          parsed: result.parsed,
        });
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
    parsedByUri.delete(event.document.uri);
    scheduler.close(event.document.uri);
  });

  const getParsedDocument = async (document: TextDocument): Promise<ParsedBirdDocument> => {
    const cached = parsedByUri.get(document.uri);
    if (cached && cached.version === document.version) {
      return cached.parsed;
    }

    const parsed = await parseBirdConfig(document.getText());
    parsedByUri.set(document.uri, {
      version: document.version,
      parsed,
    });
    return parsed;
  };

  connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await getParsedDocument(document);
    return createDocumentSymbolsFromParsed(parsed);
  });

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const parsed = await getParsedDocument(document);
    return createHoverFromParsed(parsed, document, params.position);
  });

  connection.onCompletion(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await getParsedDocument(document);
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
