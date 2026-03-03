import { isIP } from "node:net";
import { parseBirdConfig, type FunctionDeclaration } from "@birdcc/parser";

export type BirdHintType =
  | "int"
  | "bool"
  | "string"
  | "ip"
  | "prefix"
  | "unknown";

export interface FunctionReturnDetail {
  readonly line: number;
  readonly expression: string;
  readonly inferredType: BirdHintType;
}

export interface FunctionReturnHint {
  readonly declaration: FunctionDeclaration;
  readonly declaredReturnType?: string;
  readonly inferredReturnType: BirdHintType;
  readonly returnDetails: readonly FunctionReturnDetail[];
}

const BOOLEAN_OPERATORS = [
  "&&",
  "||",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "~",
  "!~",
] as const;

const prefixLiteralPattern = /^([0-9a-fA-F:.]+)\s*\/\s*([0-9]{1,3})$/;
const returnExpressionPattern = /\breturn\s+([^;]+)\s*;/gu;

interface SourceRangeLike {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

const buildLineOffsets = (source: string): readonly number[] => {
  const offsets: number[] = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
};

const toOffset = (
  source: string,
  lineOffsets: readonly number[],
  line: number,
  column: number,
): number => {
  const lineIndex = Math.max(line - 1, 0);
  const lineStart = lineOffsets[lineIndex] ?? 0;
  const lineEnd =
    lineIndex + 1 < lineOffsets.length
      ? (lineOffsets[lineIndex + 1] ?? source.length)
      : source.length;
  const offset = lineStart + Math.max(column - 1, 0);
  return Math.max(lineStart, Math.min(offset, lineEnd));
};

const sliceSourceRange = (
  source: string,
  lineOffsets: readonly number[],
  range: SourceRangeLike,
): string => {
  const start = toOffset(source, lineOffsets, range.line, range.column);
  const end = toOffset(source, lineOffsets, range.endLine, range.endColumn);
  return source.slice(start, end);
};

const escapeRegexToken = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const containsBooleanOperator = (value: string): boolean => {
  for (const operator of BOOLEAN_OPERATORS) {
    if (operator === "<" || operator === ">" || operator === "~") {
      const pattern = new RegExp(`\\s${escapeRegexToken(operator)}\\s`, "u");
      if (pattern.test(value)) {
        return true;
      }
      continue;
    }

    if (value.includes(operator)) {
      return true;
    }
  }

  return false;
};

const inferLiteralType = (expression: string): BirdHintType => {
  const value = expression.trim();
  if (value.length === 0) {
    return "unknown";
  }

  const lowered = value.toLowerCase();
  if (lowered === "true" || lowered === "false") {
    return "bool";
  }

  if (/^[+-]?[0-9]+$/.test(value)) {
    return "int";
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return "string";
  }

  if (/\.[A-Za-z_][A-Za-z0-9_]*\s*\(/u.test(value) && value.includes(".mask")) {
    return "prefix";
  }

  if (/\.[A-Za-z_][A-Za-z0-9_]*/u.test(value) && value.includes(".len")) {
    return "int";
  }

  const prefixMatch = value.match(prefixLiteralPattern);
  if (prefixMatch) {
    const host = prefixMatch[1];
    const mask = Number.parseInt(prefixMatch[2], 10);
    const ipVersion = isIP(host);
    if ((ipVersion === 4 && mask <= 32) || (ipVersion === 6 && mask <= 128)) {
      return "prefix";
    }
  }

  if (isIP(value) !== 0) {
    return "ip";
  }

  if (containsBooleanOperator(value) || value.startsWith("defined(")) {
    return "bool";
  }

  return "unknown";
};

const collectDeclaredReturnType = (
  source: string,
  lineOffsets: readonly number[],
  declaration: FunctionDeclaration,
): string | undefined => {
  const declarationText = sliceSourceRange(source, lineOffsets, declaration);
  const headerText = declarationText.split("{")[0] ?? declarationText;
  const match = headerText.match(/->\s*([A-Za-z_][A-Za-z0-9_]*)/u);
  return match?.[1];
};

const inferFunctionReturnType = (
  source: string,
  lineOffsets: readonly number[],
  declaration: FunctionDeclaration,
): {
  inferredReturnType: BirdHintType;
  returnDetails: readonly FunctionReturnDetail[];
} => {
  const statementDetails = declaration.statements
    .filter(
      (statement): statement is SourceRangeLike & { kind: "return" } =>
        statement.kind === "return",
    )
    .map((statement) => {
      const statementText = sliceSourceRange(source, lineOffsets, statement);
      const expression = statementText
        .replace(/^\s*return/u, "")
        .replace(/;\s*$/u, "")
        .trim();

      if (!expression) {
        return null;
      }

      return {
        line: statement.line,
        expression,
        inferredType: inferLiteralType(expression),
      } satisfies FunctionReturnDetail;
    })
    .filter((detail): detail is FunctionReturnDetail => detail !== null);

  let returnDetails = statementDetails;
  if (returnDetails.length === 0) {
    const declarationText = sliceSourceRange(source, lineOffsets, declaration);
    returnDetails = Array.from(
      declarationText.matchAll(returnExpressionPattern),
    ).map((match) => {
      const expression = (match[1] ?? "").trim();
      const prefix = declarationText.slice(0, match.index ?? 0);
      const lineOffset = prefix.split(/\r?\n/u).length - 1;

      return {
        line: declaration.line + Math.max(lineOffset, 0),
        expression,
        inferredType: inferLiteralType(expression),
      } satisfies FunctionReturnDetail;
    });
  }

  if (returnDetails.length === 0) {
    return { inferredReturnType: "unknown", returnDetails };
  }

  const inferredTypes = new Set(
    returnDetails.map((detail) => detail.inferredType).filter(Boolean),
  );

  if (inferredTypes.size === 1) {
    return {
      inferredReturnType: returnDetails[0]?.inferredType ?? "unknown",
      returnDetails,
    };
  }

  inferredTypes.delete("unknown");
  if (inferredTypes.size === 1) {
    return {
      inferredReturnType:
        (Array.from(inferredTypes)[0] as BirdHintType | undefined) ?? "unknown",
      returnDetails,
    };
  }

  return { inferredReturnType: "unknown", returnDetails };
};

export const collectFunctionReturnHints = async (
  source: string,
): Promise<readonly FunctionReturnHint[]> => {
  const lineOffsets = buildLineOffsets(source);
  const parsed = await parseBirdConfig(source);

  return parsed.program.declarations
    .filter(
      (declaration): declaration is FunctionDeclaration =>
        declaration.kind === "function",
    )
    .map((declaration) => {
      const returnSummary = inferFunctionReturnType(
        source,
        lineOffsets,
        declaration,
      );

      return {
        declaration,
        declaredReturnType: collectDeclaredReturnType(
          source,
          lineOffsets,
          declaration,
        ),
        inferredReturnType: returnSummary.inferredReturnType,
        returnDetails: returnSummary.returnDetails,
      } satisfies FunctionReturnHint;
    });
};
