import type { BirdDiagnostic } from "./types.js";

const toBirdDiagnostic = (
  message: string,
  line: number,
  column: number,
): BirdDiagnostic => ({
  code: "bird-validation",
  message,
  severity: "error",
  source: "bird",
  range: {
    line,
    column,
    endLine: line,
    endColumn: column + 1,
  },
});

const parseFileLineColumn = (
  output: string,
  currentFile: string,
): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const pattern = /^(.+?):(\d+):(?:(\d+):)?\s*(.+)$/gm;

  for (const match of output.matchAll(pattern)) {
    const file = match[1]?.trim();
    const line = Number.parseInt(match[2] ?? "1", 10);
    const column = match[3] ? Number.parseInt(match[3], 10) : 1;
    const message = match[4]?.trim() || "Validation error";

    if (file && file !== currentFile) {
      continue;
    }

    diagnostics.push(toBirdDiagnostic(message, line, column));
  }

  return diagnostics;
};

const parseParseErrorLine = (output: string): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const pattern = /Parse error.*line\s+(\d+)\s*:\s*(.+)$/gim;

  for (const match of output.matchAll(pattern)) {
    const line = Number.parseInt(match[1] ?? "1", 10);
    const message = match[2]?.trim() || "Parse error";
    diagnostics.push(toBirdDiagnostic(message, line, 1));
  }

  return diagnostics;
};

export const parseBirdValidationOutput = (
  output: string,
  filePath: string,
): BirdDiagnostic[] => {
  const diagnostics = parseFileLineColumn(output, filePath);
  if (diagnostics.length > 0) {
    return diagnostics;
  }

  return parseParseErrorLine(output);
};
