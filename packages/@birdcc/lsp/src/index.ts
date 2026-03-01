import {
  createConnection,
  DiagnosticSeverity,
  type Diagnostic,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { BirdDiagnostic } from "@birdcc/core";
import { lintBirdConfig } from "@birdcc/linter";
import { createValidationScheduler } from "./validation.js";

const toLspSeverity = (severity: BirdDiagnostic["severity"]): DiagnosticSeverity => {
  if (severity === "error") {
    return DiagnosticSeverity.Error;
  }

  if (severity === "warning") {
    return DiagnosticSeverity.Warning;
  }

  return DiagnosticSeverity.Information;
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

/** Starts the stdio LSP server with async lint validation and last-write-wins scheduling. */
export const startLspServer = (): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
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
    publish: (uri, diagnostics) => {
      connection.sendDiagnostics({ uri, diagnostics });
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

  documents.listen(connection);
  connection.listen();
};
