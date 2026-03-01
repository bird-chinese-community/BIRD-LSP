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

const toLspSeverity = (severity: BirdDiagnostic["severity"]): DiagnosticSeverity => {
  if (severity === "error") {
    return DiagnosticSeverity.Error;
  }

  if (severity === "warning") {
    return DiagnosticSeverity.Warning;
  }

  return DiagnosticSeverity.Information;
};

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

export const startLspServer = (): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const validationTickets = new Map<string, number>();

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
      },
    }),
  );

  const validateDocument = async (textDocument: TextDocument): Promise<void> => {
    const uri = textDocument.uri;
    const ticket = (validationTickets.get(uri) ?? 0) + 1;
    validationTickets.set(uri, ticket);

    try {
      const result = await lintBirdConfig(textDocument.getText());
      if (validationTickets.get(uri) !== ticket) {
        return;
      }

      connection.sendDiagnostics({
        uri,
        diagnostics: result.diagnostics.map(toLspDiagnostic),
      });
    } catch (error) {
      if (validationTickets.get(uri) !== ticket) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      connection.sendDiagnostics({
        uri,
        diagnostics: [
          {
            code: "lsp/internal-error",
            message,
            severity: DiagnosticSeverity.Error,
            source: "lsp",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
          },
        ],
      });
    }
  };

  documents.onDidOpen((event) => {
    void validateDocument(event.document);
  });

  documents.onDidChangeContent((event) => {
    void validateDocument(event.document);
  });

  documents.onDidClose((event) => {
    validationTickets.delete(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  documents.listen(connection);
  connection.listen();
};
