import {
  DiagnosticSeverity,
  Position,
  Range,
  Uri,
  type Diagnostic,
} from "vscode";
import { parseBirdValidationOutput as parseBirdValidationOutputCore } from "@birdcc/core";

export const parseBirdValidationOutput = (
  output: string,
  documentUri: Uri,
): Diagnostic[] => {
  const coreDiagnostics = parseBirdValidationOutputCore(
    output,
    documentUri.fsPath,
  );

  return coreDiagnostics.map((d) => ({
    message: d.message,
    severity: DiagnosticSeverity.Error,
    source: "bird -p",
    range: new Range(
      new Position(
        Math.max(0, d.range.line - 1),
        Math.max(0, d.range.column - 1),
      ),
      new Position(
        Math.max(0, d.range.endLine - 1),
        Math.max(0, d.range.endColumn - 1),
      ),
    ),
  }));
};
