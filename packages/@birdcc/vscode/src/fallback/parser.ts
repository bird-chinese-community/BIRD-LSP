import {
  DiagnosticSeverity,
  Position,
  Range,
  Uri,
  type Diagnostic,
} from "vscode";

const clampLine = (line: number): number => Math.max(0, line - 1);
const clampColumn = (column: number | undefined): number =>
  Math.max(0, (column ?? 1) - 1);

const toDiagnostic = (
  message: string,
  line: number,
  column: number | undefined,
): Diagnostic => ({
  message,
  severity: DiagnosticSeverity.Error,
  source: "bird -p",
  range: new Range(
    new Position(clampLine(line), clampColumn(column)),
    new Position(clampLine(line), clampColumn(column) + 1),
  ),
});

const parseFileLineColumn = (
  output: string,
  currentFile: string,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const pattern = /^(.+?):(\d+):(?:(\d+):)?\s*(.+)$/gm;

  for (const match of output.matchAll(pattern)) {
    const file = match[1]?.trim();
    const line = Number.parseInt(match[2] ?? "1", 10);
    const column = match[3] ? Number.parseInt(match[3], 10) : 1;
    const message = match[4]?.trim() || "Validation error";

    if (file && file !== currentFile) {
      continue;
    }

    diagnostics.push(toDiagnostic(message, line, column));
  }

  return diagnostics;
};

const parseParseErrorLine = (output: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const pattern = /Parse error.*line\s+(\d+)\s*:\s*(.+)$/gim;

  for (const match of output.matchAll(pattern)) {
    const line = Number.parseInt(match[1] ?? "1", 10);
    const message = match[2]?.trim() || "Parse error";
    diagnostics.push(toDiagnostic(message, line, 1));
  }

  return diagnostics;
};

export const parseBirdValidationOutput = (
  output: string,
  documentUri: Uri,
): Diagnostic[] => {
  const diagnostics = parseFileLineColumn(output, documentUri.fsPath);
  if (diagnostics.length > 0) {
    return diagnostics;
  }

  return parseParseErrorLine(output);
};
