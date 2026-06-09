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
    | "attribute"
    | "table"
    | "mpls-domain"
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
  value?: string;
  valueRange?: SourceRange;
}

export interface RouterIdDeclaration extends DeclarationBase {
  kind: "router-id";
  value: string;
  valueKind: "ip" | "number" | "from" | "unknown";
  valueRange: SourceRange;
  fromSource?: "routing" | "dynamic";
}

export interface AttributeDeclaration extends DeclarationBase {
  kind: "attribute";
  attributeType: string;
  attributeTypeRange: SourceRange;
  name: string;
  nameRange: SourceRange;
}

export interface TableDeclaration extends DeclarationBase {
  kind: "table";
  tableType:
    | "routing"
    | "ipv4"
    | "ipv6"
    | "ipv4-mpls"
    | "ipv6-mpls"
    | "vpn4"
    | "vpn6"
    | "vpn4-mpls"
    | "vpn6-mpls"
    | "roa4"
    | "roa6"
    | "aspa"
    | "mpls"
    | "eth"
    | "evpn"
    | "neighbor"
    | "ipv6-sadr"
    | "flow4"
    | "flow6"
    | "unknown";
  tableTypeRange: SourceRange;
  name: string;
  nameRange: SourceRange;
  attrsText?: string;
  attrsRange?: SourceRange;
}

export interface MplsDomainDeclaration extends DeclarationBase {
  kind: "mpls-domain";
  name: string;
  nameRange: SourceRange;
  bodyText?: string;
  bodyRange?: SourceRange;
}

interface StatementBase extends SourceRange {
  kind:
    | "local-as"
    | "neighbor"
    | "import"
    | "export"
    | "channel"
    | "static-route"
    | "disabled"
    | "description"
    | "hostname"
    | "vrf"
    | "bgp-timer"
    | "source-address"
    | "bgp-option"
    | "bgp-hop-mode"
    | "scan-time"
    | "learn"
    | "interface";
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
  interface?: string;
  interfaceRange?: SourceRange;
  asn?: string;
  asnRange?: SourceRange;
  port?: string;
  portRange?: SourceRange;
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
  kind:
    | "table"
    | "import"
    | "export"
    | "limit"
    | "debug"
    | "keep-filtered"
    | "preference"
    | "rpki-reload"
    | "domain"
    | "label-range"
    | "label-policy"
    | "gateway"
    | "add-paths"
    | "igp-table"
    | "bgp-channel-option"
    | "other";
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

export interface ChannelPreferenceEntry extends ChannelEntryBase {
  kind: "preference";
  value: string;
  valueRange: SourceRange;
}

export interface ChannelRpkiReloadEntry extends ChannelEntryBase {
  kind: "rpki-reload";
  value: string;
  valueRange: SourceRange;
}

export interface ChannelDomainEntry extends ChannelEntryBase {
  kind: "domain";
  domainName: string;
  domainNameRange: SourceRange;
}

export interface ChannelLabelRangeEntry extends ChannelEntryBase {
  kind: "label-range";
  range: string;
  rangeRange: SourceRange;
}

export interface ChannelLabelPolicyEntry extends ChannelEntryBase {
  kind: "label-policy";
  policy: "static" | "prefix" | "aggregate" | "vrf" | "other";
  policyRange: SourceRange;
}

export interface ChannelGatewayEntry extends ChannelEntryBase {
  kind: "gateway";
  mode: "direct" | "recursive" | "other";
  modeRange: SourceRange;
}

export interface ChannelAddPathsEntry extends ChannelEntryBase {
  kind: "add-paths";
  mode: "rx" | "tx" | "on" | "off" | "other";
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ChannelIgpTableEntry extends ChannelEntryBase {
  kind: "igp-table";
  tableName: string;
  tableNameRange: SourceRange;
}

export interface ChannelBgpOptionEntry extends ChannelEntryBase {
  kind: "bgp-channel-option";
  option: "secondary" | "extended-next-hop" | "import-table" | "export-table";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
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
  | ChannelPreferenceEntry
  | ChannelRpkiReloadEntry
  | ChannelDomainEntry
  | ChannelLabelRangeEntry
  | ChannelLabelPolicyEntry
  | ChannelGatewayEntry
  | ChannelAddPathsEntry
  | ChannelIgpTableEntry
  | ChannelBgpOptionEntry
  | ChannelOtherEntry;

export interface ChannelStatement extends StatementBase {
  kind: "channel";
  channelType:
    | "ipv4"
    | "ipv6"
    | "ipv4-mpls"
    | "ipv6-mpls"
    | "vpn4"
    | "vpn6"
    | "vpn4-mpls"
    | "vpn6-mpls"
    | "roa4"
    | "roa6"
    | "ipv6-sadr"
    | "flow4"
    | "flow6"
    | "mpls"
    | "unknown";
  channelTypeRange: SourceRange;
  entries: ChannelEntry[];
}

export interface StaticRouteStatement extends StatementBase {
  kind: "static-route";
  routeTarget: string;
  routeTargetRange: SourceRange;
  destinationType:
    | "via"
    | "recursive"
    | "drop"
    | "reject"
    | "blackhole"
    | "unreachable"
    | "prohibit"
    | "providers"
    | "transit"
    | "none"
    | "other";
  destinationTypeRange?: SourceRange;
  nextHop?: string;
  nextHopRange?: SourceRange;
  optionsText?: string;
}

export interface DisabledStatement extends StatementBase {
  kind: "disabled";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ProtocolTextStatement extends StatementBase {
  kind: "description" | "hostname";
  value: string;
  valueText: string;
  valueRange: SourceRange;
}

export interface VrfStatement extends StatementBase {
  kind: "vrf";
  mode: "default" | "named";
  name?: string;
  nameText?: string;
  nameRange?: SourceRange;
}

export interface BgpTimerStatement extends StatementBase {
  kind: "bgp-timer";
  option: "hold-time" | "connect-retry-time" | "keepalive-time";
  value: string;
  valueRange: SourceRange;
}

export interface SourceAddressStatement extends StatementBase {
  kind: "source-address";
  address: string;
  addressKind: "ip" | "other";
  addressRange: SourceRange;
}

export interface BgpOptionStatement extends StatementBase {
  kind: "bgp-option";
  option: "rr-client" | "strict-bind" | "passive" | "allow-local-as" | "bfd";
  value?: boolean | string;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface BgpHopModeStatement extends StatementBase {
  kind: "bgp-hop-mode";
  mode: "direct" | "multihop";
  ttl?: string;
  ttlRange?: SourceRange;
}

export interface ScanTimeStatement extends StatementBase {
  kind: "scan-time";
  value: string;
  valueRange: SourceRange;
}

export interface LearnStatement extends StatementBase {
  kind: "learn";
  mode: "on" | "off" | "all";
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ProtocolInterfaceStatement extends StatementBase {
  kind: "interface";
  mode: "single" | "range";
  patterns: string[];
  patternRanges: SourceRange[];
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
  | StaticRouteStatement
  | DisabledStatement
  | ProtocolTextStatement
  | VrfStatement
  | BgpTimerStatement
  | SourceAddressStatement
  | BgpOptionStatement
  | BgpHopModeStatement
  | ScanTimeStatement
  | LearnStatement
  | ProtocolInterfaceStatement
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
  fromTemplate?: string;
  fromTemplateRange?: SourceRange;
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
  | AttributeDeclaration
  | TableDeclaration
  | MplsDomainDeclaration
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
