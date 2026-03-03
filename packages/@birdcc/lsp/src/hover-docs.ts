/* eslint-disable */
/**
 * This file is generated from src/hover-docs.yaml.
 * Run: pnpm --filter @birdcc/lsp hover-docs:generate
 */
export type HoverDocDiffType = "same" | "added" | "modified" | "removed";
export type HoverDocVersionTag = "v2+" | "v3+" | "v2" | "v2-v3";

export interface HoverDocSourceEntry {
  readonly keyword: string;
  readonly description: string;
  readonly detail: string;
  readonly diff: HoverDocDiffType;
  readonly version: HoverDocVersionTag;
  readonly anchor?: string;
  readonly anchors?: {
    readonly v2?: string;
    readonly v3?: string;
  };
  readonly notes?: {
    readonly v2?: string;
    readonly v3?: string;
  };
}

const VERSION_BASE_URLS = {
  v2: "https://bird.nic.cz/doc/bird-2.18.html",
  v3: "https://bird.nic.cz/doc/bird-3.2.0.html",
} as const;

const HOVER_DOC_SOURCES = [
  {
    keyword: ".asn",
    description: "Extract AS number from pair",
    detail: "Get the AS number component from an AS path pair.",
    diff: "same",
    version: "v2+",
    anchor: "filter-pair",
  },
  {
    keyword: ".data",
    description: "Extract data from pair",
    detail: "Get the data component from an AS path pair.",
    diff: "same",
    version: "v2+",
    anchor: "filter-pair",
  },
  {
    keyword: ".ip",
    description: "Extract IP from prefix",
    detail: "Get the network address part of a prefix.",
    diff: "same",
    version: "v2+",
    anchor: "filter-prefix",
  },
  {
    keyword: ".len",
    description: "Prefix length operator",
    detail: "Get the prefix length of a prefix value.",
    diff: "same",
    version: "v2+",
    anchor: "filter-prefix",
  },
  {
    keyword: ".mask",
    description: "IP mask operator",
    detail: "Get the subnet mask as an IP address.",
    diff: "same",
    version: "v2+",
    anchor: "filter-ip",
  },
  {
    keyword: "accept",
    description: "Accept route",
    detail: "Accept the current route and stop processing the filter.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "attribute",
    description: "Define custom route attribute",
    detail:
      "Create a custom route attribute that can be attached to routes and used in filters.",
    diff: "same",
    version: "v2+",
    anchor: "opt-attribute",
  },
  {
    keyword: "babel",
    description: "Babel routing protocol",
    detail:
      "A loop-avoiding distance-vector routing protocol that is robust and efficient.",
    diff: "same",
    version: "v2+",
    anchor: "proto-babel",
  },
  {
    keyword: "bfd",
    description: "Bidirectional Forwarding Detection",
    detail:
      "Fast failure detection protocol that can be used by other protocols like BGP and OSPF.",
    diff: "same",
    version: "v2+",
    anchor: "proto-bfd",
  },
  {
    keyword: "bgp",
    description: "BGP protocol",
    detail:
      "Border Gateway Protocol - the de facto standard for inter-domain routing on the Internet.",
    diff: "same",
    version: "v2+",
    anchor: "proto-bgp",
  },
  {
    keyword: "case",
    description: "Case statement",
    detail: "Multi-way branch based on expression value.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "cork threshold",
    description: "Cork threshold (v3 only)",
    detail: "Memory pressure control threshold for batching updates.",
    diff: "added",
    version: "v3+",
    anchor: "rtable-cork-threshold",
    notes: {
      v3: "v3 only: Memory pressure control.",
    },
  },
  {
    keyword: "debug",
    description: "Table debug options",
    detail:
      "Enable debugging for routing table operations. v3 has simplified option set.",
    diff: "modified",
    version: "v2-v3",
    anchors: {
      v2: "table-debug",
      v3: "rtable-debug",
    },
    notes: {
      v3: "v3 Breaking Change: Options simplified to {states|routes|events}",
    },
  },
  {
    keyword: "debug latency",
    description: "Enable latency debugging",
    detail:
      "Enable debugging of scheduling latency. v3 extends this to support granular event type filtering.",
    diff: "modified",
    version: "v2-v3",
    anchor: "opt-debug-latency",
    notes: {
      v3: "v3 Breaking Change: Extended to {ping|wakeup|scheduling|sockets|events|timers} for granular control.",
    },
  },
  {
    keyword: "debug tables",
    description: "Enable routing table debugging",
    detail:
      "Log detailed information about routing table operations and state changes.",
    diff: "same",
    version: "v2+",
    anchor: "opt-debug-tables",
  },
  {
    keyword: "define",
    description: "Define a constant value",
    detail:
      "Create a named constant that can be referenced throughout the configuration.",
    diff: "same",
    version: "v2+",
    anchor: "opt-define",
  },
  {
    keyword: "defined",
    description: "Check if symbol is defined",
    detail: "Test whether a symbol (attribute, route property) is defined.",
    diff: "same",
    version: "v2+",
    anchor: "filter-operators",
  },
  {
    keyword: "description",
    description: "Protocol description",
    detail:
      "Add a human-readable description to the protocol for administrative purposes.",
    diff: "same",
    version: "v2+",
    anchor: "proto-description",
  },
  {
    keyword: "device",
    description: "Device scan protocol",
    detail:
      "Scan network interfaces for link state changes and generate routes for directly connected networks.",
    diff: "same",
    version: "v2+",
    anchor: "proto-device",
  },
  {
    keyword: "direct",
    description: "Direct routes protocol",
    detail:
      "Generate routes for directly connected networks based on interface addresses.",
    diff: "same",
    version: "v2+",
    anchor: "proto-direct",
  },
  {
    keyword: "disabled",
    description: "Disable protocol on startup",
    detail:
      "Start the protocol in disabled state. Can be enabled later via CLI.",
    diff: "same",
    version: "v2+",
    anchor: "proto-disabled",
  },
  {
    keyword: "else",
    description: "Else clause",
    detail:
      "Marks the beginning of statements to execute when condition is false.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "eval",
    description: "Evaluate expression at config load time",
    detail:
      "Execute a filter expression during configuration parsing. Useful for dynamic configuration.",
    diff: "same",
    version: "v2+",
    anchor: "opt-eval",
  },
  {
    keyword: "export",
    description: "Export filter for channel",
    detail:
      "Specify filter for routes exported from the routing table to the protocol.",
    diff: "modified",
    version: "v2-v3",
    anchor: "channel-export",
    notes: {
      v3: "v3 Enhanced: Supports 'export in prefix' syntax for selective export.",
    },
  },
  {
    keyword: "export block",
    description: "Export block size (v3 only)",
    detail: "Configure bulk export block size for improved performance.",
    diff: "added",
    version: "v3+",
    anchor: "channel-export-block",
    notes: {
      v3: "v3 only: Bulk export optimization.",
    },
  },
  {
    keyword: "export limit",
    description: "Export route limit",
    detail: "Set maximum number of routes that can be exported to the peer.",
    diff: "same",
    version: "v2+",
    anchor: "channel-export-limit",
  },
  {
    keyword: "export settle time",
    description: "Export settle time (v3 only)",
    detail: "Time to wait before exporting route changes to protocols.",
    diff: "added",
    version: "v3+",
    anchor: "rtable-export-settle-time",
    notes: {
      v3: "v3 only: Replaces min/max settle time from v2.",
    },
  },
  {
    keyword: "filter",
    description: "Define a routing filter",
    detail:
      "Create a named filter that can be used to accept, reject, or modify routes during import/export.",
    diff: "same",
    version: "v2+",
    anchor: "opt-filter",
  },
  {
    keyword: "function",
    description: "Define a reusable filter function",
    detail:
      "Create a named function that can be called from filters. Supports typed parameters and return values.",
    diff: "same",
    version: "v2+",
    anchor: "opt-function",
  },
  {
    keyword: "gc period",
    description: "Garbage collection period",
    detail: "Set the interval between garbage collection runs.",
    diff: "same",
    version: "v2+",
    anchor: "rtable-gc-period",
  },
  {
    keyword: "gc threshold",
    description: "Garbage collection threshold",
    detail: "Configure the garbage collection threshold for the routing table.",
    diff: "same",
    version: "v2+",
    anchor: "rtable-gc-threshold",
  },
  {
    keyword: "graceful restart wait",
    description: "Set graceful restart timeout",
    detail:
      "Configure how long to wait for protocols to recover after a graceful restart.",
    diff: "same",
    version: "v2+",
    anchor: "opt-graceful-restart-wait",
  },
  {
    keyword: "hostname",
    description: "Set router hostname",
    detail:
      "Override the system hostname used in protocol announcements and logging.",
    diff: "same",
    version: "v2+",
    anchor: "opt-hostname",
  },
  {
    keyword: "if",
    description: "Conditional statement",
    detail: "Execute statements conditionally based on a boolean expression.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "import",
    description: "Import filter for channel",
    detail:
      "Specify filter for routes imported from the protocol to the routing table.",
    diff: "same",
    version: "v2+",
    anchor: "channel-import",
  },
  {
    keyword: "import keep filtered",
    description: "Keep filtered routes",
    detail:
      "Store routes that were filtered out during import, allowing them to be examined.",
    diff: "same",
    version: "v2+",
    anchor: "channel-import-keep-filtered",
  },
  {
    keyword: "import limit",
    description: "Import route limit",
    detail:
      "Set maximum number of routes that can be imported from this channel.",
    diff: "same",
    version: "v2+",
    anchor: "channel-import-limit",
  },
  {
    keyword: "include",
    description: "Include another configuration file",
    detail:
      "Include and parse another configuration file at this point. Supports glob patterns for including multiple files.",
    diff: "same",
    version: "v2+",
    anchor: "opt-include",
  },
  {
    keyword: "int",
    description: "Integer data type",
    detail: "A signed 32-bit integer.",
    diff: "same",
    version: "v2+",
    anchor: "filter-data-types",
  },
  {
    keyword: "interface",
    description: "Configure protocol interfaces",
    detail:
      "Define which interfaces this protocol operates on and their specific settings.",
    diff: "same",
    version: "v2+",
    anchor: "proto-iface",
  },
  {
    keyword: "ip",
    description: "IP address data type",
    detail: "An IPv4 or IPv6 address.",
    diff: "same",
    version: "v2+",
    anchor: "filter-data-types",
  },
  {
    keyword: "ipv4",
    description: "IPv4 channel",
    detail: "Define an IPv4 address family channel for route exchange.",
    diff: "same",
    version: "v2+",
    anchor: "channel-opts",
  },
  {
    keyword: "ipv6",
    description: "IPv6 channel",
    detail: "Define an IPv6 address family channel for route exchange.",
    diff: "same",
    version: "v2+",
    anchor: "channel-opts",
  },
  {
    keyword: "kernel",
    description: "Kernel synchronization protocol",
    detail:
      "Synchronize routes between BIRD and the operating system kernel routing table.",
    diff: "same",
    version: "v2+",
    anchor: "proto-kernel",
  },
  {
    keyword: "label policy",
    description: "MPLS label policy",
    detail: "Configure how MPLS labels are assigned and distributed.",
    diff: "same",
    version: "v2+",
    anchor: "mpls-label-policy",
  },
  {
    keyword: "label range",
    description: "MPLS label range",
    detail: "Define the range of MPLS labels to use.",
    diff: "same",
    version: "v2+",
    anchor: "mpls-label-range",
  },
  {
    keyword: "local as",
    description: "Set local AS number (BGP)",
    detail: "Configure the local Autonomous System number for BGP sessions.",
    diff: "same",
    version: "v2+",
    anchor: "proto-bgp",
  },
  {
    keyword: "log",
    description: "Configure logging destination and format",
    detail:
      "Set log output to stderr, syslog, or a file. BIRD 3 adds 'fixed' option for ring buffer logging.",
    diff: "modified",
    version: "v2-v3",
    anchor: "opt-log",
    notes: {
      v3: "v3 adds 'fixed' ring buffer option for memory-constrained environments.",
    },
  },
  {
    keyword: "max latency",
    description: "Set maximum latency for thread group (v3 only)",
    detail:
      "Configure the maximum allowed latency for threads in a thread group before warnings.",
    diff: "added",
    version: "v3+",
    anchor: "thread-setup",
    notes: {
      v3: "v3 only: Thread group performance tuning option.",
    },
  },
  {
    keyword: "max settle time",
    description: "Maximum settle time (v2 only)",
    detail:
      "Maximum time to wait before announcing route changes. Removed in v3.",
    diff: "removed",
    version: "v2",
    anchor: "rtable-max-settle-time",
    notes: {
      v3: "v3: Removed - use export settle time instead",
    },
  },
  {
    keyword: "min settle time",
    description: "Minimum settle time (v2 only)",
    detail:
      "Minimum time to wait before announcing route changes. Removed in v3.",
    diff: "removed",
    version: "v2",
    anchor: "rtable-min-settle-time",
    notes: {
      v3: "v3: Removed - use export settle time instead",
    },
  },
  {
    keyword: "mpls domain",
    description: "Define an MPLS domain",
    detail:
      "Create a named MPLS domain for label distribution and MPLS forwarding.",
    diff: "same",
    version: "v2+",
    anchor: "mpls-opts",
  },
  {
    keyword: "mrtdump",
    description: "Configure MRT dump output",
    detail:
      "Set up MRT format dump for BGP updates and routing table dumps for analysis.",
    diff: "same",
    version: "v2+",
    anchor: "opt-mrtdump",
  },
  {
    keyword: "multihop",
    description: "Enable BGP multihop",
    detail:
      "Allow BGP sessions to non-directly connected peers with optional TTL specification.",
    diff: "same",
    version: "v2+",
    anchor: "proto-bgp",
  },
  {
    keyword: "neighbor",
    description: "Set BGP neighbor",
    detail: "Configure the IP address and AS number of the BGP peer.",
    diff: "same",
    version: "v2+",
    anchor: "proto-bgp",
  },
  {
    keyword: "ospf",
    description: "OSPF protocol",
    detail:
      "Open Shortest Path First - a link-state interior gateway protocol.",
    diff: "same",
    version: "v2+",
    anchor: "proto-ospf",
  },
  {
    keyword: "password",
    description: "Configure protocol authentication",
    detail:
      "Set authentication password for protocols that support it (BGP, OSPF).",
    diff: "same",
    version: "v2+",
    anchor: "proto-password",
  },
  {
    keyword: "pipe",
    description: "Protocol pipe",
    detail:
      "Connect two routing tables, forwarding routes between them with optional filtering.",
    diff: "same",
    version: "v2+",
    anchor: "proto-pipe",
  },
  {
    keyword: "preference",
    description: "Route preference value",
    detail:
      "Set the preference value for routes from this channel. Higher values are preferred.",
    diff: "same",
    version: "v2+",
    anchor: "channel-preference",
  },
  {
    keyword: "prefix",
    description: "Prefix data type",
    detail:
      "An IP address prefix consisting of an IP address and a prefix length.",
    diff: "same",
    version: "v2+",
    anchor: "filter-data-types",
  },
  {
    keyword: "print",
    description: "Print debug output",
    detail: "Output debug information during filter execution.",
    diff: "same",
    version: "v2+",
    anchor: "filter-functions",
  },
  {
    keyword: "protocol",
    description: "Define a routing protocol instance",
    detail:
      "Create a named instance of a routing protocol (BGP, OSPF, etc.) with its configuration.",
    diff: "same",
    version: "v2+",
    anchor: "opt-protocol",
  },
  {
    keyword: "receive limit",
    description: "Receive route limit",
    detail: "Set maximum number of routes that can be received from the peer.",
    diff: "same",
    version: "v2+",
    anchor: "channel-receive-limit",
  },
  {
    keyword: "reject",
    description: "Reject route",
    detail: "Reject the current route and stop processing the filter.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "restart time limit",
    description: "Automatic restart time limit (v3 only)",
    detail:
      "Configure automatic restart of the protocol after failure within specified time limit.",
    diff: "added",
    version: "v3+",
    anchor: "proto-restart-time-limit",
    notes: {
      v3: "v3 only: Automatic protocol restart on failure.",
    },
  },
  {
    keyword: "return",
    description: "Return from function",
    detail: "Return a value from a filter function.",
    diff: "same",
    version: "v2+",
    anchor: "filter-functions",
  },
  {
    keyword: "rip",
    description: "RIP protocol",
    detail:
      "Routing Information Protocol - a distance-vector interior gateway protocol.",
    diff: "same",
    version: "v2+",
    anchor: "proto-rip",
  },
  {
    keyword: "router id",
    description: "Set BIRD's router ID",
    detail:
      "Router ID is a 4-byte integer that should be unique within an AS. It is used to identify the router in routing protocols. Default: the lowest IPv4 address of the router.",
    diff: "same",
    version: "v2+",
    anchor: "opt-router-id",
  },
  {
    keyword: "router id from",
    description: "Derive router ID from interface",
    detail:
      "Automatically determine the router ID from the lowest IP address of the specified interface.",
    diff: "same",
    version: "v2+",
    anchor: "opt-router-id-from",
  },
  {
    keyword: "rpki reload",
    description: "RPKI reload behavior",
    detail:
      "Configure how routes are reloaded when RPKI validation state changes.",
    diff: "modified",
    version: "v2-v3",
    anchor: "channel-rpki-reload",
    notes: {
      v3: "v3 Enhanced: Supports both ROA and ASPA validation reload.",
    },
  },
  {
    keyword: "sorted",
    description: "Enable sorted table mode",
    detail: "Keep routes sorted for faster route lookups.",
    diff: "same",
    version: "v2+",
    anchor: "rtable-sorted",
  },
  {
    keyword: "static",
    description: "Static routes protocol",
    detail:
      "Define static routes that are not learned from any routing protocol.",
    diff: "same",
    version: "v2+",
    anchor: "proto-static",
  },
  {
    keyword: "string",
    description: "String data type",
    detail: "A sequence of characters.",
    diff: "same",
    version: "v2+",
    anchor: "filter-data-types",
  },
  {
    keyword: "table",
    description: "Define a routing table",
    detail:
      "Create a named routing table to store routes. Tables can be associated with channels for import/export.",
    diff: "same",
    version: "v2+",
    anchor: "rtable-opts",
  },
  {
    keyword: "template",
    description: "Define a protocol template",
    detail:
      "Create a reusable protocol configuration template that can be inherited by other protocols.",
    diff: "same",
    version: "v2+",
    anchor: "opt-template",
  },
  {
    keyword: "then",
    description: "Then clause",
    detail:
      "Marks the beginning of statements to execute when condition is true.",
    diff: "same",
    version: "v2+",
    anchor: "filter-control",
  },
  {
    keyword: "thread group",
    description: "Configure thread groups for multi-threading (v3 only)",
    detail:
      "Define a thread group for running protocol and channel tasks in parallel. BIRD 3.0+ supports multi-threading with configurable thread groups.",
    diff: "added",
    version: "v3+",
    anchor: "thread-setup",
    notes: {
      v3: "v3.2.0+: BIRD runs in several threads with configurable thread groups for different workloads.",
    },
  },
  {
    keyword: "threads",
    description: "Set number of threads (deprecated in v3)",
    detail:
      "Configure the number of worker threads. In v3, use 'thread group' instead for more granular control.",
    diff: "modified",
    version: "v2-v3",
    anchors: {
      v2: "opt-threads",
      v3: "thread-setup",
    },
    notes: {
      v3: "v3: Deprecated in favor of 'thread group' configuration blocks.",
    },
  },
  {
    keyword: "timeformat",
    description: "Set time format for logging",
    detail: "Configure the format string used for timestamps in log messages.",
    diff: "same",
    version: "v2+",
    anchor: "opt-timeformat",
  },
  {
    keyword: "trie",
    description: "Use trie data structure",
    detail:
      "Store routes in a trie data structure for optimized longest-prefix matching.",
    diff: "same",
    version: "v2+",
    anchor: "rtable-trie",
  },
  {
    keyword: "vrf",
    description: "Bind protocol to VRF",
    detail:
      "Associate this protocol with a specific Virtual Routing and Forwarding instance.",
    diff: "same",
    version: "v2+",
    anchor: "proto-vrf",
  },
  {
    keyword: "watchdog warning",
    description: "Set watchdog warning threshold",
    detail:
      "Configure the time threshold after which a warning is logged if the scheduler doesn't respond.",
    diff: "same",
    version: "v2+",
    anchor: "opt-watchdog-warning",
  },
] as const satisfies readonly HoverDocSourceEntry[];

const buildDocUrl = (
  version: keyof typeof VERSION_BASE_URLS,
  anchor?: string,
): string => {
  const baseUrl = VERSION_BASE_URLS[version];
  if (!anchor || anchor.length === 0) {
    return baseUrl;
  }
  return `${baseUrl}#${anchor}`;
};

const buildDocsSection = (entry: HoverDocSourceEntry): string => {
  const lines: string[] = [];

  if (entry.version === "v2+") {
    lines.push(`- [BIRD v2.18 / v3.2.0](${buildDocUrl("v2", entry.anchor)})`);
  } else if (entry.version === "v3+") {
    lines.push(`- [BIRD v3.2.0](${buildDocUrl("v3", entry.anchor)})`);
  } else if (entry.version === "v2") {
    lines.push(`- [BIRD v2.18](${buildDocUrl("v2", entry.anchor)})`);
  } else {
    const v2Anchor = entry.anchors?.v2 ?? entry.anchor;
    const v3Anchor = entry.anchors?.v3 ?? entry.anchor;

    if (v2Anchor) {
      lines.push(`- [BIRD v2.18](${buildDocUrl("v2", v2Anchor)})`);
    }

    if (v3Anchor) {
      lines.push(`- [BIRD v3.2.0](${buildDocUrl("v3", v3Anchor)})`);
    }
  }

  return lines.join("\n");
};

const buildNotesSection = (entry: HoverDocSourceEntry): string => {
  if (!entry.notes) {
    return "";
  }

  const lines: string[] = [];
  if (entry.notes.v2) {
    lines.push(`- v2: ${entry.notes.v2}`);
  }
  if (entry.notes.v3) {
    lines.push(`- v3: ${entry.notes.v3}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `\n\nNotes:\n${lines.join("\n")}`;
};

const toHoverMarkdown = (entry: HoverDocSourceEntry): string =>
  [
    `### ${entry.description}`,
    "",
    entry.detail,
    "",
    `Diff: \`${entry.diff}\``,
    `Version: \`${entry.version}\``,
    "Docs:",
    buildDocsSection(entry),
  ].join("\n") + buildNotesSection(entry);

export const HOVER_KEYWORD_DOCS: Record<string, string> = Object.fromEntries(
  HOVER_DOC_SOURCES.map((entry) => [entry.keyword, toHoverMarkdown(entry)]),
);

export const HOVER_KEYWORDS: readonly string[] = Object.freeze(
  HOVER_DOC_SOURCES.map((entry) => entry.keyword),
);
