import { isIP } from "node:net";
import type { BirdDiagnostic, BirdDiagnosticSeverity, CoreSnapshot } from "@birdcc/core";
import type {
  BirdDeclaration,
  FilterBodyStatement,
  FilterDeclaration,
  FunctionDeclaration,
  ParsedBirdDocument,
  ProtocolDeclaration,
  ProtocolStatement,
  SourceRange,
  TableDeclaration,
  TemplateDeclaration,
} from "@birdcc/parser";
import { RULE_SEVERITY, type RuleCode } from "./catalog.js";

export interface RuleContext {
  text: string;
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
}

export type BirdRule = (context: RuleContext) => BirdDiagnostic[];

export const normalizeClause = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

export const createRuleDiagnostic = (
  code: RuleCode,
  message: string,
  range: SourceRange,
  source: BirdDiagnostic["source"] = "linter",
): BirdDiagnostic => ({
  code,
  message,
  severity: RULE_SEVERITY[code],
  source,
  range: {
    line: range.line,
    column: range.column,
    endLine: range.endLine,
    endColumn: range.endColumn,
  },
});

export const diagnosticDedupKey = (diagnostic: BirdDiagnostic): string =>
  [
    diagnostic.code,
    diagnostic.message,
    diagnostic.range.line,
    diagnostic.range.column,
    diagnostic.range.endLine,
    diagnostic.range.endColumn,
  ].join(":");

export const pushUniqueDiagnostic = (
  diagnostics: BirdDiagnostic[],
  seen: Set<string>,
  diagnostic: BirdDiagnostic,
): void => {
  const key = diagnosticDedupKey(diagnostic);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  diagnostics.push(diagnostic);
};

export const withSeverity = (
  code: RuleCode,
  diagnostic: Omit<BirdDiagnostic, "severity" | "code">,
): BirdDiagnostic => ({
  ...diagnostic,
  code,
  severity: RULE_SEVERITY[code],
});

export const protocolDeclarations = (parsed: ParsedBirdDocument): ProtocolDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is ProtocolDeclaration => declaration.kind === "protocol",
  );

export const templateDeclarations = (parsed: ParsedBirdDocument): TemplateDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is TemplateDeclaration => declaration.kind === "template",
  );

export const tableDeclarations = (parsed: ParsedBirdDocument): TableDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is TableDeclaration => declaration.kind === "table",
  );

export const filterDeclarations = (parsed: ParsedBirdDocument): FilterDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is FilterDeclaration => declaration.kind === "filter",
  );

export const functionDeclarations = (parsed: ParsedBirdDocument): FunctionDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is FunctionDeclaration => declaration.kind === "function",
  );

export const filterAndFunctionDeclarations = (
  parsed: ParsedBirdDocument,
): Array<FilterDeclaration | FunctionDeclaration> =>
  parsed.program.declarations.filter(
    (declaration): declaration is FilterDeclaration | FunctionDeclaration =>
      declaration.kind === "filter" || declaration.kind === "function",
  );

export const routerIdDeclarations = (parsed: ParsedBirdDocument): BirdDeclaration[] =>
  parsed.program.declarations.filter((declaration) => declaration.kind === "router-id");

export const isProtocolType = (declaration: ProtocolDeclaration, expected: string): boolean =>
  declaration.protocolType.toLowerCase() === expected;

export const protocolOtherStatements = (declaration: ProtocolDeclaration): ProtocolStatement[] =>
  declaration.statements.filter((statement) => statement.kind === "other");

export const protocolOtherTextEntries = (
  declaration: ProtocolDeclaration,
): Array<{ text: string; range: SourceRange }> => {
  const entries: Array<{ text: string; range: SourceRange }> = [];

  for (const statement of declaration.statements) {
    if (statement.kind === "other") {
      entries.push({ text: statement.text, range: statement });
      continue;
    }

    if (statement.kind !== "channel") {
      continue;
    }

    for (const entry of statement.entries) {
      if (entry.kind !== "other") {
        continue;
      }

      entries.push({ text: entry.text, range: entry });
    }
  }

  return entries;
};

export const channelOtherEntries = (
  declaration: ProtocolDeclaration,
): Array<{ channelType: string; text: string; range: SourceRange }> => {
  const entries: Array<{ channelType: string; text: string; range: SourceRange }> = [];

  for (const statement of declaration.statements) {
    if (statement.kind !== "channel") {
      continue;
    }

    for (const entry of statement.entries) {
      if (entry.kind !== "other") {
        continue;
      }

      entries.push({
        channelType: statement.channelType,
        text: entry.text,
        range: entry,
      });
    }
  }

  return entries;
};

export const numericValue = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const extractFirstNumberAfterKeyword = (text: string, keyword: string): number | null => {
  const pattern = new RegExp(`${keyword}\\s+(-?\\d+)`, "i");
  const matched = text.match(pattern);
  return numericValue(matched?.[1]);
};

export const hasBooleanValue = (value: string): boolean =>
  ["on", "off", "yes", "no", "true", "false", "enabled", "disabled"].includes(
    normalizeClause(value),
  );

export const extractFunctionCalls = (text: string): string[] => {
  const names: string[] = [];
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const ignored = new Set(["if", "switch", "print", "defined"]);
  let current = pattern.exec(text);

  while (current) {
    const name = current[1] ?? "";
    const matchIndex = current.index ?? -1;
    const isMethodCall = matchIndex > 0 && text[matchIndex - 1] === ".";
    if (name.length > 0 && !ignored.has(name.toLowerCase()) && !isMethodCall) {
      names.push(name);
    }
    current = pattern.exec(text);
  }

  return names;
};

export const scalarTypeOfExpression = (
  expressionText: string,
): "int" | "bool" | "string" | "ip" | "prefix" | "unknown" => {
  const text = expressionText.trim();
  if (/^-?\d+$/.test(text)) {
    return "int";
  }
  if (/^(true|false|yes|no|on|off)$/i.test(text)) {
    return "bool";
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return "string";
  }
  if (text.includes("/") && isPrefixLiteral(text)) {
    return "prefix";
  }
  if (isIP(text) !== 0) {
    return "ip";
  }
  return "unknown";
};

export const isPrefixLiteral = (value: string): boolean => {
  const [address, lengthText] = value.split("/");
  if (!address || !lengthText) {
    return false;
  }

  const length = numericValue(lengthText);
  if (length === null || length < 0 || length > 128) {
    return false;
  }

  const family = isIP(address.trim());
  if (family === 4) {
    return length <= 32;
  }

  if (family === 6) {
    return length <= 128;
  }

  return false;
};

export const eachFilterBodyExpression = (
  parsed: ParsedBirdDocument,
): Array<{ statement: FilterBodyStatement; declarationName: string }> => {
  const list: Array<{ statement: FilterBodyStatement; declarationName: string }> = [];

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      list.push({ statement, declarationName: declaration.name });
    }
  }

  return list;
};

export const findTemplateByName = (
  parsed: ParsedBirdDocument,
  templateName: string,
): TemplateDeclaration | undefined => {
  const lowered = templateName.toLowerCase();
  return templateDeclarations(parsed).find((item) => item.name.toLowerCase() === lowered);
};

export const hasSymbolKind = (
  core: CoreSnapshot,
  kind: "protocol" | "template" | "filter" | "function" | "table",
  name: string,
): boolean => {
  const lowered = name.toLowerCase();
  return core.symbols.some(
    (symbol) => symbol.kind === kind && symbol.name.toLowerCase() === lowered,
  );
};

export const createProtocolDiagnostic = (
  code: RuleCode,
  message: string,
  declaration: ProtocolDeclaration,
  severity?: BirdDiagnosticSeverity,
): BirdDiagnostic => ({
  code,
  message,
  severity: severity ?? RULE_SEVERITY[code],
  source: "linter",
  range: {
    line: declaration.nameRange.line,
    column: declaration.nameRange.column,
    endLine: declaration.nameRange.endLine,
    endColumn: declaration.nameRange.endColumn,
  },
});
