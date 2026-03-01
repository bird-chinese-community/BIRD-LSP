import {
  createConnection,
  type Diagnostic,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
import { lintBirdConfig } from "@birdcc/linter";
import { createCompletionItemsFromParsed } from "./completion.js";
import { createDocumentSymbolsFromParsed } from "./document-symbol.js";
import { toInternalErrorDiagnostic, toLspDiagnostic } from "./diagnostic.js";
import { createHoverFromParsed } from "./hover.js";
import { createValidationScheduler } from "./validation.js";

const VALIDATION_DEBOUNCE_MS = 120;

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
    const linePrefix = document.getText({
      start: { line: params.position.line, character: 0 },
      end: params.position,
    });
    return createCompletionItemsFromParsed(parsed, { linePrefix });
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
