import { isIP, isIPv4 } from "node:net";
import { parse as parseCidr } from "fast-cidr-tools";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";

export type BirdDiagnosticSeverity = "error" | "warning" | "info";

export interface BirdRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface BirdDiagnostic {
  code: string;
  message: string;
  severity: BirdDiagnosticSeverity;
  source: "parser" | "core" | "linter" | "bird";
  range: BirdRange;
}

export type BirdSymbolKind = "protocol" | "template" | "filter" | "function";

export interface SymbolDefinition {
  kind: BirdSymbolKind;
  name: string;
  line: number;
  column: number;
}

export interface SymbolReference {
  kind: "template";
  name: string;
  line: number;
  column: number;
}

export interface CoreSnapshot {
  symbols: SymbolDefinition[];
  references: SymbolReference[];
  diagnostics: BirdDiagnostic[];
}

const createRange = (line: number, column: number, nameLength = 1): BirdRange => ({
  line,
  column,
  endLine: line,
  endColumn: column + Math.max(nameLength, 1),
});

const declarationToSymbol = (
  declaration: ParsedBirdDocument["program"]["declarations"][number],
): SymbolDefinition | null => {
  if (declaration.kind === "protocol") {
    return {
      kind: "protocol",
      name: declaration.name,
      line: declaration.nameRange.line,
      column: declaration.nameRange.column,
    };
  }

  if (declaration.kind === "template") {
    return {
      kind: "template",
      name: declaration.name,
      line: declaration.nameRange.line,
      column: declaration.nameRange.column,
    };
  }

  if (declaration.kind === "filter") {
    return {
      kind: "filter",
      name: declaration.name,
      line: declaration.nameRange.line,
      column: declaration.nameRange.column,
    };
  }

  if (declaration.kind === "function") {
    return {
      kind: "function",
      name: declaration.name,
      line: declaration.nameRange.line,
      column: declaration.nameRange.column,
    };
  }

  return null;
};

const pushRouterIdDiagnostics = (
  parsed: ParsedBirdDocument,
  diagnostics: BirdDiagnostic[],
): void => {
  for (const declaration of parsed.program.declarations) {
    if (declaration.kind !== "router-id") {
      continue;
    }

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
  }
};

const pushNeighborDiagnostics = (
  parsed: ParsedBirdDocument,
  diagnostics: BirdDiagnostic[],
): void => {
  for (const declaration of parsed.program.declarations) {
    if (declaration.kind !== "protocol") {
      continue;
    }

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
  }
};

const parsePrefixRange = (suffix: string): { min: number; max: number } | null => {
  if (!suffix.startsWith("{") || !suffix.endsWith("}")) {
    return null;
  }

  const inner = suffix.slice(1, -1);
  const commaIndex = inner.indexOf(",");
  if (commaIndex <= 0 || commaIndex >= inner.length - 1) {
    return null;
  }

  const min = Number(inner.slice(0, commaIndex));
  const max = Number(inner.slice(commaIndex + 1));

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return null;
  }

  return { min, max };
};

const isValidPrefixLiteral = (literal: string): boolean => {
  let value = literal.trim();
  if (value.length === 0) {
    return false;
  }

  let range: { min: number; max: number } | null = null;

  if (value.endsWith("+")) {
    value = value.slice(0, -1);
  } else if (value.endsWith("-")) {
    value = value.slice(0, -1);
  } else if (value.endsWith("}")) {
    const braceStart = value.lastIndexOf("{");
    if (braceStart === -1) {
      return false;
    }

    range = parsePrefixRange(value.slice(braceStart));
    if (!range) {
      return false;
    }

    value = value.slice(0, braceStart);
  }

  const slashIndex = value.lastIndexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) {
    return false;
  }

  const ipPart = value.slice(0, slashIndex);
  const prefixPart = value.slice(slashIndex + 1);
  const prefix = Number(prefixPart);

  if (!Number.isInteger(prefix)) {
    return false;
  }

  const version = isIP(ipPart);
  if (version === 0) {
    return false;
  }

  const maxBits = version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > maxBits) {
    return false;
  }

  if (range) {
    if (range.min < prefix || range.min > maxBits || range.max < range.min || range.max > maxBits) {
      return false;
    }
  }

  try {
    void parseCidr(value);
  } catch {
    return false;
  }

  return true;
};

const pushPrefixLiteralDiagnostics = (
  parsed: ParsedBirdDocument,
  diagnostics: BirdDiagnostic[],
): void => {
  for (const declaration of parsed.program.declarations) {
    if (declaration.kind !== "filter" && declaration.kind !== "function") {
      continue;
    }

    if (!Array.isArray(declaration.literals)) {
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
};

/** Builds semantic snapshot from a parsed BIRD document (symbols, references, diagnostics). */
export const buildCoreSnapshotFromParsed = (parsed: ParsedBirdDocument): CoreSnapshot => {
  const symbols: SymbolDefinition[] = [];
  const references: SymbolReference[] = [];
  const diagnostics: BirdDiagnostic[] = [];
  const seenDeclarations = new Map<string, SymbolDefinition>();

  for (const declaration of parsed.program.declarations) {
    const symbol = declarationToSymbol(declaration);
    if (!symbol) {
      continue;
    }

    const key = `${symbol.kind}:${symbol.name.toLowerCase()}`;

    if (seenDeclarations.has(key)) {
      diagnostics.push({
        code: "semantic/duplicate-definition",
        message: `${symbol.kind} '${symbol.name}' is already defined`,
        severity: "error",
        source: "core",
        range: createRange(symbol.line, symbol.column, symbol.name.length),
      });
    } else {
      seenDeclarations.set(key, symbol);
    }

    symbols.push(symbol);

    if (declaration.kind === "protocol" && declaration.fromTemplate) {
      references.push({
        kind: "template",
        name: declaration.fromTemplate,
        line: declaration.fromTemplateRange?.line ?? declaration.line,
        column: declaration.fromTemplateRange?.column ?? declaration.column,
      });
    }
  }

  for (const reference of references) {
    const key = `template:${reference.name.toLowerCase()}`;
    if (!seenDeclarations.has(key)) {
      diagnostics.push({
        code: "semantic/undefined-reference",
        message: `Undefined template reference '${reference.name}'`,
        severity: "error",
        source: "core",
        range: createRange(reference.line, reference.column, reference.name.length),
      });
    }
  }

  pushRouterIdDiagnostics(parsed, diagnostics);
  pushNeighborDiagnostics(parsed, diagnostics);
  pushPrefixLiteralDiagnostics(parsed, diagnostics);

  return {
    symbols,
    references,
    diagnostics,
  };
};

/** Parses and builds semantic snapshot in one async call. */
export const buildCoreSnapshot = async (text: string): Promise<CoreSnapshot> => {
  const parsed = await parseBirdConfig(text);
  return buildCoreSnapshotFromParsed(parsed);
};
