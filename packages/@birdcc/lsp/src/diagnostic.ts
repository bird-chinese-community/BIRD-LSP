import {
  DiagnosticSeverity,
  type Diagnostic,
} from "vscode-languageserver/node.js";
import type { BirdDiagnostic } from "@birdcc/core";

const toLspSeverity = (
  severity: BirdDiagnostic["severity"],
): DiagnosticSeverity => {
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

export const toInternalErrorDiagnostic = (error: unknown): Diagnostic => ({
  code: "lsp/internal-error",
  message: error instanceof Error ? error.message : String(error),
  severity: DiagnosticSeverity.Error,
  source: "lsp",
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
});
