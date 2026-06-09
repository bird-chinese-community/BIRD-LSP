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

interface TableOptionEntryBase extends SourceRange {
  kind:
    | "trie"
    | "sorted"
    | "debug"
    | "cork-threshold"
    | "thread-group"
    | "gc-threshold"
    | "gc-period"
    | "settle-time"
    | "other";
}

export interface TableTrieEntry extends TableOptionEntryBase {
  kind: "trie" | "sorted";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface TableDebugEntry extends TableOptionEntryBase {
  kind: "debug";
  clauseText: string;
  clauseRange: SourceRange;
}

export interface TableCorkThresholdEntry extends TableOptionEntryBase {
  kind: "cork-threshold";
  low: string;
  high: string;
  lowRange: SourceRange;
  highRange: SourceRange;
}

export interface TableThreadGroupEntry extends TableOptionEntryBase {
  kind: "thread-group";
  name: string;
  nameRange: SourceRange;
}

export interface TableGcEntry extends TableOptionEntryBase {
  kind: "gc-threshold" | "gc-period";
  value: string;
  valueRange: SourceRange;
}

export interface TableSettleTimeEntry extends TableOptionEntryBase {
  kind: "settle-time";
  option: "min" | "max" | "export" | "route-refresh-export" | "digest";
  value: string;
  valueRange: SourceRange;
}

export interface TableOtherEntry extends TableOptionEntryBase {
  kind: "other";
  text: string;
}

export type TableOptionEntry =
  | TableTrieEntry
  | TableDebugEntry
  | TableCorkThresholdEntry
  | TableThreadGroupEntry
  | TableGcEntry
  | TableSettleTimeEntry
  | TableOtherEntry;

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
  bodyText?: string;
  bodyRange?: SourceRange;
  entries: TableOptionEntry[];
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
    | "restart-time"
    | "debug"
    | "mrtdump"
    | "protocol-router-id"
    | "thread-group"
    | "bgp-timer"
    | "source-address"
    | "bgp-option"
    | "bgp-hop-mode"
    | "mrt-option"
    | "aggregator-option"
    | "bmp-option"
    | "scan-time"
    | "learn"
    | "interface"
    | "rpki-remote"
    | "rpki-port"
    | "rpki-local-address"
    | "rpki-transport"
    | "rpki-timer"
    | "rpki-ignore-max-length"
    | "rpki-version";
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

export interface ProtocolRestartTimeStatement extends StatementBase {
  kind: "restart-time";
  value: string;
  valueRange: SourceRange;
}

export interface ProtocolDebugStatement extends StatementBase {
  kind: "debug";
  clauseText: string;
  clauseRange: SourceRange;
}

export interface ProtocolMrtdumpStatement extends StatementBase {
  kind: "mrtdump";
  maskText: string;
  maskRange: SourceRange;
}

export interface ProtocolRouterIdStatement extends StatementBase {
  kind: "protocol-router-id";
  value: string;
  valueRange: SourceRange;
}

export interface ProtocolThreadGroupStatement extends StatementBase {
  kind: "thread-group";
  name: string;
  nameRange: SourceRange;
}

export interface BgpTimerStatement extends StatementBase {
  kind: "bgp-timer";
  option:
    | "hold-time"
    | "min-hold-time"
    | "startup-hold-time"
    | "connect-delay-time"
    | "connect-retry-time"
    | "keepalive-time"
    | "min-keepalive-time"
    | "send-hold-time"
    | "error-forget-time"
    | "error-wait-time";
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
  option:
    | "rr-client"
    | "strict-bind"
    | "passive"
    | "allow-local-as"
    | "bfd"
    | "ttl-security"
    | "check-link"
    | "enforce-first-as"
    | "local-role"
    | "require-roles"
    | "disable-rx"
    | "tx-size-warning";
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

export interface MrtOptionStatement extends StatementBase {
  kind: "mrt-option";
  option: "table" | "filename" | "period" | "always-add-path";
  value?: boolean | string;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface AggregatorOptionStatement extends StatementBase {
  kind: "aggregator-option";
  option: "table" | "peer-table" | "aggregate-on" | "merge-by";
  value?: string;
  valueText?: string;
  valueRange?: SourceRange;
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface BmpOptionStatement extends StatementBase {
  kind: "bmp-option";
  option:
    | "local-address"
    | "station-address"
    | "system-description"
    | "system-name"
    | "monitoring-rib-in-pre-policy"
    | "monitoring-rib-in-post-policy"
    | "tx-buffer-limit";
  value: boolean | string;
  valueText?: string;
  valueRange: SourceRange;
  port?: string;
  portRange?: SourceRange;
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

export interface RpkiRemoteStatement extends StatementBase {
  kind: "rpki-remote";
  address: string;
  addressKind: "ip" | "hostname" | "other";
  addressRange: SourceRange;
  port?: string;
  portRange?: SourceRange;
}

export interface RpkiPortStatement extends StatementBase {
  kind: "rpki-port";
  port: string;
  portRange: SourceRange;
}

export interface RpkiLocalAddressStatement extends StatementBase {
  kind: "rpki-local-address";
  address: string;
  addressKind: "ip" | "other";
  addressRange: SourceRange;
}

export interface RpkiTransportStatement extends StatementBase {
  kind: "rpki-transport";
  transport: "tcp" | "ssh" | "other";
  transportRange: SourceRange;
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface RpkiTimerStatement extends StatementBase {
  kind: "rpki-timer";
  option: "refresh" | "retry" | "expire";
  keep: boolean;
  value: string;
  valueRange: SourceRange;
}

export interface RpkiIgnoreMaxLengthStatement extends StatementBase {
  kind: "rpki-ignore-max-length";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface RpkiVersionStatement extends StatementBase {
  kind: "rpki-version";
  option: "min" | "max";
  value: string;
  valueRange: SourceRange;
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
  | ProtocolRestartTimeStatement
  | ProtocolDebugStatement
  | ProtocolMrtdumpStatement
  | ProtocolRouterIdStatement
  | ProtocolThreadGroupStatement
  | BgpTimerStatement
  | SourceAddressStatement
  | BgpOptionStatement
  | BgpHopModeStatement
  | MrtOptionStatement
  | AggregatorOptionStatement
  | BmpOptionStatement
  | ScanTimeStatement
  | LearnStatement
  | ProtocolInterfaceStatement
  | RpkiRemoteStatement
  | RpkiPortStatement
  | RpkiLocalAddressStatement
  | RpkiTransportStatement
  | RpkiTimerStatement
  | RpkiIgnoreMaxLengthStatement
  | RpkiVersionStatement
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

export interface FunctionCallExpression extends SourceRange {
  name: string;
  nameRange: SourceRange;
  argumentsText: string;
}

interface ControlStatementBase extends SourceRange {
  kind:
    | "if"
    | "accept"
    | "reject"
    | "return"
    | "case"
    | "print"
    | "unset"
    | "assignment"
    | "expression"
    | "other";
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

export interface PrintStatement extends ControlStatementBase {
  kind: "print";
  newline: boolean;
  argumentsText: string;
}

export interface UnsetStatement extends ControlStatementBase {
  kind: "unset";
  attributeText: string;
}

export interface AssignmentStatement extends ControlStatementBase {
  kind: "assignment";
  targetText: string;
  valueText: string;
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
  | PrintStatement
  | UnsetStatement
  | AssignmentStatement
  | ExpressionStatement
  | OtherStatement;

export interface FilterDeclaration extends DeclarationBase {
  kind: "filter";
  name: string;
  nameRange: SourceRange;
  statements: FilterBodyStatement[];
  literals: ExtractedLiteral[];
  matches: MatchExpression[];
  calls: FunctionCallExpression[];
}

export interface FunctionDeclaration extends DeclarationBase {
  kind: "function";
  name: string;
  nameRange: SourceRange;
  statements: FilterBodyStatement[];
  literals: ExtractedLiteral[];
  matches: MatchExpression[];
  calls: FunctionCallExpression[];
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
