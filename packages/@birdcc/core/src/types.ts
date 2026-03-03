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
  uri?: string;
}

export type BirdSymbolKind =
  | "protocol"
  | "template"
  | "filter"
  | "function"
  | "table";

export interface SymbolDefinition {
  kind: BirdSymbolKind;
  name: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  uri: string;
}

export interface SymbolReference {
  kind: "template";
  name: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  uri: string;
}

export interface SymbolTable {
  definitions: SymbolDefinition[];
  references: SymbolReference[];
}

export type TypeValue = "int" | "bool" | "string" | "ip" | "prefix" | "unknown";

export interface TypeCheckOptions {
  uri?: string;
  strictUnknownExpression?: boolean;
}

export interface CoreSnapshot {
  symbols: SymbolDefinition[];
  references: SymbolReference[];
  symbolTable: SymbolTable;
  typeDiagnostics: BirdDiagnostic[];
  diagnostics: BirdDiagnostic[];
}

export interface CrossFileDocumentInput {
  uri: string;
  text: string;
}

export interface CrossFileResolutionStats {
  loadedFromMemory: number;
  loadedFromFileSystem: number;
  skippedByDepth: number;
  skippedByFileLimit: number;
  missingIncludes: number;
  parsedCacheHits: number;
  parsedCacheMisses: number;
}

export interface CrossFileResolveOptions {
  entryUri: string;
  documents?: CrossFileDocumentInput[];
  maxDepth?: number;
  maxFiles?: number;
  includeSearchPaths?: string[];
  loadFromFileSystem?: boolean;
  workspaceRootUri?: string;
  allowIncludeOutsideWorkspace?: boolean;
  typeCheck?: TypeCheckOptions;
  readFileText?: (uri: string) => Promise<string>;
}

export interface CrossFileResolutionResult {
  entryUri: string;
  visitedUris: string[];
  symbolTable: SymbolTable;
  snapshots: Record<string, CoreSnapshot>;
  documents: Record<string, string>;
  diagnostics: BirdDiagnostic[];
  stats: CrossFileResolutionStats;
}
