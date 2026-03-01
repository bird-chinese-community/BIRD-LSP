/** 1-based source range used across parser/core/linter diagnostics. */
export interface SourceRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/** Parser issue emitted from Tree-sitter syntax recovery or runtime initialization. */
export interface ParseIssue extends SourceRange {
  code:
    | "parser/unbalanced-brace"
    | "parser/missing-symbol"
    | "parser/syntax-error"
    | "parser/runtime-error";
  message: string;
}

interface DeclarationBase extends SourceRange {
  kind: "include" | "define" | "protocol" | "template" | "filter" | "function";
}

export interface IncludeDeclaration extends DeclarationBase {
  kind: "include";
  path: string;
  pathRange: SourceRange;
}

export interface DefineDeclaration extends DeclarationBase {
  kind: "define";
  name: string;
  nameRange: SourceRange;
}

interface StatementBase extends SourceRange {
  kind: "local-as" | "neighbor" | "import" | "export";
}

export interface LocalAsStatement extends StatementBase {
  kind: "local-as";
  asn: string;
  asnRange: SourceRange;
}

export interface NeighborStatement extends StatementBase {
  kind: "neighbor";
  address: string;
  addressRange: SourceRange;
  asn?: string;
  asnRange?: SourceRange;
}

export interface ImportStatement extends StatementBase {
  kind: "import";
  mode: "all" | "filter" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  clauseText?: string;
}

export interface ExportStatement extends StatementBase {
  kind: "export";
  mode: "all" | "filter" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  clauseText?: string;
}

export type ProtocolStatement =
  | LocalAsStatement
  | NeighborStatement
  | ImportStatement
  | ExportStatement;

export interface ProtocolDeclaration extends DeclarationBase {
  kind: "protocol";
  protocolType: string;
  protocolTypeRange: SourceRange;
  name: string;
  nameRange: SourceRange;
  fromTemplate?: string;
  fromTemplateRange?: SourceRange;
  statements: ProtocolStatement[];
}

export interface TemplateDeclaration extends DeclarationBase {
  kind: "template";
  templateType: string;
  templateTypeRange: SourceRange;
  name: string;
  nameRange: SourceRange;
}

export interface FilterDeclaration extends DeclarationBase {
  kind: "filter";
  name: string;
  nameRange: SourceRange;
}

export interface FunctionDeclaration extends DeclarationBase {
  kind: "function";
  name: string;
  nameRange: SourceRange;
}

export type BirdDeclaration =
  | IncludeDeclaration
  | DefineDeclaration
  | ProtocolDeclaration
  | TemplateDeclaration
  | FilterDeclaration
  | FunctionDeclaration;

export interface BirdProgram {
  kind: "program";
  declarations: BirdDeclaration[];
}

/** Result of parsing one BIRD config document. */
export interface ParsedBirdDocument {
  program: BirdProgram;
  issues: ParseIssue[];
}
