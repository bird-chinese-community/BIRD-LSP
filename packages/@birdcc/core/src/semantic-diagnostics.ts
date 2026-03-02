import { isIP, isIPv4 } from "node:net";
import type { ParsedBirdDocument } from "@birdcc/parser";
import type { BirdDiagnostic } from "./types.js";
import { isValidPrefixLiteral } from "./prefix.js";

export const collectSemanticDiagnostics = (
  parsed: ParsedBirdDocument,
): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];

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

      if (
        declaration.valueKind === "unknown" &&
        declaration.value.length > 0 &&
        declaration.value.toLowerCase() !== "from routing" &&
        declaration.value.toLowerCase() !== "from dynamic"
      ) {
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
