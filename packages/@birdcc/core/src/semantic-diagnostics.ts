import { isIP, isIPv4 } from "node:net";
import type { ParsedBirdDocument } from "@birdcc/parser";
import type { BirdDiagnostic } from "./types.js";
import { isValidPrefixLiteral } from "./prefix.js";

const buildDefinesMap = (
  declarations: ParsedBirdDocument["program"]["declarations"],
): Map<string, string> => {
  const defines = new Map<string, string>();
  for (const decl of declarations) {
    if (
      decl.kind === "define" &&
      decl.name.length > 0 &&
      decl.value !== undefined
    ) {
      defines.set(decl.name, decl.value);
    }
  }
  return defines;
};

const RESOLVED_RID_KEYWORDS = new Set(["from routing", "from dynamic"]);

const validateRouterIdValue = (
  value: string,
  range: { line: number; column: number; endLine: number; endColumn: number },
  diagnostics: BirdDiagnostic[],
): void => {
  if (isIPv4(value)) {
    return;
  }

  if (RESOLVED_RID_KEYWORDS.has(value.toLowerCase())) {
    return;
  }

  if (/^\d+$/.test(value)) {
    return;
  }

  diagnostics.push({
    code: "semantic/invalid-router-id",
    message: `Invalid router id value '${value}'${isIP(value) !== 0 ? " (expected IPv4 address)" : ""}`,
    severity: "error",
    source: "core",
    range,
  });
};

export const collectSemanticDiagnostics = (
  parsed: ParsedBirdDocument,
): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const defines = buildDefinesMap(parsed.program.declarations);

  for (const declaration of parsed.program.declarations) {
    if (declaration.kind === "router-id") {
      const range = declaration.valueRange;

      if (declaration.valueKind === "ip" && !isIPv4(declaration.value)) {
        diagnostics.push({
          code: "semantic/invalid-router-id",
          message: `Invalid router id '${declaration.value}' (expected IPv4 address)`,
          severity: "error",
          source: "core",
          range,
        });
        continue;
      }

      if (declaration.valueKind === "unknown" && declaration.value.length > 0) {
        const lowered = declaration.value.toLowerCase();
        if (RESOLVED_RID_KEYWORDS.has(lowered)) {
          continue;
        }

        // Resolve the identifier against defined constants
        const definedValue = defines.get(declaration.value);
        if (definedValue !== undefined) {
          validateRouterIdValue(definedValue, range, diagnostics);
          continue;
        }

        diagnostics.push({
          code: "semantic/invalid-router-id",
          message: `Invalid router id value '${declaration.value}'`,
          severity: "error",
          source: "core",
          range,
        });
      }

      continue;
    }

    if (declaration.kind === "protocol") {
      for (const statement of declaration.statements) {
        if (statement.kind !== "neighbor" || statement.addressKind !== "ip") {
          continue;
        }

        if (isIP(statement.address) === 0) {
          diagnostics.push({
            code: "semantic/invalid-neighbor-address",
            message: `Invalid neighbor address '${statement.address}'`,
            severity: "error",
            source: "core",
            range: statement.addressRange,
          });
        }
      }

      continue;
    }

    if (declaration.kind !== "filter" && declaration.kind !== "function") {
      continue;
    }

    for (const literal of declaration.literals) {
      if (literal.kind !== "prefix") {
        continue;
      }

      if (isValidPrefixLiteral(literal.value)) {
        continue;
      }

      diagnostics.push({
        code: "semantic/invalid-cidr",
        message: `Invalid CIDR/prefix literal '${literal.value}'`,
        severity: "error",
        source: "core",
        range: {
          line: literal.line,
          column: literal.column,
          endLine: literal.endLine,
          endColumn: literal.endColumn,
        },
      });
    }
  }

  return diagnostics;
};
