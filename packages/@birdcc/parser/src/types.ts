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
    | "graceful-restart-wait"
    | "hostname-override"
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

export interface GracefulRestartWaitDeclaration extends DeclarationBase {
  kind: "graceful-restart-wait";
  value: string;
  valueRange: SourceRange;
}

export interface HostnameOverrideDeclaration extends DeclarationBase {
  kind: "hostname-override";
  value: string;
  valueText: string;
  valueRange: SourceRange;
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
    | "pipe-option"
    | "pipe-import-in"
    | "static-option"
    | "static-igp-table"
    | "bgp-option"
    | "bgp-capability"
    | "bgp-authentication"
    | "bgp-password"
    | "bgp-setkey"
    | "bgp-hop-mode"
    | "mrt-option"
    | "aggregator-option"
    | "bmp-option"
    | "bfd-option"
    | "bfd-profile"
    | "bfd-neighbor"
    | "vpn-option"
    | "evpn-encapsulation"
    | "evpn-vlan"
    | "bridge-option"
    | "ospf-option"
    | "ospf-area"
    | "babel-option"
    | "babel-interface"
    | "radv-interface"
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
    | "bgp-next-hop-mode"
    | "bgp-aigp"
    | "bgp-channel-cost"
    | "bgp-export-settle-time"
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
  option:
    | "secondary"
    | "extended-next-hop"
    | "import-table"
    | "export-table"
    | "mandatory"
    | "validate";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ChannelBgpNextHopModeEntry extends ChannelEntryBase {
  kind: "bgp-next-hop-mode";
  option: "self" | "keep";
  mode: "on" | "off" | "ibgp" | "ebgp" | "other";
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ChannelBgpAigpEntry extends ChannelEntryBase {
  kind: "bgp-aigp";
  enabled: boolean;
  originate?: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface ChannelBgpCostEntry extends ChannelEntryBase {
  kind: "bgp-channel-cost";
  value: string;
  valueRange: SourceRange;
}

export interface ChannelBgpExportSettleTimeEntry extends ChannelEntryBase {
  kind: "bgp-export-settle-time";
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
  | ChannelPreferenceEntry
  | ChannelRpkiReloadEntry
  | ChannelDomainEntry
  | ChannelLabelRangeEntry
  | ChannelLabelPolicyEntry
  | ChannelGatewayEntry
  | ChannelAddPathsEntry
  | ChannelIgpTableEntry
  | ChannelBgpOptionEntry
  | ChannelBgpNextHopModeEntry
  | ChannelBgpAigpEntry
  | ChannelBgpCostEntry
  | ChannelBgpExportSettleTimeEntry
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

export interface PipeOptionStatement extends StatementBase {
  kind: "pipe-option";
  option: "peer-table" | "max-generation";
  value: string;
  valueRange: SourceRange;
}

export interface PipeImportInStatement extends StatementBase {
  kind: "pipe-import-in";
  network: string;
  networkRange: SourceRange;
  mode: "all" | "none" | "filter" | "where" | "other";
  clauseText?: string;
}

export interface StaticOptionStatement extends StatementBase {
  kind: "static-option";
  option: "check-link";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface StaticIgpTableStatement extends StatementBase {
  kind: "static-igp-table";
  tableName: string;
  tableNameRange: SourceRange;
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

export interface BgpCapabilityStatement extends StatementBase {
  kind: "bgp-capability";
  mode: "enable" | "require" | "advertise" | "capabilities";
  option:
    | "route-refresh"
    | "enhanced-route-refresh"
    | "as4"
    | "extended-messages"
    | "hostname"
    | "graceful-restart"
    | "long-lived-graceful-restart"
    | "all";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface BgpAuthenticationStatement extends StatementBase {
  kind: "bgp-authentication";
  authType: "none" | "md5" | "ao" | "other";
  authTypeRange: SourceRange;
}

export interface BgpPasswordStatement extends StatementBase {
  kind: "bgp-password";
  value: string;
  valueText: string;
  valueRange: SourceRange;
}

export interface BgpSetkeyStatement extends StatementBase {
  kind: "bgp-setkey";
  value: boolean;
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

export interface BfdOptionStatement extends StatementBase {
  kind: "bfd-option";
  option:
    | "accept"
    | "strict-bind"
    | "zero-udp6-checksum-rx"
    | "express-thread-group";
  families?: ("ipv4" | "ipv6")[];
  sessionTypes?: ("direct" | "multihop")[];
  value?: boolean;
  valueText?: string;
  valueRange?: SourceRange;
  name?: string;
  nameRange?: SourceRange;
}

interface BfdProfileEntryBase extends SourceRange {
  kind:
    | "timer"
    | "multiplier"
    | "passive"
    | "graceful"
    | "authentication"
    | "password"
    | "other";
}

export interface BfdTimerEntry extends BfdProfileEntryBase {
  kind: "timer";
  option:
    | "interval"
    | "min-rx-interval"
    | "min-tx-interval"
    | "idle-tx-interval";
  value: string;
  valueRange: SourceRange;
}

export interface BfdMultiplierEntry extends BfdProfileEntryBase {
  kind: "multiplier";
  value: string;
  valueRange: SourceRange;
}

export interface BfdPassiveEntry extends BfdProfileEntryBase {
  kind: "passive";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface BfdGracefulEntry extends BfdProfileEntryBase {
  kind: "graceful";
}

export interface BfdAuthenticationEntry extends BfdProfileEntryBase {
  kind: "authentication";
  authType: string;
  authTypeRange: SourceRange;
}

export interface BfdPasswordEntry extends BfdProfileEntryBase {
  kind: "password";
  value: string;
  valueText: string;
  valueRange: SourceRange;
}

export interface BfdOtherEntry extends BfdProfileEntryBase {
  kind: "other";
  text: string;
}

export type BfdProfileEntry =
  | BfdTimerEntry
  | BfdMultiplierEntry
  | BfdPassiveEntry
  | BfdGracefulEntry
  | BfdAuthenticationEntry
  | BfdPasswordEntry
  | BfdOtherEntry;

export interface BfdProfileStatement extends StatementBase {
  kind: "bfd-profile";
  profileType: "interface" | "multihop";
  patterns?: string[];
  patternRanges?: SourceRange[];
  entries: BfdProfileEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface BfdNeighborStatement extends StatementBase {
  kind: "bfd-neighbor";
  address: string;
  addressKind: "ip" | "other";
  addressRange: SourceRange;
  interface?: string;
  interfaceSyntax?: "percent" | "dev";
  interfaceRange?: SourceRange;
  localAddress?: string;
  localAddressKind?: "ip" | "other";
  localAddressRange?: SourceRange;
  multihop?: boolean;
  multihopText?: string;
  multihopRange?: SourceRange;
}

export interface VpnOptionStatement extends StatementBase {
  kind: "vpn-option";
  option:
    | "rd"
    | "route-distinguisher"
    | "import-target"
    | "export-target"
    | "route-target"
    | "vni"
    | "vid"
    | "tag";
  value: string;
  valueRange: SourceRange;
}

interface EvpnEncapsulationEntryBase extends SourceRange {
  kind: "tunnel-device" | "router-address" | "default" | "other";
}

export interface EvpnTunnelDeviceEntry extends EvpnEncapsulationEntryBase {
  kind: "tunnel-device";
  value: string;
  valueText: string;
  valueRange: SourceRange;
}

export interface EvpnRouterAddressEntry extends EvpnEncapsulationEntryBase {
  kind: "router-address";
  address: string;
  addressKind: "ip" | "other";
  addressRange: SourceRange;
}

export interface EvpnDefaultEntry extends EvpnEncapsulationEntryBase {
  kind: "default";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface EvpnEncapsulationOtherEntry extends EvpnEncapsulationEntryBase {
  kind: "other";
  text: string;
}

export type EvpnEncapsulationEntry =
  | EvpnTunnelDeviceEntry
  | EvpnRouterAddressEntry
  | EvpnDefaultEntry
  | EvpnEncapsulationOtherEntry;

export interface EvpnEncapsulationStatement extends StatementBase {
  kind: "evpn-encapsulation";
  encapsulation: "vxlan" | "other";
  encapsulationText: string;
  encapsulationRange: SourceRange;
  entries: EvpnEncapsulationEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

interface EvpnVlanEntryBase extends SourceRange {
  kind: "range" | "vni" | "vid" | "other";
}

export interface EvpnVlanValueEntry extends EvpnVlanEntryBase {
  kind: "range" | "vni" | "vid";
  value: string;
  valueRange: SourceRange;
}

export interface EvpnVlanOtherEntry extends EvpnVlanEntryBase {
  kind: "other";
  text: string;
}

export type EvpnVlanEntry = EvpnVlanValueEntry | EvpnVlanOtherEntry;

export interface EvpnVlanStatement extends StatementBase {
  kind: "evpn-vlan";
  id: string;
  idRange: SourceRange;
  entries: EvpnVlanEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface BridgeOptionStatement extends StatementBase {
  kind: "bridge-option";
  option: "bridge-device" | "vlan-filtering";
  value: boolean | string;
  valueText?: string;
  valueRange: SourceRange;
}

export interface OspfOptionStatement extends StatementBase {
  kind: "ospf-option";
  option:
    | "rfc1583compat"
    | "rfc5838"
    | "vpn-pe"
    | "stub-router"
    | "graceful-restart"
    | "graceful-restart-aware"
    | "graceful-restart-time"
    | "ecmp"
    | "merge-external"
    | "tick"
    | "instance-id";
  value?: boolean | string;
  valueText?: string;
  valueRange?: SourceRange;
  limit?: string;
  limitRange?: SourceRange;
}

interface OspfAreaEntryBase extends SourceRange {
  kind:
    | "stub"
    | "nssa"
    | "summary"
    | "default-nssa"
    | "default-cost"
    | "default-cost2"
    | "stub-cost"
    | "translator"
    | "translator-stability"
    | "networks"
    | "external"
    | "stubnet"
    | "interface"
    | "other";
}

export interface OspfAreaBoolEntry extends OspfAreaEntryBase {
  kind: "stub" | "nssa" | "summary" | "default-nssa" | "translator";
  value?: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface OspfAreaValueEntry extends OspfAreaEntryBase {
  kind: "default-cost" | "default-cost2" | "stub-cost" | "translator-stability";
  value: string;
  valueRange: SourceRange;
}

export interface OspfAreaPrefixListItem extends SourceRange {
  prefix: string;
  prefixRange: SourceRange;
  hidden?: boolean;
  hiddenRange?: SourceRange;
  tag?: string;
  tagRange?: SourceRange;
}

export interface OspfAreaPrefixListEntry extends OspfAreaEntryBase {
  kind: "networks" | "external";
  entries: OspfAreaPrefixListItem[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface OspfAreaStubnetBoolEntry extends SourceRange {
  kind: "hidden" | "summary";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface OspfAreaStubnetCostEntry extends SourceRange {
  kind: "cost";
  value: string;
  valueRange: SourceRange;
}

export interface OspfAreaStubnetOtherEntry extends SourceRange {
  kind: "other";
  text: string;
}

export type OspfAreaStubnetEntry =
  | OspfAreaStubnetBoolEntry
  | OspfAreaStubnetCostEntry
  | OspfAreaStubnetOtherEntry;

export interface OspfAreaStubnetEntryStatement extends OspfAreaEntryBase {
  kind: "stubnet";
  prefix: string;
  prefixRange: SourceRange;
  entries: OspfAreaStubnetEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

interface OspfAreaInterfaceEntryBase extends SourceRange {
  kind:
    | "cost"
    | "timer"
    | "type"
    | "priority"
    | "strict-nonbroadcast"
    | "stub"
    | "check-link"
    | "ecmp-weight"
    | "link-lsa-suppression"
    | "authentication"
    | "rx-buffer"
    | "tx"
    | "ttl-security"
    | "bfd"
    | "neighbors"
    | "other";
}

export interface OspfAreaInterfaceValueEntry extends OspfAreaInterfaceEntryBase {
  kind: "cost" | "priority" | "ecmp-weight" | "rx-buffer";
  value: string;
  valueRange: SourceRange;
}

export interface OspfAreaInterfaceTimerEntry extends OspfAreaInterfaceEntryBase {
  kind: "timer";
  option:
    | "hello"
    | "poll"
    | "retransmit"
    | "transmit-delay"
    | "wait"
    | "dead"
    | "dead-count";
  value: string;
  valueRange: SourceRange;
}

export interface OspfAreaInterfaceTypeEntry extends OspfAreaInterfaceEntryBase {
  kind: "type";
  value:
    | "broadcast"
    | "bcast"
    | "nonbroadcast"
    | "nbma"
    | "pointopoint"
    | "ptp"
    | "pointomultipoint"
    | "ptmp"
    | "other";
  valueText: string;
  valueRange: SourceRange;
}

export interface OspfAreaInterfaceBoolEntry extends OspfAreaInterfaceEntryBase {
  kind:
    | "strict-nonbroadcast"
    | "stub"
    | "check-link"
    | "link-lsa-suppression"
    | "ttl-security"
    | "bfd";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface OspfAreaInterfaceAuthenticationEntry extends OspfAreaInterfaceEntryBase {
  kind: "authentication";
  value: "none" | "simple" | "cryptographic" | "other";
  valueText: string;
  valueRange: SourceRange;
}

export interface OspfAreaInterfaceTxEntry extends OspfAreaInterfaceEntryBase {
  kind: "tx";
  option: "tos" | "priority" | "length";
  value: string;
  valueRange: SourceRange;
}

export interface OspfAreaInterfaceNeighborEntry extends SourceRange {
  address: string;
  addressRange: SourceRange;
  eligible: boolean;
  eligibleRange?: SourceRange;
}

export interface OspfAreaInterfaceNeighborsEntry extends OspfAreaInterfaceEntryBase {
  kind: "neighbors";
  entries: OspfAreaInterfaceNeighborEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface OspfAreaInterfaceOtherEntry extends OspfAreaInterfaceEntryBase {
  kind: "other";
  text: string;
}

export type OspfAreaInterfaceEntry =
  | OspfAreaInterfaceValueEntry
  | OspfAreaInterfaceTimerEntry
  | OspfAreaInterfaceTypeEntry
  | OspfAreaInterfaceBoolEntry
  | OspfAreaInterfaceAuthenticationEntry
  | OspfAreaInterfaceTxEntry
  | OspfAreaInterfaceNeighborsEntry
  | OspfAreaInterfaceOtherEntry;

export interface OspfAreaInterfaceStatement extends OspfAreaEntryBase {
  kind: "interface";
  patterns: string[];
  patternRanges: SourceRange[];
  entries: OspfAreaInterfaceEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface OspfAreaOtherEntry extends OspfAreaEntryBase {
  kind: "other";
  text: string;
}

export type OspfAreaEntry =
  | OspfAreaBoolEntry
  | OspfAreaValueEntry
  | OspfAreaPrefixListEntry
  | OspfAreaStubnetEntryStatement
  | OspfAreaInterfaceStatement
  | OspfAreaOtherEntry;

export interface OspfAreaStatement extends StatementBase {
  kind: "ospf-area";
  areaId: string;
  areaIdRange: SourceRange;
  entries: OspfAreaEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface BabelOptionStatement extends StatementBase {
  kind: "babel-option";
  option: "randomize-router-id";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

interface BabelInterfaceEntryBase extends SourceRange {
  kind:
    | "type"
    | "rxcost"
    | "limit"
    | "timer"
    | "buffer"
    | "tx-length"
    | "tx"
    | "tx-priority"
    | "check-link"
    | "next-hop"
    | "next-hop-prefer"
    | "extended-next-hop"
    | "authentication"
    | "password"
    | "rtt"
    | "send-timestamps"
    | "other";
}

export interface BabelInterfaceTypeEntry extends BabelInterfaceEntryBase {
  kind: "type";
  value: "wired" | "wireless" | "tunnel" | "other";
  valueText: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceValueEntry extends BabelInterfaceEntryBase {
  kind: "rxcost" | "limit" | "tx-length";
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceTimerEntry extends BabelInterfaceEntryBase {
  kind: "timer";
  option: "hello-interval" | "update-interval";
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceBufferEntry extends BabelInterfaceEntryBase {
  kind: "buffer";
  option: "rx-buffer";
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceTxEntry extends BabelInterfaceEntryBase {
  kind: "tx";
  option: string;
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfacePriorityEntry extends BabelInterfaceEntryBase {
  kind: "tx-priority";
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceBoolEntry extends BabelInterfaceEntryBase {
  kind: "check-link" | "extended-next-hop" | "send-timestamps";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface BabelInterfaceNextHopEntry extends BabelInterfaceEntryBase {
  kind: "next-hop";
  family: "ipv4" | "ipv6";
  address: string;
  addressKind: "ip" | "other";
  addressRange: SourceRange;
}

export interface BabelInterfaceNextHopPreferEntry extends BabelInterfaceEntryBase {
  kind: "next-hop-prefer";
  value: "native" | "ipv6" | "other";
  valueText: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceAuthenticationEntry extends BabelInterfaceEntryBase {
  kind: "authentication";
  authType: string;
  authTypeRange: SourceRange;
  permissive: boolean;
  permissiveRange?: SourceRange;
}

export interface BabelInterfacePasswordEntry extends BabelInterfaceEntryBase {
  kind: "password";
  value: string;
  valueText: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceRttEntry extends BabelInterfaceEntryBase {
  kind: "rtt";
  option: "min" | "max" | "cost" | "decay";
  value: string;
  valueRange: SourceRange;
}

export interface BabelInterfaceOtherEntry extends BabelInterfaceEntryBase {
  kind: "other";
  text: string;
}

export type BabelInterfaceEntry =
  | BabelInterfaceTypeEntry
  | BabelInterfaceValueEntry
  | BabelInterfaceTimerEntry
  | BabelInterfaceBufferEntry
  | BabelInterfaceTxEntry
  | BabelInterfacePriorityEntry
  | BabelInterfaceBoolEntry
  | BabelInterfaceNextHopEntry
  | BabelInterfaceNextHopPreferEntry
  | BabelInterfaceAuthenticationEntry
  | BabelInterfacePasswordEntry
  | BabelInterfaceRttEntry
  | BabelInterfaceOtherEntry;

export interface BabelInterfaceStatement extends StatementBase {
  kind: "babel-interface";
  patterns: string[];
  patternRanges: SourceRange[];
  entries: BabelInterfaceEntry[];
  bodyText: string;
  bodyRange: SourceRange;
}

interface RadvInterfaceEntryBase extends SourceRange {
  kind:
    | "timer"
    | "local"
    | "prefix"
    | "skip"
    | "onlink"
    | "autonomous"
    | "pd-preferred"
    | "lifetime"
    | "other";
}

export interface RadvInterfaceTimerEntry extends RadvInterfaceEntryBase {
  kind: "timer";
  option: "max-ra-interval";
  value: string;
  valueRange: SourceRange;
}

export interface RadvInterfaceLocalEntry extends RadvInterfaceEntryBase {
  kind: "local";
  option: "rdnss-local";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface RadvPrefixBoolEntry extends RadvInterfaceEntryBase {
  kind: "skip" | "onlink" | "autonomous" | "pd-preferred";
  value: boolean;
  valueText?: string;
  valueRange?: SourceRange;
}

export interface RadvPrefixLifetimeEntry extends RadvInterfaceEntryBase {
  kind: "lifetime";
  option: "valid-lifetime" | "preferred-lifetime";
  value: string;
  valueRange: SourceRange;
  sensitive?: boolean;
  sensitiveText?: string;
  sensitiveRange?: SourceRange;
}

export type RadvPrefixEntry =
  | RadvPrefixBoolEntry
  | RadvPrefixLifetimeEntry
  | RadvInterfaceOtherEntry;

export interface RadvInterfacePrefixEntry extends RadvInterfaceEntryBase {
  kind: "prefix";
  prefix: string;
  prefixRange: SourceRange;
  entries: RadvPrefixEntry[];
  bodyText?: string;
  bodyRange?: SourceRange;
}

export interface RadvInterfaceOtherEntry extends RadvInterfaceEntryBase {
  kind: "other";
  text: string;
}

export type RadvInterfaceEntry =
  | RadvInterfaceTimerEntry
  | RadvInterfaceLocalEntry
  | RadvInterfacePrefixEntry
  | RadvInterfaceOtherEntry;

export interface RadvInterfaceStatement extends StatementBase {
  kind: "radv-interface";
  patterns: string[];
  patternRanges: SourceRange[];
  entries: RadvInterfaceEntry[];
  bodyText: string;
  bodyRange: SourceRange;
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
  | PipeOptionStatement
  | PipeImportInStatement
  | StaticOptionStatement
  | StaticIgpTableStatement
  | BgpOptionStatement
  | BgpCapabilityStatement
  | BgpAuthenticationStatement
  | BgpPasswordStatement
  | BgpSetkeyStatement
  | BgpHopModeStatement
  | MrtOptionStatement
  | AggregatorOptionStatement
  | BmpOptionStatement
  | BfdOptionStatement
  | BfdProfileStatement
  | BfdNeighborStatement
  | VpnOptionStatement
  | EvpnEncapsulationStatement
  | EvpnVlanStatement
  | BridgeOptionStatement
  | OspfOptionStatement
  | OspfAreaStatement
  | BabelOptionStatement
  | BabelInterfaceStatement
  | RadvInterfaceStatement
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
  | GracefulRestartWaitDeclaration
  | HostnameOverrideDeclaration
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
