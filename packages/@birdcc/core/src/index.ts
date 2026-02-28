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

  return {
    symbols,
    references,
    diagnostics,
  };
};

export const buildCoreSnapshot = (text: string): CoreSnapshot => {
  const parsed = parseBirdConfig(text);
  return buildCoreSnapshotFromParsed(parsed);
};
