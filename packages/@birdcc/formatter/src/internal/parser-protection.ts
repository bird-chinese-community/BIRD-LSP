import {
  type FilterBodyStatement,
  parseBirdConfig,
  type ProtocolStatement,
} from "@birdcc/parser";

const collectStatementRanges = (
  statements: FilterBodyStatement[],
): Array<{ line: number; endLine: number }> => {
  return statements.map((statement) => ({
    line: statement.line,
    endLine: statement.endLine,
  }));
};

const collectProtocolProtectedLines = (
  statements: ProtocolStatement[],
): Array<{ line: number; endLine: number }> => {
  return statements
    .filter((statement) => {
      if (statement.kind === "other") {
        return true;
      }

      if (statement.kind === "import" || statement.kind === "export") {
        return statement.mode === "where";
      }

      if (statement.kind === "channel") {
        return statement.entries.some((entry) => {
          if (entry.kind === "other") {
            return true;
          }
          if (entry.kind === "import" || entry.kind === "export") {
            return entry.mode === "where";
          }
          return false;
        });
      }

      return false;
    })
    .map((statement) => ({
      line: statement.line,
      endLine: statement.endLine,
    }));
};

export const collectParserProtectedLinesFromParsed = (
  parsed: Awaited<ReturnType<typeof parseBirdConfig>>,
): Set<number> => {
  const protectedLines = new Set<number>();

  for (const issue of parsed.issues) {
    for (let line = issue.line; line <= issue.endLine; line += 1) {
      protectedLines.add(line);
    }
  }

  for (const declaration of parsed.program.declarations) {
    const protectedRanges: Array<{ line: number; endLine: number }> = [];

    if (declaration.kind === "filter" || declaration.kind === "function") {
      protectedRanges.push(...collectStatementRanges(declaration.statements));
    }

    if (declaration.kind === "protocol") {
      protectedRanges.push(
        ...collectProtocolProtectedLines(declaration.statements),
      );
    }

    for (const range of protectedRanges) {
      for (let line = range.line; line <= range.endLine; line += 1) {
        protectedLines.add(line);
      }
    }
  }

  return protectedLines;
};
