import { isIP } from "node:net";
import type { ParsedBirdDocument } from "@birdcc/parser";
import type { BirdDiagnostic, SymbolTable, TypeCheckOptions, TypeValue } from "./types.js";
import { isValidPrefixLiteral } from "./prefix.js";

const VARIABLE_DECLARE_PATTERN =
  /^\s*(?:var\s+)?(int|bool|string|ip|prefix)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.+?))?\s*;?\s*$/i;
const VARIABLE_ASSIGN_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;?\s*$/;

const inferValueType = (rawValue: string, variableTypes: Map<string, TypeValue>): TypeValue => {
  const value = rawValue.trim();
  if (value.length === 0) {
    return "unknown";
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
