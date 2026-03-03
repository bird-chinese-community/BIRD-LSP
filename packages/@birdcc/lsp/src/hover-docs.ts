export interface HoverDocVersionEntry {
  readonly available: boolean;
  readonly url: string;
  readonly anchor: string;
  readonly note: string;
}

export interface HoverDocEntry {
  readonly keyword: string;
  readonly description: string;
  readonly detail: string;
  readonly diffType: "same" | "added" | "modified" | "removed";
  readonly versions: {
    readonly v2: HoverDocVersionEntry;
    readonly v3: HoverDocVersionEntry;
  };
}

const HOVER_DOC_ENTRIES: readonly HoverDocEntry[] = [
  {
    keyword: "router id",
    description: "Set BIRD's router ID",
    detail:
      "Router ID is a 4-byte integer that should be unique within an AS. It is used to identify the router in routing protocols. Default: the lowest IPv4 address of the router.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-router-id",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-router-id",
        note: "",
      },
    },
  },
  {
    keyword: "thread group",
    description: "Configure thread groups for multi-threading (v3 only)",
    detail:
      "Define a thread group for running protocol and channel tasks in parallel. BIRD 3.0+ supports multi-threading with configurable thread groups.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#thread-setup",
        note: "v3.2.0+: BIRD runs in several threads with configurable thread groups for different workloads.",
      },
    },
  },
  {
    keyword: "include",
    description: "Include another configuration file",
    detail:
      "Include and parse another configuration file at this point. Supports glob patterns for including multiple files.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-include",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-include",
        note: "",
      },
    },
  },
  {
    keyword: "log",
    description: "Configure logging destination and format",
    detail:
      "Set log output to stderr, syslog, or a file. BIRD 3 adds 'fixed' option for ring buffer logging.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-log",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-log",
        note: "v3 adds 'fixed' ring buffer option for memory-constrained environments.",
      },
    },
  },
  {
    keyword: "filter",
    description: "Define a routing filter",
    detail:
      "Create a named filter that can be used to accept, reject, or modify routes during import/export.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-filter",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-filter",
        note: "",
      },
    },
  },
  {
    keyword: "function",
    description: "Define a reusable filter function",
    detail:
      "Create a named function that can be called from filters. Supports typed parameters and return values.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-function",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-function",
        note: "",
      },
    },
  },
  {
    keyword: "protocol",
    description: "Define a routing protocol instance",
    detail:
      "Create a named instance of a routing protocol (BGP, OSPF, etc.) with its configuration.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-protocol",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-protocol",
        note: "",
      },
    },
  },
  {
    keyword: "template",
    description: "Define a protocol template",
    detail:
      "Create a reusable protocol configuration template that can be inherited by other protocols.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-template",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-template",
        note: "",
      },
    },
  },
  {
    keyword: "table",
    description: "Define a routing table",
    detail:
      "Create a named routing table to store routes. Tables can be associated with channels for import/export.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-opts",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-opts",
        note: "",
      },
    },
  },
  {
    keyword: "define",
    description: "Define a constant value",
    detail:
      "Create a named constant that can be referenced throughout the configuration.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-define",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-define",
        note: "",
      },
    },
  },
  {
    keyword: "debug latency",
    description: "Enable latency debugging",
    detail:
      "Enable debugging of scheduling latency. v3 extends this to support granular event type filtering.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-debug-latency",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-debug-latency",
        note: "v3 Breaking Change: Extended to {ping|wakeup|scheduling|sockets|events|timers} for granular control.",
      },
    },
  },
  {
    keyword: "threads",
    description: "Set number of threads (deprecated in v3)",
    detail:
      "Configure the number of worker threads. In v3, use 'thread group' instead for more granular control.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-threads",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#thread-setup",
        note: "v3: Deprecated in favor of 'thread group' configuration blocks.",
      },
    },
  },
  {
    keyword: "watchdog warning",
    description: "Set watchdog warning threshold",
    detail:
      "Configure the time threshold after which a warning is logged if the scheduler doesn't respond.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-watchdog-warning",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-watchdog-warning",
        note: "",
      },
    },
  },
  {
    keyword: "mrtdump",
    description: "Configure MRT dump output",
    detail:
      "Set up MRT format dump for BGP updates and routing table dumps for analysis.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-mrtdump",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-mrtdump",
        note: "",
      },
    },
  },
  {
    keyword: "graceful restart wait",
    description: "Set graceful restart timeout",
    detail:
      "Configure how long to wait for protocols to recover after a graceful restart.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-graceful-restart-wait",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-graceful-restart-wait",
        note: "",
      },
    },
  },
  {
    keyword: "timeformat",
    description: "Set time format for logging",
    detail: "Configure the format string used for timestamps in log messages.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-timeformat",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-timeformat",
        note: "",
      },
    },
  },
  {
    keyword: "hostname",
    description: "Set router hostname",
    detail:
      "Override the system hostname used in protocol announcements and logging.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-hostname",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-hostname",
        note: "",
      },
    },
  },
  {
    keyword: "max latency",
    description: "Set maximum latency for thread group (v3 only)",
    detail:
      "Configure the maximum allowed latency for threads in a thread group before warnings.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#thread-setup",
        note: "v3 only: Thread group performance tuning option.",
      },
    },
  },
  {
    keyword: "attribute",
    description: "Define custom route attribute",
    detail:
      "Create a custom route attribute that can be attached to routes and used in filters.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-attribute",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-attribute",
        note: "",
      },
    },
  },
  {
    keyword: "eval",
    description: "Evaluate expression at config load time",
    detail:
      "Execute a filter expression during configuration parsing. Useful for dynamic configuration.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-eval",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-eval",
        note: "",
      },
    },
  },
  {
    keyword: "debug tables",
    description: "Enable routing table debugging",
    detail:
      "Log detailed information about routing table operations and state changes.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-debug-tables",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-debug-tables",
        note: "",
      },
    },
  },
  {
    keyword: "mpls domain",
    description: "Define an MPLS domain",
    detail:
      "Create a named MPLS domain for label distribution and MPLS forwarding.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#mpls-opts",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#mpls-opts",
        note: "",
      },
    },
  },
  {
    keyword: "router id from",
    description: "Derive router ID from interface",
    detail:
      "Automatically determine the router ID from the lowest IP address of the specified interface.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#opt-router-id-from",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#opt-router-id-from",
        note: "",
      },
    },
  },
  {
    keyword: "bgp",
    description: "BGP protocol",
    detail:
      "Border Gateway Protocol - the de facto standard for inter-domain routing on the Internet.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-bgp",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-bgp",
        note: "",
      },
    },
  },
  {
    keyword: "ospf",
    description: "OSPF protocol",
    detail:
      "Open Shortest Path First - a link-state interior gateway protocol.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-ospf",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-ospf",
        note: "",
      },
    },
  },
  {
    keyword: "kernel",
    description: "Kernel synchronization protocol",
    detail:
      "Synchronize routes between BIRD and the operating system kernel routing table.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-kernel",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-kernel",
        note: "",
      },
    },
  },
  {
    keyword: "static",
    description: "Static routes protocol",
    detail:
      "Define static routes that are not learned from any routing protocol.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-static",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-static",
        note: "",
      },
    },
  },
  {
    keyword: "device",
    description: "Device scan protocol",
    detail:
      "Scan network interfaces for link state changes and generate routes for directly connected networks.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-device",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-device",
        note: "",
      },
    },
  },
  {
    keyword: "direct",
    description: "Direct routes protocol",
    detail:
      "Generate routes for directly connected networks based on interface addresses.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-direct",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-direct",
        note: "",
      },
    },
  },
  {
    keyword: "bfd",
    description: "Bidirectional Forwarding Detection",
    detail:
      "Fast failure detection protocol that can be used by other protocols like BGP and OSPF.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-bfd",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-bfd",
        note: "",
      },
    },
  },
  {
    keyword: "rip",
    description: "RIP protocol",
    detail:
      "Routing Information Protocol - a distance-vector interior gateway protocol.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-rip",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-rip",
        note: "",
      },
    },
  },
  {
    keyword: "babel",
    description: "Babel routing protocol",
    detail:
      "A loop-avoiding distance-vector routing protocol that is robust and efficient.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-babel",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-babel",
        note: "",
      },
    },
  },
  {
    keyword: "pipe",
    description: "Protocol pipe",
    detail:
      "Connect two routing tables, forwarding routes between them with optional filtering.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-pipe",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-pipe",
        note: "",
      },
    },
  },
  {
    keyword: "disabled",
    description: "Disable protocol on startup",
    detail:
      "Start the protocol in disabled state. Can be enabled later via CLI.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-disabled",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-disabled",
        note: "",
      },
    },
  },
  {
    keyword: "description",
    description: "Protocol description",
    detail:
      "Add a human-readable description to the protocol for administrative purposes.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-description",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-description",
        note: "",
      },
    },
  },
  {
    keyword: "vrf",
    description: "Bind protocol to VRF",
    detail:
      "Associate this protocol with a specific Virtual Routing and Forwarding instance.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-vrf",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-vrf",
        note: "",
      },
    },
  },
  {
    keyword: "interface",
    description: "Configure protocol interfaces",
    detail:
      "Define which interfaces this protocol operates on and their specific settings.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-iface",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-iface",
        note: "",
      },
    },
  },
  {
    keyword: "password",
    description: "Configure protocol authentication",
    detail:
      "Set authentication password for protocols that support it (BGP, OSPF).",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-password",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-password",
        note: "",
      },
    },
  },
  {
    keyword: "local as",
    description: "Set local AS number (BGP)",
    detail: "Configure the local Autonomous System number for BGP sessions.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-bgp",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-bgp",
        note: "",
      },
    },
  },
  {
    keyword: "neighbor",
    description: "Set BGP neighbor",
    detail: "Configure the IP address and AS number of the BGP peer.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-bgp",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-bgp",
        note: "",
      },
    },
  },
  {
    keyword: "multihop",
    description: "Enable BGP multihop",
    detail:
      "Allow BGP sessions to non-directly connected peers with optional TTL specification.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#proto-bgp",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-bgp",
        note: "",
      },
    },
  },
  {
    keyword: "restart time limit",
    description: "Automatic restart time limit (v3 only)",
    detail:
      "Configure automatic restart of the protocol after failure within specified time limit.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#proto-restart-time-limit",
        note: "v3 only: Automatic protocol restart on failure.",
      },
    },
  },
  {
    keyword: "ipv4",
    description: "IPv4 channel",
    detail: "Define an IPv4 address family channel for route exchange.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-opts",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-opts",
        note: "",
      },
    },
  },
  {
    keyword: "ipv6",
    description: "IPv6 channel",
    detail: "Define an IPv6 address family channel for route exchange.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-opts",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-opts",
        note: "",
      },
    },
  },
  {
    keyword: "import",
    description: "Import filter for channel",
    detail:
      "Specify filter for routes imported from the protocol to the routing table.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-import",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-import",
        note: "",
      },
    },
  },
  {
    keyword: "export",
    description: "Export filter for channel",
    detail:
      "Specify filter for routes exported from the routing table to the protocol.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-export",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-export",
        note: "v3 Enhanced: Supports 'export in prefix' syntax for selective export.",
      },
    },
  },
  {
    keyword: "preference",
    description: "Route preference value",
    detail:
      "Set the preference value for routes from this channel. Higher values are preferred.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-preference",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-preference",
        note: "",
      },
    },
  },
  {
    keyword: "import limit",
    description: "Import route limit",
    detail:
      "Set maximum number of routes that can be imported from this channel.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-import-limit",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-import-limit",
        note: "",
      },
    },
  },
  {
    keyword: "receive limit",
    description: "Receive route limit",
    detail: "Set maximum number of routes that can be received from the peer.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-receive-limit",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-receive-limit",
        note: "",
      },
    },
  },
  {
    keyword: "export limit",
    description: "Export route limit",
    detail: "Set maximum number of routes that can be exported to the peer.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-export-limit",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-export-limit",
        note: "",
      },
    },
  },
  {
    keyword: "rpki reload",
    description: "RPKI reload behavior",
    detail:
      "Configure how routes are reloaded when RPKI validation state changes.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-rpki-reload",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-rpki-reload",
        note: "v3 Enhanced: Supports both ROA and ASPA validation reload.",
      },
    },
  },
  {
    keyword: "import keep filtered",
    description: "Keep filtered routes",
    detail:
      "Store routes that were filtered out during import, allowing them to be examined.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#channel-import-keep-filtered",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-import-keep-filtered",
        note: "",
      },
    },
  },
  {
    keyword: "export block",
    description: "Export block size (v3 only)",
    detail: "Configure bulk export block size for improved performance.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#channel-export-block",
        note: "v3 only: Bulk export optimization.",
      },
    },
  },
  {
    keyword: "if",
    description: "Conditional statement",
    detail: "Execute statements conditionally based on a boolean expression.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "then",
    description: "Then clause",
    detail:
      "Marks the beginning of statements to execute when condition is true.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "else",
    description: "Else clause",
    detail:
      "Marks the beginning of statements to execute when condition is false.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "case",
    description: "Case statement",
    detail: "Multi-way branch based on expression value.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "accept",
    description: "Accept route",
    detail: "Accept the current route and stop processing the filter.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "reject",
    description: "Reject route",
    detail: "Reject the current route and stop processing the filter.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-control",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-control",
        note: "",
      },
    },
  },
  {
    keyword: "return",
    description: "Return from function",
    detail: "Return a value from a filter function.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-functions",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-functions",
        note: "",
      },
    },
  },
  {
    keyword: "print",
    description: "Print debug output",
    detail: "Output debug information during filter execution.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-functions",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-functions",
        note: "",
      },
    },
  },
  {
    keyword: "defined",
    description: "Check if symbol is defined",
    detail: "Test whether a symbol (attribute, route property) is defined.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-operators",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-operators",
        note: "",
      },
    },
  },
  {
    keyword: "prefix",
    description: "Prefix data type",
    detail:
      "An IP address prefix consisting of an IP address and a prefix length.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-data-types",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-data-types",
        note: "",
      },
    },
  },
  {
    keyword: "ip",
    description: "IP address data type",
    detail: "An IPv4 or IPv6 address.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-data-types",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-data-types",
        note: "",
      },
    },
  },
  {
    keyword: "int",
    description: "Integer data type",
    detail: "A signed 32-bit integer.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-data-types",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-data-types",
        note: "",
      },
    },
  },
  {
    keyword: "string",
    description: "String data type",
    detail: "A sequence of characters.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-data-types",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-data-types",
        note: "",
      },
    },
  },
  {
    keyword: ".len",
    description: "Prefix length operator",
    detail: "Get the prefix length of a prefix value.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-prefix",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-prefix",
        note: "",
      },
    },
  },
  {
    keyword: ".ip",
    description: "Extract IP from prefix",
    detail: "Get the network address part of a prefix.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-prefix",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-prefix",
        note: "",
      },
    },
  },
  {
    keyword: ".mask",
    description: "IP mask operator",
    detail: "Get the subnet mask as an IP address.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-ip",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-ip",
        note: "",
      },
    },
  },
  {
    keyword: ".asn",
    description: "Extract AS number from pair",
    detail: "Get the AS number component from an AS path pair.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-pair",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-pair",
        note: "",
      },
    },
  },
  {
    keyword: ".data",
    description: "Extract data from pair",
    detail: "Get the data component from an AS path pair.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#filter-pair",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#filter-pair",
        note: "",
      },
    },
  },
  {
    keyword: "sorted",
    description: "Enable sorted table mode",
    detail: "Keep routes sorted for faster route lookups.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-sorted",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-sorted",
        note: "",
      },
    },
  },
  {
    keyword: "trie",
    description: "Use trie data structure",
    detail:
      "Store routes in a trie data structure for optimized longest-prefix matching.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-trie",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-trie",
        note: "",
      },
    },
  },
  {
    keyword: "gc threshold",
    description: "Garbage collection threshold",
    detail: "Configure the garbage collection threshold for the routing table.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-gc-threshold",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-gc-threshold",
        note: "",
      },
    },
  },
  {
    keyword: "gc period",
    description: "Garbage collection period",
    detail: "Set the interval between garbage collection runs.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-gc-period",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-gc-period",
        note: "",
      },
    },
  },
  {
    keyword: "debug",
    description: "Table debug options",
    detail:
      "Enable debugging for routing table operations. v3 has simplified option set.",
    diffType: "modified",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#table-debug",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-debug",
        note: "v3 Breaking Change: Options simplified to {states|routes|events}",
      },
    },
  },
  {
    keyword: "min settle time",
    description: "Minimum settle time (v2 only)",
    detail:
      "Minimum time to wait before announcing route changes. Removed in v3.",
    diffType: "removed",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-min-settle-time",
        note: "",
      },
      v3: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "",
        note: "v3: Removed - use export settle time instead",
      },
    },
  },
  {
    keyword: "max settle time",
    description: "Maximum settle time (v2 only)",
    detail:
      "Maximum time to wait before announcing route changes. Removed in v3.",
    diffType: "removed",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#rtable-max-settle-time",
        note: "",
      },
      v3: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "",
        note: "v3: Removed - use export settle time instead",
      },
    },
  },
  {
    keyword: "cork threshold",
    description: "Cork threshold (v3 only)",
    detail: "Memory pressure control threshold for batching updates.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-cork-threshold",
        note: "v3 only: Memory pressure control.",
      },
    },
  },
  {
    keyword: "export settle time",
    description: "Export settle time (v3 only)",
    detail: "Time to wait before exporting route changes to protocols.",
    diffType: "added",
    versions: {
      v2: {
        available: false,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#rtable-export-settle-time",
        note: "v3 only: Replaces min/max settle time from v2.",
      },
    },
  },
  {
    keyword: "label range",
    description: "MPLS label range",
    detail: "Define the range of MPLS labels to use.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#mpls-label-range",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#mpls-label-range",
        note: "",
      },
    },
  },
  {
    keyword: "label policy",
    description: "MPLS label policy",
    detail: "Configure how MPLS labels are assigned and distributed.",
    diffType: "same",
    versions: {
      v2: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-2.18.html",
        anchor: "#mpls-label-policy",
        note: "",
      },
      v3: {
        available: true,
        url: "https://bird.nic.cz/doc/bird-3.2.0.html",
        anchor: "#mpls-label-policy",
        note: "",
      },
    },
  },
] as const satisfies readonly HoverDocEntry[];

const docLink = (version: HoverDocVersionEntry): string | null => {
  if (!version.available || version.url.length === 0) {
    return null;
  }

  return version.anchor.length > 0
    ? `${version.url}${version.anchor}`
    : version.url;
};

const formatVersionLine = (
  label: "v2.18" | "v3.2.0",
  version: HoverDocVersionEntry,
): string => {
  if (!version.available) {
    return `- ${label}: unavailable`;
  }

  const link = docLink(version);
  const linkPart = link ? `[docs](${link})` : "docs unavailable";
  const notePart = version.note.length > 0 ? ` — ${version.note}` : "";
  return `- ${label}: ${linkPart}${notePart}`;
};

const createKeywordMarkdown = (entry: HoverDocEntry): string => {
  const parts: string[] = [entry.description];

  if (entry.detail.length > 0) {
    parts.push(entry.detail);
  }

  parts.push(`Diff: \`${entry.diffType}\``);
  parts.push(formatVersionLine("v2.18", entry.versions.v2));
  parts.push(formatVersionLine("v3.2.0", entry.versions.v3));

  return parts.join("\n\n");
};

export const HOVER_KEYWORD_DOCS: Record<string, string> = Object.fromEntries(
  HOVER_DOC_ENTRIES.map((entry) => [
    entry.keyword,
    createKeywordMarkdown(entry),
  ]),
);

export const HOVER_KEYWORDS: readonly string[] = HOVER_DOC_ENTRIES.map(
  (entry) => entry.keyword,
);
