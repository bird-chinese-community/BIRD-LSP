import { isIP } from "node:net";
import type { ParsedBirdDocument } from "@birdcc/parser";
import type { BirdDiagnostic, SymbolTable, TypeCheckOptions, TypeValue } from "./types.js";
import { isValidPrefixLiteral } from "./prefix.js";

const VARIABLE_DECLARE_PATTERN =
  /^\s*(?:var\s+)?(int|bool|string|ip|prefix)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.+?))?\s*;?\s*$/i;
const VARIABLE_ASSIGN_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;?\s*$/;

const trimEnclosingParentheses = (value: string): string => {
  let current = value.trim();

  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0;
    let valid = true;

    for (let index = 0; index < current.length; index += 1) {
      const char = current[index];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth < 0) {
          valid = false;
          break;
        }

        if (depth === 0 && index < current.length - 1) {
          valid = false;
          break;
        }
      }
    }

    if (!valid || depth !== 0) {
      break;
    }

    current = current.slice(1, -1).trim();
  }

  return current;
};

const splitTopLevelBinary = (
  value: string,
  operators: string[],
): { left: string; operator: string; right: string } | null => {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaping = false;

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

      return { left, operator, right };
    }
  }

  return null;
};

const inferValueType = (rawValue: string, variableTypes: Map<string, TypeValue>): TypeValue => {
  const value = trimEnclosingParentheses(rawValue);
  if (value.length === 0) {
    return "unknown";
  }

  if (value.startsWith("!")) {
    const operandType = inferValueType(value.slice(1), variableTypes);
    return operandType === "bool" ? "bool" : "unknown";
  }

  const booleanExpression = splitTopLevelBinary(value, ["||", "&&"]);
  if (booleanExpression) {
    const leftType = inferValueType(booleanExpression.left, variableTypes);
    const rightType = inferValueType(booleanExpression.right, variableTypes);
    return leftType === "bool" && rightType === "bool" ? "bool" : "unknown";
  }

  const comparisonExpression = splitTopLevelBinary(value, ["==", "!=", "<=", ">=", "<", ">"]);
  if (comparisonExpression) {
    const leftType = inferValueType(comparisonExpression.left, variableTypes);
    const rightType = inferValueType(comparisonExpression.right, variableTypes);

    if (
      comparisonExpression.operator === "<" ||
      comparisonExpression.operator === ">" ||
      comparisonExpression.operator === "<=" ||
      comparisonExpression.operator === ">="
    ) {
      return leftType === "int" && rightType === "int" ? "bool" : "unknown";
    }

    return leftType !== "unknown" && rightType !== "unknown" && leftType === rightType
      ? "bool"
      : "unknown";
  }

  const additiveExpression = splitTopLevelBinary(value, ["+", "-"]);
  if (additiveExpression) {
    const leftType = inferValueType(additiveExpression.left, variableTypes);
    const rightType = inferValueType(additiveExpression.right, variableTypes);
    return leftType === "int" && rightType === "int" ? "int" : "unknown";
  }

  const multiplicativeExpression = splitTopLevelBinary(value, ["*", "/"]);
  if (multiplicativeExpression) {
    const leftType = inferValueType(multiplicativeExpression.left, variableTypes);
    const rightType = inferValueType(multiplicativeExpression.right, variableTypes);
    return leftType === "int" && rightType === "int" ? "int" : "unknown";
  }

  const lowered = value.toLowerCase();

  if (lowered === "true" || lowered === "false") {
    return "bool";
  }

  if (/^\d+$/.test(value)) {
    return "int";
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
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
        if (strictUnknownExpression && statement.kind === "return" && statement.valueText) {
          const inferredType = inferValueType(statement.valueText, variableTypes);
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
        const declaredType = (declarationMatch[1] ?? "unknown").toLowerCase() as TypeValue;
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
