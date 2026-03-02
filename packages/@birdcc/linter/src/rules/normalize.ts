import type { BirdDiagnostic } from "@birdcc/core";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { isRuleCode, type RuleCode, RULE_SEVERITY } from "./catalog.js";

const CORE_CODE_MAP: Record<string, RuleCode> = {
  "semantic/duplicate-definition": "sym/duplicate",
  "semantic/undefined-reference": "sym/undefined",
  "semantic/circular-template": "cfg/circular-template",
  "type/mismatch": "type/mismatch",
  "type/undefined-variable": "sym/variable-scope",
  "type/unknown-expression": "cfg/incompatible-type",
  "semantic/invalid-router-id": "cfg/incompatible-type",
  "semantic/invalid-neighbor-address": "cfg/incompatible-type",
  "semantic/invalid-cidr": "net/invalid-prefix-length",
  "semantic/missing-include": "sym/undefined",
};

const PARSER_TO_CFG_SYNTAX = new Set([
  "syntax/missing-semicolon",
  "syntax/unbalanced-brace",
  "parser/syntax-error",
  "parser/missing-symbol",
  "parser/runtime-error",
]);

const normalizeCode = (code: string): RuleCode => {
  if (isRuleCode(code)) {
    return code;
  }

  if (code in CORE_CODE_MAP) {
    return CORE_CODE_MAP[code] as RuleCode;
  }

  if (PARSER_TO_CFG_SYNTAX.has(code)) {
    return "cfg/syntax-error";
  }

  return "cfg/incompatible-type";
};

const normalizeMessage = (
  code: string,
  mappedCode: RuleCode,
  message: string,
): string => {
  if (code === mappedCode) {
    return message;
  }

  return `[${code}] ${message}`;
};

const toNormalizedDiagnostic = (
  diagnostic: BirdDiagnostic,
  fallbackUri?: string,
): BirdDiagnostic => {
  const mappedCode = normalizeCode(diagnostic.code);
  return {
    ...diagnostic,
    code: mappedCode,
    severity: RULE_SEVERITY[mappedCode],
    message: normalizeMessage(diagnostic.code, mappedCode, diagnostic.message),
    uri: diagnostic.uri ?? fallbackUri,
  };
};

export const normalizeBaseDiagnostics = (
  parsed: ParsedBirdDocument,
  coreDiagnostics: BirdDiagnostic[],
  options: { uri?: string } = {},
): BirdDiagnostic[] => {
  const parserDiagnostics: BirdDiagnostic[] = parsed.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: "error",
    source: "parser",
    uri: options.uri,
    range: {
      line: issue.line,
      column: issue.column,
      endLine: issue.endLine,
      endColumn: issue.endColumn,
    },
  }));

  return [...parserDiagnostics, ...coreDiagnostics].map((diagnostic) =>
    toNormalizedDiagnostic(diagnostic, options.uri),
  );
};
