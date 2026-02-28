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

const declarationPatterns: Array<{
  kind: BirdSymbolKind;
  regex: RegExp;
  pickName: (match: RegExpMatchArray) => string;
}> = [
  {
    kind: "protocol",
    regex: /^\s*protocol\s+[A-Za-z_][\w-]*\s+([A-Za-z_][\w-]*)\b/i,
    pickName: (match) => match[1],
  },
  {
    kind: "template",
    regex: /^\s*template\s+[A-Za-z_][\w-]*\s+([A-Za-z_][\w-]*)\b/i,
    pickName: (match) => match[1],
  },
  {
    kind: "filter",
    regex: /^\s*filter\s+([A-Za-z_][\w-]*)\b/i,
    pickName: (match) => match[1],
  },
  {
    kind: "function",
    regex: /^\s*function\s+([A-Za-z_][\w-]*)\b/i,
    pickName: (match) => match[1],
  },
];

const findColumn = (lineText: string, value: string): number => {
  const idx = lineText.indexOf(value);
  return idx >= 0 ? idx + 1 : 1;
};

export const buildCoreSnapshot = (text: string): CoreSnapshot => {
  const symbols: SymbolDefinition[] = [];
  const references: SymbolReference[] = [];
  const diagnostics: BirdDiagnostic[] = [];
  const seenDeclarations = new Map<string, SymbolDefinition>();

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i];
    const lineNumber = i + 1;

    for (const pattern of declarationPatterns) {
      const match = lineText.match(pattern.regex);
      if (!match) {
        continue;
      }

      const name = pattern.pickName(match);
      const column = findColumn(lineText, name);
      const symbol: SymbolDefinition = {
        kind: pattern.kind,
        name,
        line: lineNumber,
        column,
      };
      const key = `${pattern.kind}:${name.toLowerCase()}`;

      if (seenDeclarations.has(key)) {
        diagnostics.push({
          code: "semantic/duplicate-definition",
          message: `${pattern.kind} '${name}' 重复定义`,
          severity: "error",
          source: "core",
          range: createRange(lineNumber, column, name.length),
        });
      } else {
        seenDeclarations.set(key, symbol);
      }

      symbols.push(symbol);
    }

    const fromRegex = /\bfrom\s+([A-Za-z_][\w-]*)\b/gi;
    for (const match of lineText.matchAll(fromRegex)) {
      const name = match[1];
      references.push({
        kind: "template",
        name,
        line: lineNumber,
        column: findColumn(lineText, name),
      });
    }
  }

  for (const reference of references) {
    const key = `template:${reference.name.toLowerCase()}`;
    if (!seenDeclarations.has(key)) {
      diagnostics.push({
        code: "semantic/undefined-reference",
        message: `未定义的模板引用 '${reference.name}'`,
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
