import { isIP } from "node:net";
import {
  parseBirdConfig,
  type FunctionDeclaration,
  type ReturnStatement,
} from "@birdcc/parser";

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

  if (value.includes(".mask(")) {
    return "prefix";
  }

  if (value.includes(".len")) {
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

  if (
    BOOLEAN_OPERATORS.some((operator) => value.includes(operator)) ||
    value.startsWith("defined(")
  ) {
    return "bool";
  }

  return "unknown";
};

const collectDeclaredReturnType = (
  source: string,
  declaration: FunctionDeclaration,
): string | undefined => {
  const declarationLine = source.split(/\r?\n/u)[declaration.line - 1];
  if (!declarationLine) {
    return undefined;
  }

  const arrowIndex = declarationLine.indexOf("->");
  if (arrowIndex === -1) {
    return undefined;
  }

  const beforeBody = declarationLine.slice(arrowIndex + 2).split("{")[0];
  const returnType = beforeBody.trim().split(/\s+/u)[0];
  if (!returnType) {
    return undefined;
  }

  return returnType;
};

const inferFunctionReturnType = (
  declaration: FunctionDeclaration,
): {
  inferredReturnType: BirdHintType;
  returnDetails: readonly FunctionReturnDetail[];
} => {
  const returnDetails = declaration.statements
    .filter(
      (statement): statement is ReturnStatement =>
        statement.kind === "return" && Boolean(statement.valueText),
    )
    .map((statement) => {
      const expression = statement.valueText?.trim() ?? "";
      return {
        line: statement.line,
        expression,
        inferredType: inferLiteralType(expression),
      } satisfies FunctionReturnDetail;
    });

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
  const parsed = await parseBirdConfig(source);

  return parsed.program.declarations
    .filter(
      (declaration): declaration is FunctionDeclaration =>
        declaration.kind === "function",
    )
    .map((declaration) => {
      const returnSummary = inferFunctionReturnType(declaration);

      return {
        declaration,
        declaredReturnType: collectDeclaredReturnType(source, declaration),
        inferredReturnType: returnSummary.inferredReturnType,
        returnDetails: returnSummary.returnDetails,
      } satisfies FunctionReturnHint;
    });
};
