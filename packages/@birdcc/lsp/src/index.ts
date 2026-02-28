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

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
      },
    }),
  );

  const validateDocument = (textDocument: TextDocument): void => {
    const result = lintBirdConfig(textDocument.getText());

    connection.sendDiagnostics({
      uri: textDocument.uri,
      diagnostics: result.diagnostics.map(toLspDiagnostic),
    });
  };

  documents.onDidOpen((event) => {
    validateDocument(event.document);
  });

  documents.onDidChangeContent((event) => {
    validateDocument(event.document);
  });

  documents.onDidClose((event) => {
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  documents.listen(connection);
  connection.listen();
};
