import { isIP } from "node:net";
import type { ParsedBirdDocument } from "@birdcc/parser";
import type {
  BirdDiagnostic,
  SymbolTable,
  TypeCheckOptions,
  TypeValue,
} from "./types.js";
import { isValidPrefixLiteral } from "./prefix.js";

const VARIABLE_DECLARE_PATTERN =
  /^\s*(?:var\s+)?(int|bool|string|ip|prefix|pair|quad|ec|lc|bgppath|clist|eclist|lclist)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.+?))?\s*;?\s*$/i;
const VARIABLE_ASSIGN_PATTERN =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;?\s*$/;
const MAX_TYPE_INFER_DEPTH = 64;
const MAX_TYPE_EXPRESSION_LENGTH = 4096;
const SET_LITERAL_MAX_ITEMS = 256;
const BUILTIN_ASSIGNABLE_ATTRIBUTES = new Set([
  "gw",
  "ifname",
  "onlink",
  "dest",
  "krt_prefsrc",
  "bgp_local_pref",
  "bgp_next_hop",
  "bgp_next_hop_ll",
  "preference",
  "validated",
]);
const SUPPORTED_DECLARED_TYPES = new Set<TypeValue>([
  "int",
  "bool",
  "string",
  "ip",
  "prefix",
]);

const normalizeDeclaredType = (value: string): TypeValue => {
  const lowered = value.toLowerCase();
  return SUPPORTED_DECLARED_TYPES.has(lowered as TypeValue)
    ? (lowered as TypeValue)
    : "unknown";
};

const trimSingleEnclosingParentheses = (value: string): string => {
  const current = value.trim();
  if (!current.startsWith("(") || !current.endsWith(")")) {
    return current;
  }

  let depth = 0;
  for (let index = 0; index < current.length; index += 1) {
    const char = current[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) {
        return current;
      }

      if (depth === 0 && index < current.length - 1) {
        return current;
      }
    }
  }

  return depth === 0 ? current.slice(1, -1).trim() : current;
};

const isQuotedLiteral = (value: string, quote: "'" | '"'): boolean => {
  if (!value.startsWith(quote) || !value.endsWith(quote) || value.length < 2) {
    return false;
  }

  let escaping = false;
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === quote) {
      return false;
    }
  }

  return true;
};

const splitTopLevelBinary = (
  value: string,
  operators: string[],
): { left: string; operator: string; right: string } | null => {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaping = false;

  let lastMatch: { left: string; operator: string; right: string } | null =
    null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      if (depth > 0) {
        depth -= 1;
      }
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    for (const operator of operators) {
      if (!value.startsWith(operator, index)) {
        continue;
      }

      const left = value.slice(0, index).trim();
      const right = value.slice(index + operator.length).trim();

      if (left.length === 0 || right.length === 0) {
        continue;
      }

      lastMatch = { left, operator, right };
    }
  }

  return lastMatch;
};

const splitTopLevelList = (value: string): string[] => {
  const items: string[] = [];
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaping = false;
  let segmentStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    switch (char) {
      case "(":
        depthParen += 1;
        continue;
      case ")":
        if (depthParen > 0) {
          depthParen -= 1;
        }
        continue;
      case "[":
        depthBracket += 1;
        continue;
      case "]":
        if (depthBracket > 0) {
          depthBracket -= 1;
        }
        continue;
      case "{":
        depthBrace += 1;
        continue;
      case "}":
        if (depthBrace > 0) {
          depthBrace -= 1;
        }
        continue;
      case ",":
        if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
          items.push(value.slice(segmentStart, index).trim());
          segmentStart = index + 1;
        }
        continue;
      default:
        break;
    }
  }

  items.push(value.slice(segmentStart).trim());
  return items;
};

const inferSetLiteralElementType = (
  rawValue: string,
  variableTypes: Map<string, TypeValue>,
  depth: number,
): TypeValue => {
  if (!rawValue.startsWith("[") || !rawValue.endsWith("]")) {
    return "unknown";
  }

  const inner = rawValue.slice(1, -1).trim();
  if (inner.length === 0) {
    return "unknown";
  }

  const items = splitTopLevelList(inner);
  if (items.length > SET_LITERAL_MAX_ITEMS) {
    return "unknown";
  }

  let elementType: TypeValue | null = null;

  for (const item of items) {
    if (item.length === 0) {
      return "unknown";
    }

    const inferredItemType = inferValueType(item, variableTypes, depth + 1);
    if (inferredItemType === "unknown" || inferredItemType === "bool") {
      return "unknown";
    }

    if (elementType && inferredItemType !== elementType) {
      return "unknown";
    }

    elementType = inferredItemType;
  }

  return elementType ?? "unknown";
};

const inferValueType = (
  rawValue: string,
  variableTypes: Map<string, TypeValue>,
  depth = 0,
): TypeValue => {
  if (
    depth > MAX_TYPE_INFER_DEPTH ||
    rawValue.length > MAX_TYPE_EXPRESSION_LENGTH
  ) {
    return "unknown";
  }

  const value = rawValue.trim();
  if (value.length === 0) {
    return "unknown";
  }

  const stripped = trimSingleEnclosingParentheses(value);
  if (stripped !== value) {
    return inferValueType(stripped, variableTypes, depth + 1);
  }

  if (value.startsWith("!")) {
    const operandType = inferValueType(
      value.slice(1),
      variableTypes,
      depth + 1,
    );
    return operandType === "bool" ? "bool" : "unknown";
  }

  if (value.startsWith("-") || value.startsWith("+")) {
    const operandType = inferValueType(
      value.slice(1),
      variableTypes,
      depth + 1,
    );
    if (operandType === "int") {
      return "int";
    }
  }

  const lowered = value.toLowerCase();

  if (lowered === "true" || lowered === "false") {
    return "bool";
  }

  if (/^\d+$/.test(value)) {
    return "int";
  }

  if (isQuotedLiteral(value, '"') || isQuotedLiteral(value, "'")) {
    return "string";
  }

  if (isIP(value) !== 0) {
    return "ip";
  }

  if (isValidPrefixLiteral(value)) {
    return "prefix";
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return variableTypes.get(value) ?? "unknown";
  }

  const logicalOrExpression = splitTopLevelBinary(value, ["||"]);
  if (logicalOrExpression) {
    const leftType = inferValueType(
      logicalOrExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      logicalOrExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType === "bool" && rightType === "bool" ? "bool" : "unknown";
  }

  const logicalAndExpression = splitTopLevelBinary(value, ["&&"]);
  if (logicalAndExpression) {
    const leftType = inferValueType(
      logicalAndExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      logicalAndExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType === "bool" && rightType === "bool" ? "bool" : "unknown";
  }

  const equalityExpression = splitTopLevelBinary(value, ["==", "!="]);
  if (equalityExpression) {
    const leftType = inferValueType(
      equalityExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      equalityExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType !== "unknown" &&
      rightType !== "unknown" &&
      leftType === rightType
      ? "bool"
      : "unknown";
  }

  const relationalExpression = splitTopLevelBinary(value, [
    "<=",
    ">=",
    "<",
    ">",
  ]);
  if (relationalExpression) {
    const leftType = inferValueType(
      relationalExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      relationalExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType === "int" && rightType === "int" ? "bool" : "unknown";
  }

  const matchExpression = splitTopLevelBinary(value, ["!~", "~"]);
  if (matchExpression) {
    const leftType = inferValueType(
      matchExpression.left,
      variableTypes,
      depth + 1,
    );
    if (leftType === "unknown") {
      return "unknown";
    }

    const rightSetElementType = inferSetLiteralElementType(
      matchExpression.right,
      variableTypes,
      depth + 1,
    );
    if (rightSetElementType !== "unknown") {
      return leftType === rightSetElementType ? "bool" : "unknown";
    }

    return "unknown";
  }

  const additiveExpression = splitTopLevelBinary(value, ["+", "-"]);
  if (additiveExpression) {
    const leftType = inferValueType(
      additiveExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      additiveExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType === "int" && rightType === "int" ? "int" : "unknown";
  }

  const multiplicativeExpression = splitTopLevelBinary(value, ["*", "/"]);
  if (multiplicativeExpression) {
    const leftType = inferValueType(
      multiplicativeExpression.left,
      variableTypes,
      depth + 1,
    );
    const rightType = inferValueType(
      multiplicativeExpression.right,
      variableTypes,
      depth + 1,
    );
    return leftType === "int" && rightType === "int" ? "int" : "unknown";
  }

  return "unknown";
};

const createTypeMismatchDiagnostic = (
  expectedType: TypeValue,
  actualType: TypeValue,
  line: number,
  column: number,
  endLine: number,
  endColumn: number,
  variableName: string,
): BirdDiagnostic => ({
  code: "type/mismatch",
  message: `Type mismatch for '${variableName}': expected ${expectedType}, got ${actualType}`,
  severity: "error",
  source: "core",
  range: { line, column, endLine, endColumn },
});

export const checkTypes = (
  program: ParsedBirdDocument["program"],
  // Reserved for upcoming phases (cross-declaration and cross-file type rules).
  _symbolTable: SymbolTable,
  options: TypeCheckOptions = {},
): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const strictUnknownExpression = options.strictUnknownExpression ?? false;

  for (const declaration of program.declarations) {
    if (declaration.kind !== "filter" && declaration.kind !== "function") {
      continue;
    }

    const variableTypes = new Map<string, TypeValue>();

    for (const statement of declaration.statements) {
      if (statement.kind !== "expression") {
        if (
          strictUnknownExpression &&
          statement.kind === "return" &&
          statement.valueText
        ) {
          const inferredType = inferValueType(
            statement.valueText,
            variableTypes,
          );
          if (inferredType === "unknown") {
            diagnostics.push({
              code: "type/unknown-expression",
              message: `Cannot infer type for return expression '${statement.valueText}'`,
              severity: "warning",
              source: "core",
              range: {
                line: statement.line,
                column: statement.column,
                endLine: statement.endLine,
                endColumn: statement.endColumn,
              },
            });
          }
        }

        continue;
      }

      const expression = statement.expressionText.trim();
      const declarationMatch = expression.match(VARIABLE_DECLARE_PATTERN);
      if (declarationMatch) {
        const declaredType = normalizeDeclaredType(declarationMatch[1] ?? "");
        const variableName = declarationMatch[2] ?? "";
        const initializer = declarationMatch[3]?.trim();

        if (variableName.length > 0) {
          variableTypes.set(variableName, declaredType);
        }

        if (initializer) {
          const inferredType = inferValueType(initializer, variableTypes);
          if (inferredType !== "unknown" && inferredType !== declaredType) {
            diagnostics.push(
              createTypeMismatchDiagnostic(
                declaredType,
                inferredType,
                statement.line,
                statement.column,
                statement.endLine,
                statement.endColumn,
                variableName,
              ),
            );
          }
        }

        continue;
      }

      const assignMatch = expression.match(VARIABLE_ASSIGN_PATTERN);
      if (!assignMatch) {
        continue;
      }

      const variableName = assignMatch[1] ?? "";
      const assignedValue = assignMatch[2] ?? "";
      const expectedType = variableTypes.get(variableName);

      if (!expectedType) {
        if (BUILTIN_ASSIGNABLE_ATTRIBUTES.has(variableName.toLowerCase())) {
          continue;
        }

        diagnostics.push({
          code: "type/undefined-variable",
          message: `Assignment to undefined variable '${variableName}'`,
          severity: "error",
          source: "core",
          range: {
            line: statement.line,
            column: statement.column,
            endLine: statement.endLine,
            endColumn: statement.endColumn,
          },
        });
        continue;
      }

      const inferredType = inferValueType(assignedValue, variableTypes);
      if (expectedType === "unknown") {
        continue;
      }

      if (inferredType !== "unknown" && inferredType !== expectedType) {
        diagnostics.push(
          createTypeMismatchDiagnostic(
            expectedType,
            inferredType,
            statement.line,
            statement.column,
            statement.endLine,
            statement.endColumn,
            variableName,
          ),
        );
      }
    }
  }

  return diagnostics;
};
