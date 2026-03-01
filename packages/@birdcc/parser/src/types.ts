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
    | "syntax/missing-semicolon"
    | "syntax/unbalanced-brace"
    | "parser/missing-symbol"
    | "parser/syntax-error"
    | "parser/runtime-error";
  message: string;
}

interface DeclarationBase extends SourceRange {
  kind:
    | "include"
    | "define"
    | "router-id"
    | "table"
    | "protocol"
    | "template"
    | "filter"
    | "function";
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

export interface RouterIdDeclaration extends DeclarationBase {
  kind: "router-id";
  value: string;
  valueKind: "ip" | "number" | "from" | "unknown";
  valueRange: SourceRange;
  fromSource?: "routing" | "dynamic";
}

export interface TableDeclaration extends DeclarationBase {
  kind: "table";
  tableType:
    | "routing"
    | "ipv4"
    | "ipv6"
    | "vpn4"
    | "vpn6"
    | "roa4"
    | "roa6"
    | "flow4"
    | "flow6"
    | "unknown";
  tableTypeRange: SourceRange;
  name: string;
  nameRange: SourceRange;
  attrsText?: string;
  attrsRange?: SourceRange;
}

interface StatementBase extends SourceRange {
  kind: "local-as" | "neighbor" | "import" | "export" | "channel";
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
  addressKind: "ip" | "other";
  asn?: string;
  asnRange?: SourceRange;
}

export interface ImportStatement extends StatementBase {
  kind: "import";
  mode: "all" | "none" | "filter" | "where" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  whereExpression?: string;
  whereExpressionRange?: SourceRange;
  clauseText?: string;
}

export interface ExportStatement extends StatementBase {
  kind: "export";
  mode: "all" | "none" | "filter" | "where" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  whereExpression?: string;
  whereExpressionRange?: SourceRange;
  clauseText?: string;
}

interface ChannelEntryBase extends SourceRange {
  kind: "table" | "import" | "export" | "limit" | "debug" | "keep-filtered" | "other";
}

export interface ChannelTableEntry extends ChannelEntryBase {
  kind: "table";
  tableName: string;
  tableNameRange: SourceRange;
}

export interface ChannelImportEntry extends ChannelEntryBase {
  kind: "import";
  mode: "all" | "none" | "filter" | "where" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  whereExpression?: string;
  whereExpressionRange?: SourceRange;
  clauseText?: string;
}

export interface ChannelExportEntry extends ChannelEntryBase {
  kind: "export";
  mode: "all" | "none" | "filter" | "where" | "other";
  filterName?: string;
  filterNameRange?: SourceRange;
  whereExpression?: string;
  whereExpressionRange?: SourceRange;
  clauseText?: string;
}

export interface ChannelLimitEntry extends ChannelEntryBase {
  kind: "limit";
  direction: "import" | "receive" | "export";
  value: string;
  valueRange: SourceRange;
  action?: string;
  actionRange?: SourceRange;
}

export interface ChannelDebugEntry extends ChannelEntryBase {
  kind: "debug";
  clauseText: string;
}

export interface ChannelKeepFilteredEntry extends ChannelEntryBase {
  kind: "keep-filtered";
  value: string;
  valueRange: SourceRange;
}

export interface ChannelOtherEntry extends ChannelEntryBase {
  kind: "other";
  text: string;
}

export type ChannelEntry =
  | ChannelTableEntry
  | ChannelImportEntry
  | ChannelExportEntry
  | ChannelLimitEntry
  | ChannelDebugEntry
  | ChannelKeepFilteredEntry
  | ChannelOtherEntry;

export interface ChannelStatement extends StatementBase {
  kind: "channel";
  channelType:
    | "ipv4"
    | "ipv6"
    | "vpn4"
    | "vpn6"
    | "roa4"
    | "roa6"
    | "flow4"
    | "flow6"
    | "mpls"
    | "unknown";
  channelTypeRange: SourceRange;
  entries: ChannelEntry[];
}

export interface OtherProtocolStatement extends SourceRange {
  kind: "other";
  text: string;
}

export type ProtocolStatement =
  | LocalAsStatement
  | NeighborStatement
  | ImportStatement
  | ExportStatement
  | ChannelStatement
  | OtherProtocolStatement;

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

export interface ExtractedLiteral extends SourceRange {
  kind: "ip" | "prefix";
  value: string;
}

export interface MatchExpression extends SourceRange {
  operator: "~";
  left: string;
  right: string;
}

interface ControlStatementBase extends SourceRange {
  kind: "if" | "accept" | "reject" | "return" | "case" | "expression" | "other";
}

export interface IfStatement extends ControlStatementBase {
  kind: "if";
  conditionText?: string;
  thenText: string;
  elseText?: string;
}

export interface AcceptStatement extends ControlStatementBase {
  kind: "accept";
}

export interface RejectStatement extends ControlStatementBase {
  kind: "reject";
}

export interface ReturnStatement extends ControlStatementBase {
  kind: "return";
  valueText?: string;
}

export interface CaseStatement extends ControlStatementBase {
  kind: "case";
  subjectText?: string;
}

export interface ExpressionStatement extends ControlStatementBase {
  kind: "expression";
  expressionText: string;
}

export interface OtherStatement extends ControlStatementBase {
  kind: "other";
  text: string;
}

export type FilterBodyStatement =
  | IfStatement
  | AcceptStatement
  | RejectStatement
  | ReturnStatement
  | CaseStatement
  | ExpressionStatement
  | OtherStatement;

export interface FilterDeclaration extends DeclarationBase {
  kind: "filter";
  name: string;
  nameRange: SourceRange;
  statements: FilterBodyStatement[];
  literals: ExtractedLiteral[];
  matches: MatchExpression[];
}

export interface FunctionDeclaration extends DeclarationBase {
  kind: "function";
  name: string;
  nameRange: SourceRange;
  statements: FilterBodyStatement[];
  literals: ExtractedLiteral[];
  matches: MatchExpression[];
}

export type BirdDeclaration =
  | IncludeDeclaration
  | DefineDeclaration
  | RouterIdDeclaration
  | TableDeclaration
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
