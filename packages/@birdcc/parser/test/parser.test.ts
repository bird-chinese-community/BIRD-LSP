import { describe, expect, it } from "vitest";
import { parseBirdConfig } from "../src/index.js";

describe("@birdcc/parser tree-sitter", () => {
  it("builds top-level DSL declarations", async () => {
    const sample = `
      include "base.conf";

      template bgp edge_tpl {
      }

      protocol bgp edge from edge_tpl {
        local as 65001;
      }

      filter export_policy {
        accept;
      }

      function is_ok() -> bool {
        return true;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const kinds = parsed.program.declarations.map((item) => item.kind);

    expect(kinds).toEqual([
      "include",
      "template",
      "protocol",
      "filter",
      "function",
    ]);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bgp");
      expect(protocol.name).toBe("edge");
      expect(protocol.fromTemplate).toBe("edge_tpl");
    }
  });

  it("parses template inheritance via from clause", async () => {
    const sample = `
      template bgp base_tpl {
      }

      template bgp edge_tpl from base_tpl {
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const templates = parsed.program.declarations.filter(
      (item) => item.kind === "template",
    );
    expect(templates).toHaveLength(2);

    const edgeTemplate = templates[1];
    if (edgeTemplate?.kind === "template") {
      expect(edgeTemplate.name).toBe("edge_tpl");
      expect(edgeTemplate.fromTemplate).toBe("base_tpl");
    }
  });

  it("parses router id and table declarations", async () => {
    const sample = `
      router id 192.0.2.1;
      router id 12345;
      router id from routing;
      router id 999.0.0.1;
      routing table master;
      ipv4 table edge4;
      vpn4 table core attrs (extended, foo);
      aspa table aspa_table;
    `;

    const parsed = await parseBirdConfig(sample);

    const routerDeclarations = parsed.program.declarations.filter(
      (item) => item.kind === "router-id",
    );
    const tableDeclarations = parsed.program.declarations.filter(
      (item) => item.kind === "table",
    );

    expect(routerDeclarations).toHaveLength(4);
    expect(tableDeclarations).toHaveLength(4);

    const firstRouter = routerDeclarations[0];
    if (firstRouter?.kind === "router-id") {
      expect(firstRouter.valueKind).toBe("ip");
      expect(firstRouter.value).toBe("192.0.2.1");
    }

    const fromRouter = routerDeclarations[2];
    if (fromRouter?.kind === "router-id") {
      expect(fromRouter.valueKind).toBe("from");
      expect(fromRouter.fromSource).toBe("routing");
    }

    const invalidRouter = routerDeclarations[3];
    if (invalidRouter?.kind === "router-id") {
      expect(invalidRouter.valueKind).toBe("unknown");
      expect(invalidRouter.value).toBe("999.0.0.1");
    }

    const vpnTable = tableDeclarations[2];
    if (vpnTable?.kind === "table") {
      expect(vpnTable.tableType).toBe("vpn4");
      expect(vpnTable.name).toBe("core");
      expect(vpnTable.attrsText).toContain("extended");
    }

    const aspaTable = tableDeclarations[3];
    if (aspaTable?.kind === "table") {
      expect(aspaTable.tableType).toBe("aspa");
      expect(aspaTable.name).toBe("aspa_table");
    }
  });

  it("parses graceful restart wait declarations", async () => {
    const parsed = await parseBirdConfig(`
      router id 192.0.2.1;
      graceful restart wait 120;
    `);

    const declarations = parsed.program.declarations;
    const gracefulRestartWait = declarations.find(
      (item) => item.kind === "graceful-restart-wait",
    );

    expect(gracefulRestartWait).toMatchObject({
      kind: "graceful-restart-wait",
      value: "120",
    });
    expect(declarations.some((item) => item.kind === "router-id")).toBe(true);
  });

  it("parses hostname override declarations", async () => {
    const parsed = await parseBirdConfig(`
      router id 192.0.2.1;
      hostname "edge-r1";
    `);

    const declarations = parsed.program.declarations;
    const hostname = declarations.find(
      (item) => item.kind === "hostname-override",
    );

    expect(hostname).toMatchObject({
      kind: "hostname-override",
      value: "edge-r1",
      valueText: '"edge-r1"',
    });
    expect(declarations.some((item) => item.kind === "router-id")).toBe(true);
  });

  it("parses table option blocks", async () => {
    const parsed = await parseBirdConfig(`
      roa4 table roa4_opts {
        trie yes;
        gc threshold 10000;
        gc period 300 s;
      };

      roa6 table roa6_opts {
        trie on;
        min settle time 1 s;
        max settle time 5 s;
      };

      ipv4 table bird3_opts {
        sorted on;
        debug { routes, filters };
        cork threshold 10 100;
        export settle time 2 s;
        route refresh export settle time 3 s;
        digest settle time 4 s;
        thread group worker;
      };
    `);

    const tables = parsed.program.declarations.filter(
      (item) => item.kind === "table",
    );

    expect(tables).toHaveLength(3);
    const [roa4, roa6, bird3] = tables;

    expect(roa4).toBeDefined();
    if (roa4?.kind === "table") {
      expect(roa4.bodyText).toContain("trie yes");
      expect(roa4.entries).toMatchObject([
        { kind: "trie", value: true, valueText: "yes" },
        { kind: "gc-threshold", value: "10000" },
        { kind: "gc-period", value: "300 s" },
      ]);
    }

    expect(roa6).toBeDefined();
    if (roa6?.kind === "table") {
      expect(roa6.entries).toMatchObject([
        { kind: "trie", value: true, valueText: "on" },
        { kind: "settle-time", option: "min", value: "1 s" },
        { kind: "settle-time", option: "max", value: "5 s" },
      ]);
    }

    expect(bird3).toBeDefined();
    if (bird3?.kind === "table") {
      expect(bird3.entries).toMatchObject([
        { kind: "sorted", value: true, valueText: "on" },
        { kind: "debug", clauseText: "{ routes, filters }" },
        { kind: "cork-threshold", low: "10", high: "100" },
        { kind: "settle-time", option: "export", value: "2 s" },
        {
          kind: "settle-time",
          option: "route-refresh-export",
          value: "3 s",
        },
        { kind: "settle-time", option: "digest", value: "4 s" },
        { kind: "thread-group", name: "worker" },
      ]);
      expect(
        bird3.entries.some(
          (item) =>
            item.kind === "other" &&
            /\b(sorted|debug|cork threshold|thread group)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("recognizes all supported table type declarations", async () => {
    const sample = `
      routing table t_routing;
      ipv4 table t_ipv4;
      ipv6 table t_ipv6;
      ipv4-mpls table t_ipv4_mpls;
      ipv6-mpls table t_ipv6_mpls;
      vpn4 table t_vpn4;
      vpn6 table t_vpn6;
      vpn4-mpls table t_vpn4_mpls;
      vpn6-mpls table t_vpn6_mpls;
      roa4 table t_roa4;
      roa6 table t_roa6;
      aspa table t_aspa;
      mpls table t_mpls;
      eth table t_eth;
      evpn table t_evpn;
      neighbor table t_neighbor;
      ipv6 sadr table t_ipv6_sadr;
      flow4 table t_flow4;
      flow6 table t_flow6;
    `;

    const parsed = await parseBirdConfig(sample);
    const tables = parsed.program.declarations.filter(
      (item) => item.kind === "table",
    );

    const tableTypes = tables.map((item) =>
      item.kind === "table" ? item.tableType : "unknown",
    );

    expect(tableTypes).toEqual([
      "routing",
      "ipv4",
      "ipv6",
      "ipv4-mpls",
      "ipv6-mpls",
      "vpn4",
      "vpn6",
      "vpn4-mpls",
      "vpn6-mpls",
      "roa4",
      "roa6",
      "aspa",
      "mpls",
      "eth",
      "evpn",
      "neighbor",
      "ipv6-sadr",
      "flow4",
      "flow6",
    ]);
    expect(tableTypes).not.toContain("unknown");
  });

  it("parses custom route attribute declarations", async () => {
    const parsed = await parseBirdConfig(`
      attribute int valid_roa;
      attribute bgppath seen_path;
      attribute prefix set reachable_prefixes;
    `);

    expect(parsed.issues).toHaveLength(0);

    const attributes = parsed.program.declarations.filter(
      (item) => item.kind === "attribute",
    );

    expect(attributes).toHaveLength(3);
    expect(attributes.map((item) => item.attributeType)).toEqual([
      "int",
      "bgppath",
      "prefix set",
    ]);
    expect(attributes.map((item) => item.name)).toEqual([
      "valid_roa",
      "seen_path",
      "reachable_prefixes",
    ]);
  });

  it("parses MPLS domain declarations", async () => {
    const parsed = await parseBirdConfig(`
      mpls domain mdom {
        label range static {
          start 1000;
          length 100;
        };
      }
      mpls domain backup;
    `);

    expect(parsed.issues).toHaveLength(0);

    const domains = parsed.program.declarations.filter(
      (item) => item.kind === "mpls-domain",
    );

    expect(domains).toHaveLength(2);
    expect(domains.map((item) => item.name)).toEqual(["mdom", "backup"]);
    expect(domains[0]?.bodyText).toContain("label range static");
    expect(domains[1]?.bodyText).toBeUndefined();
  });

  it("extracts protocol common statements and channel entries", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        import all;
        export filter policy_out;
        ipv4 {
          table master4;
          import none;
          export where net.len <= 24;
          import limit 1000 action block;
          preference 120;
          rpki reload yes;
          debug all;
          import keep filtered on;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const localAs = protocol.statements.find(
        (item) => item.kind === "local-as",
      );
      const neighbor = protocol.statements.find(
        (item) => item.kind === "neighbor",
      );
      const importStatement = protocol.statements.find(
        (item) => item.kind === "import",
      );
      const exportStatement = protocol.statements.find(
        (item) => item.kind === "export",
      );
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );

      expect(localAs?.kind).toBe("local-as");
      expect(neighbor?.kind).toBe("neighbor");
      expect(importStatement?.kind).toBe("import");
      if (importStatement?.kind === "import") {
        expect(importStatement.mode).toBe("all");
      }

      expect(exportStatement?.kind).toBe("export");
      if (exportStatement?.kind === "export") {
        expect(exportStatement.mode).toBe("filter");
        expect(exportStatement.filterName).toBe("policy_out");
      }

      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        expect(channel.channelType).toBe("ipv4");
        expect(channel.entries.some((item) => item.kind === "table")).toBe(
          true,
        );
        expect(
          channel.entries.some(
            (item) => item.kind === "import" && item.mode === "none",
          ),
        ).toBe(true);
        expect(
          channel.entries.some(
            (item) => item.kind === "export" && item.mode === "where",
          ),
        ).toBe(true);
        expect(channel.entries.some((item) => item.kind === "limit")).toBe(
          true,
        );
        expect(
          channel.entries.some(
            (item) => item.kind === "preference" && item.value === "120",
          ),
        ).toBe(true);
        expect(
          channel.entries.some(
            (item) => item.kind === "rpki-reload" && item.value === "yes",
          ),
        ).toBe(true);
        expect(channel.entries.some((item) => item.kind === "debug")).toBe(
          true,
        );
        expect(
          channel.entries.some((item) => item.kind === "keep-filtered"),
        ).toBe(true);
      }
    }
  });

  it("parses RIP top-level protocol options", async () => {
    const parsed = await parseBirdConfig(`
      protocol rip rip0 {
        ecmp yes limit 8;
        infinity 16;
        ipv4 {
          table master4;
        };
      }
    `);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "rip-option", option: "ecmp", value: true, valueText: "yes" },
        { kind: "rip-option", option: "infinity", value: "16" },
        { kind: "channel", channelType: "ipv4" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" && /\b(ecmp|infinity)\b/u.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses RIP interface option blocks", async () => {
    const parsed = await parseBirdConfig(`
      protocol rip rip0 {
        interface "eth0" {
          metric 2;
          mode multicast;
          split horizon no;
          ecmp weight 4;
        };
      }
    `);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        {
          kind: "rip-interface",
          patterns: ["eth0"],
          entries: [
            { kind: "metric", value: "2" },
            { kind: "mode", value: "multicast" },
            { kind: "split-horizon", value: false, valueText: "no" },
            { kind: "ecmp-weight", value: "4" },
          ],
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(metric|mode multicast|split horizon|ecmp weight)\b/u.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses RIP interface address, timers and authentication options", async () => {
    const parsed = await parseBirdConfig(`
      protocol rip rip0 {
        interface "eth1" {
          passive yes;
          address 192.0.2.1;
          port 520;
          version 2;
          version only yes;
          update time 30;
          timeout time 180;
          garbage time 240;
          retransmit time 5 s;
          rx buffer 1024;
          tx length 1024;
          tx dscp 48;
          tx priority 7;
          ttl security tx only;
          authentication cryptographic;
        };
      }
    `);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        {
          kind: "rip-interface",
          patterns: ["eth1"],
          entries: [
            { kind: "passive", value: true, valueText: "yes" },
            { kind: "address", value: "192.0.2.1", addressKind: "ip" },
            { kind: "port", value: "520" },
            { kind: "version", value: "2" },
            { kind: "version-only", value: true, valueText: "yes" },
            { kind: "timer", option: "update-time", value: "30" },
            { kind: "timer", option: "timeout-time", value: "180" },
            { kind: "timer", option: "garbage-time", value: "240" },
            { kind: "timer", option: "retransmit-time", value: "5 s" },
            { kind: "buffer", option: "rx-buffer", value: "1024" },
            { kind: "tx", option: "tx-length", value: "1024" },
            { kind: "tx", option: "tx-dscp", value: "48" },
            { kind: "tx", option: "tx-priority", value: "7" },
            { kind: "ttl-security", value: "tx-only" },
            { kind: "authentication", value: "cryptographic" },
          ],
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(address|update time|authentication cryptographic)\b/u.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses protocol metadata and VRF statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        disabled;
        disabled off;
        description "edge transit peer";
        hostname "router-a";
        vrf "blue";
        vrf default;
        restart time 30 s;
        debug all;
        mrtdump messages;
        router id 192.0.2.1;
        thread group worker;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "disabled", value: true },
        { kind: "disabled", value: false, valueText: "off" },
        { kind: "description", value: "edge transit peer" },
        { kind: "hostname", value: "router-a" },
        { kind: "vrf", mode: "named", name: "blue" },
        { kind: "vrf", mode: "default" },
        { kind: "restart-time", value: "30 s" },
        { kind: "debug", clauseText: "all" },
        { kind: "mrtdump", maskText: "messages" },
        { kind: "protocol-router-id", value: "192.0.2.1" },
        { kind: "thread-group", name: "worker" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(disabled|description|hostname|vrf|restart time|debug|mrtdump|router id|thread group)\b/.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses BGP timing and source address statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        hold time 90;
        min hold time 3;
        startup hold time 240;
        connect delay time 5;
        connect retry time 30;
        keepalive time 30;
        min keepalive time 10;
        send hold time 120;
        error forget time 300;
        error wait time 5, 60;
        source address 192.0.2.10;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "bgp-timer", option: "hold-time", value: "90" },
        { kind: "bgp-timer", option: "min-hold-time", value: "3" },
        { kind: "bgp-timer", option: "startup-hold-time", value: "240" },
        { kind: "bgp-timer", option: "connect-delay-time", value: "5" },
        { kind: "bgp-timer", option: "connect-retry-time", value: "30" },
        { kind: "bgp-timer", option: "keepalive-time", value: "30" },
        { kind: "bgp-timer", option: "min-keepalive-time", value: "10" },
        { kind: "bgp-timer", option: "send-hold-time", value: "120" },
        { kind: "bgp-timer", option: "error-forget-time", value: "300" },
        { kind: "bgp-timer", option: "error-wait-time", value: "5, 60" },
        {
          kind: "source-address",
          address: "192.0.2.10",
          addressKind: "ip",
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(hold time|min hold time|startup hold time|connect delay time|connect retry time|keepalive time|min keepalive time|send hold time|error forget time|error wait time|source address)\b/.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses common BGP session option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        rr client yes;
        strict bind yes;
        passive no;
        allow local as 2;
        bfd graceful;
        ttl security on;
        check link off;
        enforce first as yes;
        local role provider;
        require roles no;
        disable rx yes;
        tx size warning 4096;
        interface "eth1";
        interface range "ix*";
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "bgp-option", option: "rr-client", value: true },
        { kind: "bgp-option", option: "strict-bind", value: true },
        { kind: "bgp-option", option: "passive", value: false },
        { kind: "bgp-option", option: "allow-local-as", value: "2" },
        { kind: "bgp-option", option: "bfd", value: "graceful" },
        { kind: "bgp-option", option: "ttl-security", value: true },
        { kind: "bgp-option", option: "check-link", value: false },
        { kind: "bgp-option", option: "enforce-first-as", value: true },
        { kind: "bgp-option", option: "local-role", value: "provider" },
        { kind: "bgp-option", option: "require-roles", value: false },
        { kind: "bgp-option", option: "disable-rx", value: true },
        { kind: "bgp-option", option: "tx-size-warning", value: "4096" },
        { kind: "interface", mode: "single", patterns: ["eth1"] },
        { kind: "interface", mode: "range", patterns: ["ix*"] },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(rr client|strict bind|passive|allow local as|bfd graceful|ttl security|check link|enforce first as|local role|require roles|disable rx|tx size warning|interface)\b/.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses BGP capability negotiation statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        enable route refresh yes;
        enable enhanced route refresh no;
        enable as4 yes;
        enable extended messages off;
        advertise hostname on;
        require route refresh yes;
        require enhanced route refresh no;
        require as4 yes;
        require extended messages yes;
        require hostname no;
        require graceful restart yes;
        require long lived graceful restart off;
        capabilities no;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        {
          kind: "bgp-capability",
          mode: "enable",
          option: "route-refresh",
          value: true,
        },
        {
          kind: "bgp-capability",
          mode: "enable",
          option: "enhanced-route-refresh",
          value: false,
        },
        { kind: "bgp-capability", mode: "enable", option: "as4", value: true },
        {
          kind: "bgp-capability",
          mode: "enable",
          option: "extended-messages",
          value: false,
        },
        {
          kind: "bgp-capability",
          mode: "advertise",
          option: "hostname",
          value: true,
        },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "route-refresh",
          value: true,
        },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "enhanced-route-refresh",
          value: false,
        },
        { kind: "bgp-capability", mode: "require", option: "as4", value: true },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "extended-messages",
          value: true,
        },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "hostname",
          value: false,
        },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "graceful-restart",
          value: true,
        },
        {
          kind: "bgp-capability",
          mode: "require",
          option: "long-lived-graceful-restart",
          value: false,
        },
        {
          kind: "bgp-capability",
          mode: "capabilities",
          option: "all",
          value: false,
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(enable|require|advertise hostname|capabilities)\b/.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses BGP authentication statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        authentication ao;
        password "shared-secret";
        setkey yes;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "bgp-authentication", authType: "ao" },
        {
          kind: "bgp-password",
          value: "shared-secret",
          valueText: '"shared-secret"',
        },
        { kind: "bgp-setkey", value: true },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(authentication|password|setkey)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses BGP TCP-AO key blocks", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        authentication ao;
        keys {
          key {
            id 7;
            algorithm hmac sha256;
            secret "shared";
            preferred;
          };
          key {
            send id 8;
            recv id 9;
            algorithm cmac aes128;
            secret 0x001122;
            deprecated;
          };
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const keys = protocol.statements.find(
        (item) => item.kind === "bgp-tcp-ao-keys",
      );
      expect(keys).toEqual(
        expect.objectContaining({
          kind: "bgp-tcp-ao-keys",
          keys: [
            expect.objectContaining({
              id: "7",
              algorithm: "hmac sha256",
              secret: "shared",
              secretText: '"shared"',
              preference: "preferred",
            }),
            expect.objectContaining({
              sendId: "8",
              recvId: "9",
              algorithm: "cmac aes128",
              secret: "0x001122",
              secretText: "0x001122",
              preference: "deprecated",
            }),
          ],
        }),
      );
      expect(
        protocol.statements.some(
          (item) => item.kind === "other" && /\bkeys\s*\{/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses BGP hop mode statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge {
        multihop;
        multihop 8;
        direct;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "bgp-hop-mode", mode: "multihop" },
        { kind: "bgp-hop-mode", mode: "multihop", ttl: "8" },
        { kind: "bgp-hop-mode", mode: "direct" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" && /\b(multihop|direct)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses MRT protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol mrt dump_v4 {
        table master4;
        filename "/tmp/bird-%N.mrt";
        period 300;
        always add path yes;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("mrt");
      expect(protocol.statements).toMatchObject([
        { kind: "mrt-option", option: "table", value: "master4" },
        {
          kind: "mrt-option",
          option: "filename",
          value: "/tmp/bird-%N.mrt",
          valueText: '"/tmp/bird-%N.mrt"',
        },
        { kind: "mrt-option", option: "period", value: "300" },
        { kind: "mrt-option", option: "always-add-path", value: true },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(table|filename|period|always add path)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses BIRD2 Perf protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol perf perf_import {
        mode export;
        repeat 4;
        exp from 10;
        exp to 20;
        threshold min 1 ms;
        threshold max 500 ms;
        attributes 3;
        keep yes;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("perf");
      expect(protocol.statements).toMatchObject([
        { kind: "perf-option", option: "mode", value: "export" },
        { kind: "perf-option", option: "repeat", value: "4" },
        { kind: "perf-option", option: "exp-from", value: "10" },
        { kind: "perf-option", option: "exp-to", value: "20" },
        { kind: "perf-option", option: "threshold-min", value: "1 ms" },
        { kind: "perf-option", option: "threshold-max", value: "500 ms" },
        { kind: "perf-option", option: "attributes", value: "3" },
        { kind: "perf-option", option: "keep", value: true },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(mode|repeat|exp|threshold|attributes|keep)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses aggregator protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol aggregator agr_sample {
        table master4;
        export all;
        aggregate on net, bgp_path.len;
        merge by {
          accept;
        };
        import all;
        peer table agr_result;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("aggregator");
      expect(protocol.statements).toMatchObject([
        { kind: "aggregator-option", option: "table", value: "master4" },
        { kind: "export", mode: "all" },
        {
          kind: "aggregator-option",
          option: "aggregate-on",
          value: "net, bgp_path.len",
        },
        {
          kind: "aggregator-option",
          option: "merge-by",
          bodyText: "{\n          accept;\n        }",
        },
        { kind: "import", mode: "all" },
        {
          kind: "aggregator-option",
          option: "peer-table",
          value: "agr_result",
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(table|aggregate on|merge by|peer table)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses pipe protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol pipe pipe_refresh {
        peer table master4;
        max generation 32;
        import in 192.0.2.0/24 all;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("pipe");
      expect(protocol.statements).toMatchObject([
        { kind: "pipe-option", option: "peer-table", value: "master4" },
        { kind: "pipe-option", option: "max-generation", value: "32" },
        {
          kind: "pipe-import-in",
          network: "192.0.2.0/24",
          mode: "all",
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(peer table|max generation|import in)\b/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses BMP protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bmp collector {
        local address 192.0.2.1;
        station address 192.0.2.10 port 1790;
        system description "edge collector";
        system name "rr-1";
        monitoring rib in pre_policy yes;
        monitoring rib in post_policy no;
        tx buffer limit 64;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bmp");
      expect(protocol.statements).toMatchObject([
        { kind: "bmp-option", option: "local-address", value: "192.0.2.1" },
        {
          kind: "bmp-option",
          option: "station-address",
          value: "192.0.2.10",
          port: "1790",
        },
        {
          kind: "bmp-option",
          option: "system-description",
          value: "edge collector",
          valueText: '"edge collector"',
        },
        {
          kind: "bmp-option",
          option: "system-name",
          value: "rr-1",
          valueText: '"rr-1"',
        },
        {
          kind: "bmp-option",
          option: "monitoring-rib-in-pre-policy",
          value: true,
        },
        {
          kind: "bmp-option",
          option: "monitoring-rib-in-post-policy",
          value: false,
        },
        { kind: "bmp-option", option: "tx-buffer-limit", value: "64" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "rpki-local-address" ||
            (item.kind === "other" &&
              /\b(local address|station address|system description|system name|monitoring rib in|tx buffer limit)\b/.test(
                item.text,
              )),
        ),
      ).toBe(false);
    }
  });

  it("parses BFD protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bfd edge_bfd {
        accept ipv4 direct;
        accept ipv6 multihop;
        strict bind yes;
        zero udp6 checksum rx on;
        express thread group fast;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bfd");
      expect(protocol.statements).toMatchObject([
        {
          kind: "bfd-option",
          option: "accept",
          families: ["ipv4"],
          sessionTypes: ["direct"],
        },
        {
          kind: "bfd-option",
          option: "accept",
          families: ["ipv6"],
          sessionTypes: ["multihop"],
        },
        { kind: "bfd-option", option: "strict-bind", value: true },
        {
          kind: "bfd-option",
          option: "zero-udp6-checksum-rx",
          value: true,
        },
        { kind: "bfd-option", option: "express-thread-group", name: "fast" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "bgp-option" ||
            item.kind === "bgp-hop-mode" ||
            (item.kind === "other" &&
              /\b(accept|strict bind|zero udp6 checksum rx|express thread group)\b/.test(
                item.text,
              )),
        ),
      ).toBe(false);
    }
  });

  it("parses BFD neighbor and profile statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol bfd edge_bfd {
        interface "eth*" {
          interval 50 ms;
          min rx interval 20 ms;
          min tx interval 30 ms;
          idle tx interval 1 s;
          multiplier 5;
          passive no;
          authentication keyed md5;
          password "secret";
        };
        multihop {
          graceful;
          passive yes;
        };
        neighbor 192.0.2.1 dev "eth0";
        neighbor 203.0.113.1 local 192.0.2.2 multihop on;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bfd");
      expect(protocol.statements).toMatchObject([
        {
          kind: "bfd-profile",
          profileType: "interface",
          patterns: ["eth*"],
          entries: [
            { kind: "timer", option: "interval", value: "50 ms" },
            { kind: "timer", option: "min-rx-interval", value: "20 ms" },
            { kind: "timer", option: "min-tx-interval", value: "30 ms" },
            { kind: "timer", option: "idle-tx-interval", value: "1 s" },
            { kind: "multiplier", value: "5" },
            { kind: "passive", value: false },
            { kind: "authentication", authType: "keyed md5" },
            { kind: "password", value: "secret" },
          ],
        },
        {
          kind: "bfd-profile",
          profileType: "multihop",
          entries: [{ kind: "graceful" }, { kind: "passive", value: true }],
        },
        {
          kind: "bfd-neighbor",
          address: "192.0.2.1",
          interface: "eth0",
          interfaceSyntax: "dev",
        },
        {
          kind: "bfd-neighbor",
          address: "203.0.113.1",
          localAddress: "192.0.2.2",
          multihop: true,
        },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "neighbor" ||
            item.kind === "bgp-hop-mode" ||
            (item.kind === "other" &&
              /\b(interface|multihop|neighbor|interval|authentication|password)\b/.test(
                item.text,
              )),
        ),
      ).toBe(false);
    }
  });

  it("parses L3VPN protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol l3vpn cust_vpn {
        rd 65000:10;
        route distinguisher 65000:11;
        import target all;
        export target [(rt, 65000, 100), (rt, 65000, 101)];
        route target none;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("l3vpn");
      expect(protocol.statements).toMatchObject([
        { kind: "vpn-option", option: "rd", value: "65000:10" },
        {
          kind: "vpn-option",
          option: "route-distinguisher",
          value: "65000:11",
        },
        { kind: "vpn-option", option: "import-target", value: "all" },
        {
          kind: "vpn-option",
          option: "export-target",
          value: "[(rt, 65000, 100), (rt, 65000, 101)]",
        },
        { kind: "vpn-option", option: "route-target", value: "none" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            (item.kind === "import" || item.kind === "export") &&
            item.mode === "other",
        ),
      ).toBe(false);
    }
  });

  it("parses EVPN protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol evpn fabric_evpn {
        rd 65000:20;
        import target [(rt, 65000, 200)];
        export target (rt, 65000, 201);
        route target [(rt, 65000, 202)];
        vni 10020;
        vid 20;
        tag 200020;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("evpn");
      expect(protocol.statements).toMatchObject([
        { kind: "vpn-option", option: "rd", value: "65000:20" },
        {
          kind: "vpn-option",
          option: "import-target",
          value: "[(rt, 65000, 200)]",
        },
        {
          kind: "vpn-option",
          option: "export-target",
          value: "(rt, 65000, 201)",
        },
        {
          kind: "vpn-option",
          option: "route-target",
          value: "[(rt, 65000, 202)]",
        },
        { kind: "vpn-option", option: "vni", value: "10020" },
        { kind: "vpn-option", option: "vid", value: "20" },
        { kind: "vpn-option", option: "tag", value: "200020" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            (item.kind === "import" || item.kind === "export") &&
            item.mode === "other",
        ),
      ).toBe(false);
    }
  });

  it("parses EVPN encapsulation blocks", async () => {
    const parsed = await parseBirdConfig(`
      protocol evpn fabric_evpn {
        encapsulation vxlan {
          tunnel device "vxlan100";
          router address 192.0.2.1;
          default yes;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("evpn");
      expect(protocol.statements).toContainEqual(
        expect.objectContaining({
          kind: "evpn-encapsulation",
          encapsulation: "vxlan",
          entries: expect.arrayContaining([
            expect.objectContaining({
              kind: "tunnel-device",
              value: "vxlan100",
            }),
            expect.objectContaining({
              kind: "router-address",
              address: "192.0.2.1",
              addressKind: "ip",
            }),
            expect.objectContaining({
              kind: "default",
              value: true,
            }),
          ]),
        }),
      );
    }
  });

  it("parses EVPN vlan statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol evpn fabric_evpn {
        vlan 20 {
          range 4;
          vni 10020;
          vid 20;
        };
        vlan 30;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("evpn");
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "evpn-vlan",
            id: "20",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "range",
                value: "4",
              }),
              expect.objectContaining({
                kind: "vni",
                value: "10020",
              }),
              expect.objectContaining({
                kind: "vid",
                value: "20",
              }),
            ]),
          }),
          expect.objectContaining({
            kind: "evpn-vlan",
            id: "30",
            entries: [],
          }),
        ]),
      );
    }
  });

  it("parses compound channel type phrases", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        ipv6 sadr {
          table t_ipv6_sadr;
        };
        ipv4 mpls {
          table t_ipv4_mpls;
        };
        ipv6 mpls {
          table t_ipv6_mpls;
        };
        vpn4 mpls {
          table t_vpn4_mpls;
        };
        vpn6 mpls {
          table t_vpn6_mpls;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channels = protocol.statements.filter(
        (item) => item.kind === "channel",
      );
      expect(channels.map((item) => item.channelType)).toEqual([
        "ipv6-sadr",
        "ipv4-mpls",
        "ipv6-mpls",
        "vpn4-mpls",
        "vpn6-mpls",
      ]);
      expect(
        channels.map((item) =>
          item.entries.find((entry) => entry.kind === "table"),
        ),
      ).toMatchObject([
        { kind: "table", tableName: "t_ipv6_sadr" },
        { kind: "table", tableName: "t_ipv4_mpls" },
        { kind: "table", tableName: "t_ipv6_mpls" },
        { kind: "table", tableName: "t_vpn4_mpls" },
        { kind: "table", tableName: "t_vpn6_mpls" },
      ]);
    }
  });

  it("parses MPLS channel entries", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        mpls {
          domain mdom;
          table mtab;
          label range bgprange;
          label policy aggregate;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );
      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        expect(channel.entries).toMatchObject([
          { kind: "domain", domainName: "mdom" },
          { kind: "table", tableName: "mtab" },
          { kind: "label-range", range: "bgprange" },
          { kind: "label-policy", policy: "aggregate" },
        ]);
      }
    }
  });

  it("parses BGP-specific channel entries", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        ipv4 {
          gateway recursive;
          add paths rx;
          add paths tx;
          add paths off;
          require extended next hop on;
          require add paths yes;
          igp table master4;
          secondary;
          extended next hop on;
          import table yes;
          export table off;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );

      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        expect(channel.entries).toMatchObject([
          { kind: "gateway", mode: "recursive" },
          { kind: "add-paths", mode: "rx" },
          { kind: "add-paths", mode: "tx" },
          { kind: "add-paths", mode: "off" },
          {
            kind: "bgp-channel-require",
            option: "extended-next-hop",
            value: true,
          },
          {
            kind: "bgp-channel-require",
            option: "add-paths",
            value: true,
          },
          { kind: "igp-table", tableName: "master4" },
          { kind: "bgp-channel-option", option: "secondary", value: true },
          {
            kind: "bgp-channel-option",
            option: "extended-next-hop",
            value: true,
          },
          { kind: "bgp-channel-option", option: "import-table", value: true },
          { kind: "bgp-channel-option", option: "export-table", value: false },
        ]);
        expect(
          channel.entries.some(
            (item) =>
              item.kind === "other" &&
              /\b(gateway|add paths|require extended next hop|require add paths|igp table|secondary|extended next hop|import table|export table)\b/.test(
                item.text,
              ),
          ),
        ).toBe(false);
      }
    }
  });

  it("parses BGP channel next-hop modes and path attributes", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        ipv4 {
          next hop self ibgp;
          next hop keep ebgp;
          mandatory on;
          aigp on;
          aigp originate;
          cost MY_COST;
        };
        flow4 {
          validate on;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channels = protocol.statements.filter(
        (item) => item.kind === "channel",
      );

      expect(channels).toHaveLength(2);
      const [ipv4Channel, flow4Channel] = channels;

      expect(ipv4Channel?.kind).toBe("channel");
      if (ipv4Channel?.kind === "channel") {
        expect(ipv4Channel.entries).toMatchObject([
          {
            kind: "bgp-next-hop-mode",
            option: "self",
            mode: "ibgp",
            valueText: "ibgp",
          },
          {
            kind: "bgp-next-hop-mode",
            option: "keep",
            mode: "ebgp",
            valueText: "ebgp",
          },
          { kind: "bgp-channel-option", option: "mandatory", value: true },
          { kind: "bgp-aigp", enabled: true, valueText: "on" },
          { kind: "bgp-aigp", enabled: true, originate: true },
          { kind: "bgp-channel-cost", value: "MY_COST" },
        ]);
        expect(
          ipv4Channel.entries.some(
            (item) =>
              item.kind === "other" &&
              /\b(next hop|mandatory|aigp|cost)\b/.test(item.text),
          ),
        ).toBe(false);
      }

      expect(flow4Channel?.kind).toBe("channel");
      if (flow4Channel?.kind === "channel") {
        expect(flow4Channel.entries).toMatchObject([
          { kind: "bgp-channel-option", option: "validate", value: true },
        ]);
        expect(
          flow4Channel.entries.some(
            (item) => item.kind === "other" && /\bvalidate\b/.test(item.text),
          ),
        ).toBe(false);
      }
    }
  });

  it("parses BIRD3 BGP channel export settle time", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        ipv4 {
          export settle time 2 s;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );

      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        expect(channel.entries).toMatchObject([
          { kind: "bgp-export-settle-time", value: "2 s" },
        ]);
        expect(
          channel.entries.some(
            (item) =>
              item.kind === "other" &&
              /\bexport\s+settle\s+time\b/.test(item.text),
          ),
        ).toBe(false);
      }
    }
  });

  it("parses MPLS entries in compound MPLS channels", async () => {
    const parsed = await parseBirdConfig(`
      protocol bgp edge_peer {
        ipv4 mpls {
          domain mdom;
          table t_ipv4_mpls;
          label range bgprange;
          label policy aggregate;
        };
      }
    `);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );
      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        expect(channel.channelType).toBe("ipv4-mpls");
        expect(channel.entries).toMatchObject([
          { kind: "domain", domainName: "mdom" },
          { kind: "table", tableName: "t_ipv4_mpls" },
          { kind: "label-range", range: "bgprange" },
          { kind: "label-policy", policy: "aggregate" },
        ]);
      }
    }
  });

  it("parses static route statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol static static_routes {
        ipv4;
        route 192.0.2.0/24 via 198.51.100.1;
        route 198.51.100.0/24 blackhole;
        route 203.0.113.0/24 recursive 192.0.2.254;
        route aspa 65000 providers 64496, 64497;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const routes = protocol.statements.filter(
        (item) => item.kind === "static-route",
      );

      expect(routes).toMatchObject([
        {
          kind: "static-route",
          routeTarget: "192.0.2.0/24",
          destinationType: "via",
          nextHop: "198.51.100.1",
        },
        {
          kind: "static-route",
          routeTarget: "198.51.100.0/24",
          destinationType: "blackhole",
        },
        {
          kind: "static-route",
          routeTarget: "203.0.113.0/24",
          destinationType: "recursive",
          nextHop: "192.0.2.254",
        },
        {
          kind: "static-route",
          routeTarget: "aspa 65000",
          destinationType: "providers",
          optionsText: "64496 64497",
        },
      ]);
    }
  });

  it("parses static protocol options without BGP option fallback", async () => {
    const parsed = await parseBirdConfig(`
      protocol static static_routes {
        check link yes;
        igp table master4;
        route 192.0.2.0/24 via 198.51.100.1 dev "eth0" onlink yes weight 2 bfd no mpls 16000;
        route 198.51.100.0/24 via 192.0.2.1 bfd yes weight 1 via 192.0.2.2 weight 2;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "static-option", option: "check-link", value: true },
        { kind: "static-igp-table", tableName: "master4" },
        {
          kind: "static-route",
          routeTarget: "192.0.2.0/24",
          destinationType: "via",
          nextHop: "198.51.100.1",
          optionsText: 'dev "eth0" onlink yes weight 2 bfd no mpls 16000',
          options: [
            { kind: "dev", value: "eth0" },
            { kind: "onlink", value: true },
            { kind: "weight", value: "2" },
            { kind: "bfd", value: false },
            { kind: "mpls", value: "16000" },
          ],
        },
        {
          kind: "static-route",
          routeTarget: "198.51.100.0/24",
          destinationType: "via",
          nextHop: "192.0.2.1",
          nextHops: [
            {
              target: "192.0.2.1",
              options: [
                { kind: "bfd", value: true },
                { kind: "weight", value: "1" },
              ],
            },
            {
              target: "192.0.2.2",
              options: [{ kind: "weight", value: "2" }],
            },
          ],
        },
      ]);
      expect(
        protocol.statements.some(
          (item) => item.kind === "bgp-option" && item.option === "check-link",
        ),
      ).toBe(false);
    }
  });

  it("parses direct protocol options without BGP option fallback", async () => {
    const parsed = await parseBirdConfig(`
      protocol direct {
        interface "eth0";
        check link no;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("direct");
      expect(protocol.statements).toMatchObject([
        { kind: "interface", mode: "single", patterns: ["eth0"] },
        { kind: "direct-option", option: "check-link", value: false },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(check link|interface)\b/.test(item.text),
        ),
      ).toBe(false);
      expect(
        protocol.statements.some(
          (item) => item.kind === "bgp-option" && item.option === "check-link",
        ),
      ).toBe(false);
    }
  });

  it("parses scan time and kernel protocol options", async () => {
    const parsed = await parseBirdConfig(`
      protocol device {
        scan time 5;
        interface "eth0" {
          preferred 192.0.2.10;
          preferred 2001:db8::10;
        };
      }

      protocol kernel {
        scan time 20;
        learn;
        learn off;
        learn all;
        persist yes;
        graceful restart no;
        merge paths yes limit 8;
        kernel table 100;
        metric 10;
        netlink rx buffer 1M;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocols = parsed.program.declarations.filter(
      (item) => item.kind === "protocol",
    );
    const statements = protocols.flatMap((item) =>
      item.kind === "protocol" ? item.statements : [],
    );

    expect(statements).toMatchObject([
      { kind: "scan-time", value: "5" },
      {
        kind: "interface",
        mode: "single",
        patterns: ["eth0"],
        entries: [
          {
            kind: "preferred",
            address: "192.0.2.10",
            addressKind: "ip",
          },
          {
            kind: "preferred",
            address: "2001:db8::10",
            addressKind: "ip",
          },
        ],
      },
      { kind: "scan-time", value: "20" },
      { kind: "learn", mode: "on" },
      { kind: "learn", mode: "off" },
      { kind: "learn", mode: "all" },
      { kind: "kernel-option", option: "persist", value: true },
      { kind: "kernel-option", option: "graceful-restart", value: false },
      {
        kind: "kernel-option",
        option: "merge-paths",
        value: true,
        limit: "8",
      },
      { kind: "kernel-option", option: "kernel-table", value: "100" },
      { kind: "kernel-option", option: "metric", value: "10" },
      { kind: "kernel-option", option: "netlink-rx-buffer", value: "1M" },
    ]);
    expect(
      statements.some(
        (item) =>
          item.kind === "other" &&
          /\b(scan time|preferred|learn|persist|graceful restart|merge paths|kernel table|metric|netlink rx buffer)\b/.test(
            item.text,
          ),
      ),
    ).toBe(false);
  });

  it("parses bridge protocol options", async () => {
    const parsed = await parseBirdConfig(`
      protocol bridge br0 {
        bridge device "br0";
        vlan filtering yes;
        scan time 10 s;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bridge");
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "bridge-option",
            option: "bridge-device",
            value: "br0",
          }),
          expect.objectContaining({
            kind: "bridge-option",
            option: "vlan-filtering",
            value: true,
          }),
          expect.objectContaining({
            kind: "scan-time",
            value: "10 s",
          }),
        ]),
      );
    }
  });

  it("parses RPKI cache connection and timing statements", async () => {
    const parsed = await parseBirdConfig(`
      roa4 table rpki_roa4;

      protocol rpki rpki_tcp {
        remote "rpki-cache.example.net" port 3323;
        local address 192.0.2.10;
        transport tcp {
          authentication md5;
          password "shared-secret";
        };
        refresh keep 600;
        retry 60;
        expire keep 7200;
        ignore max length off;
        min version 1;
        max version 2;

        roa4 {
          table rpki_roa4;
          import all;
          export none;
          rpki reload yes;
        };
      }

      protocol rpki rpki_ssh {
        remote 2001:db8::10;
        port 8282;
        transport ssh {
          user "bird";
          bird private key "/etc/bird/rpki_key";
          remote public key "/etc/bird/rpki_cache.pub";
        };
        refresh 300;
        retry keep 30;
        expire 3600;
        ignore max length;
      }
    `);

    const protocols = parsed.program.declarations.filter(
      (item) => item.kind === "protocol" && item.protocolType === "rpki",
    );
    expect(protocols).toHaveLength(2);
    const [tcp, ssh] = protocols;

    expect(tcp).toBeDefined();
    if (tcp?.kind === "protocol") {
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-remote" &&
            item.address === "rpki-cache.example.net" &&
            item.addressKind === "hostname" &&
            item.port === "3323",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-local-address" &&
            item.address === "192.0.2.10" &&
            item.addressKind === "ip",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-transport" &&
            item.transport === "tcp" &&
            item.bodyText?.includes("authentication md5") &&
            item.entries?.some(
              (entry) =>
                entry.kind === "authentication" && entry.value === "md5",
            ) &&
            item.entries?.some(
              (entry) =>
                entry.kind === "password" && entry.value === "shared-secret",
            ),
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-timer" &&
            item.option === "refresh" &&
            item.keep === true &&
            item.value === "600",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-timer" &&
            item.option === "retry" &&
            item.keep === false &&
            item.value === "60",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-timer" &&
            item.option === "expire" &&
            item.keep === true &&
            item.value === "7200",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-ignore-max-length" &&
            item.value === false &&
            item.valueText === "off",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-version" &&
            item.option === "min" &&
            item.value === "1",
        ),
      ).toBe(true);
      expect(
        tcp.statements.some(
          (item) =>
            item.kind === "rpki-version" &&
            item.option === "max" &&
            item.value === "2",
        ),
      ).toBe(true);
    }

    expect(ssh).toBeDefined();
    if (ssh?.kind === "protocol") {
      expect(
        ssh.statements.some(
          (item) =>
            item.kind === "rpki-remote" &&
            item.address === "2001:db8::10" &&
            item.addressKind === "ip",
        ),
      ).toBe(true);
      expect(
        ssh.statements.some(
          (item) => item.kind === "rpki-port" && item.port === "8282",
        ),
      ).toBe(true);
      expect(
        ssh.statements.some(
          (item) =>
            item.kind === "rpki-transport" &&
            item.transport === "ssh" &&
            item.entries?.some(
              (entry) => entry.kind === "user" && entry.value === "bird",
            ) &&
            item.entries?.some(
              (entry) =>
                entry.kind === "bird-private-key" &&
                entry.value === "/etc/bird/rpki_key",
            ) &&
            item.entries?.some(
              (entry) =>
                entry.kind === "remote-public-key" &&
                entry.value === "/etc/bird/rpki_cache.pub",
            ),
        ),
      ).toBe(true);
      expect(
        ssh.statements.some(
          (item) =>
            item.kind === "rpki-ignore-max-length" && item.value === true,
        ),
      ).toBe(true);
    }
  });

  it("parses chained where expressions in protocol channels", async () => {
    const sample = `
      protocol babel edge {
        ipv4 {
          export where source != RTS_BGP && is_self_net();
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );
      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        const exportEntry = channel.entries.find(
          (item) => item.kind === "export",
        );
        expect(exportEntry?.kind).toBe("export");
        if (exportEntry?.kind === "export") {
          expect(exportEntry.mode).toBe("where");
          expect(exportEntry.whereExpression).toBe(
            "source != RTS_BGP && is_self_net()",
          );
        }
      }
    }
  });

  it("parses Babel protocol options without disturbing channels", async () => {
    const sample = `
      protocol babel edge {
        randomize router id yes;
        ipv4 {
          export where babel_metric < 128;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("babel");
      expect(protocol.name).toBe("edge");
      expect(protocol.statements).toContainEqual(
        expect.objectContaining({
          kind: "babel-option",
          option: "randomize-router-id",
          value: true,
          valueText: "yes",
        }),
      );

      const channel = protocol.statements.find(
        (item) => item.kind === "channel",
      );
      expect(channel?.kind).toBe("channel");
      if (channel?.kind === "channel") {
        const exportEntry = channel.entries.find(
          (item) => item.kind === "export",
        );
        expect(exportEntry?.kind).toBe("export");
        if (exportEntry?.kind === "export") {
          expect(exportEntry.mode).toBe("where");
          expect(exportEntry.whereExpression).toBe("babel_metric < 128");
        }
      }
    }
  });

  it("parses Babel interface options", async () => {
    const sample = `
      protocol babel edge {
        interface "eth0" {
          type wired;
          rxcost 96;
          hello interval 4 s;
          update interval 16 s;
          rx buffer 4096;
          tx length 1200;
          tx class 6;
          tx priority 7;
          check link no;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const iface = protocol.statements.find(
        (item) => item.kind === "babel-interface",
      );
      expect(iface).toEqual(
        expect.objectContaining({
          kind: "babel-interface",
          patterns: ["eth0"],
          entries: expect.arrayContaining([
            expect.objectContaining({ kind: "type", value: "wired" }),
            expect.objectContaining({ kind: "rxcost", value: "96" }),
            expect.objectContaining({
              kind: "timer",
              option: "hello-interval",
              value: "4 s",
            }),
            expect.objectContaining({
              kind: "timer",
              option: "update-interval",
              value: "16 s",
            }),
            expect.objectContaining({
              kind: "buffer",
              option: "rx-buffer",
              value: "4096",
            }),
            expect.objectContaining({ kind: "tx-length", value: "1200" }),
            expect.objectContaining({
              kind: "tx",
              option: "class",
              value: "6",
            }),
            expect.objectContaining({ kind: "tx-priority", value: "7" }),
            expect.objectContaining({ kind: "check-link", value: false }),
          ]),
        }),
      );
    }
  });

  it("parses Babel next-hop, authentication and RTT options", async () => {
    const sample = `
      protocol babel edge {
        interface "tun0" {
          type tunnel;
          next hop ipv4 192.0.2.1;
          next hop ipv6 2001:db8::1;
          next hop prefer native;
          extended next hop on;
          authentication mac permissive;
          password "secret";
          rtt min 10 ms;
          rtt max 300 ms;
          rtt cost 96;
          rtt decay 42;
          send timestamps yes;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const iface = protocol.statements.find(
        (item) => item.kind === "babel-interface",
      );
      expect(iface?.kind).toBe("babel-interface");
      if (iface?.kind === "babel-interface") {
        expect(iface.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "next-hop",
              family: "ipv4",
              address: "192.0.2.1",
              addressKind: "ip",
            }),
            expect.objectContaining({
              kind: "next-hop",
              family: "ipv6",
              address: "2001:db8::1",
              addressKind: "ip",
            }),
            expect.objectContaining({
              kind: "next-hop-prefer",
              value: "native",
            }),
            expect.objectContaining({
              kind: "extended-next-hop",
              value: true,
            }),
            expect.objectContaining({
              kind: "authentication",
              authType: "mac",
              permissive: true,
            }),
            expect.objectContaining({
              kind: "password",
              value: "secret",
            }),
            expect.objectContaining({
              kind: "rtt",
              option: "min",
              value: "10 ms",
            }),
            expect.objectContaining({
              kind: "rtt",
              option: "max",
              value: "300 ms",
            }),
            expect.objectContaining({
              kind: "rtt",
              option: "cost",
              value: "96",
            }),
            expect.objectContaining({
              kind: "rtt",
              option: "decay",
              value: "42",
            }),
            expect.objectContaining({
              kind: "send-timestamps",
              value: true,
            }),
          ]),
        );
      }
    }
  });

  it("preserves RADV interface body entries", async () => {
    const sample = `
      protocol radv ra1 {
        trigger 2001:db8:ffff::/64;
        propagate routes yes;

        interface "eth0" {
          min ra interval 3;
          max ra interval 30;
          min delay 1;
          solicited ra unicast yes;
          managed on;
          other config no;
          router discovery off;
          link mtu 1500;
          reachable time 30000;
          retrans timer 1000;
          current hop limit 64;
          default lifetime 90 sensitive yes;
          route lifetime 1800 sensitive no;
          prefix linger time 120;
          route linger time 240;
          default preference high;
          route preference low;
          rdnss local yes;
          dnssl local no;
          custom option local yes;
          rdnss {
            ns 2001:db8::53;
            lifetime mult 3;
          };
          rdnss 2001:db8::54;
          dnssl {
            domain "example.net";
            lifetime 600;
          };
          dnssl "example.org";
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-trigger",
            prefix: "2001:db8:ffff::/64",
          }),
          expect.objectContaining({
            kind: "radv-option",
            option: "propagate-routes",
            value: true,
          }),
        ]),
      );

      const iface = protocol.statements.find(
        (item) => item.kind === "radv-interface",
      );
      expect(iface).toEqual(
        expect.objectContaining({
          kind: "radv-interface",
          patterns: ["eth0"],
          entries: expect.arrayContaining([
            expect.objectContaining({
              kind: "timer",
              option: "max-ra-interval",
              value: "30",
            }),
            expect.objectContaining({
              kind: "timer",
              option: "min-ra-interval",
              value: "3",
            }),
            expect.objectContaining({
              kind: "timer",
              option: "min-delay",
              value: "1",
            }),
            expect.objectContaining({
              kind: "bool",
              option: "solicited-ra-unicast",
              value: true,
            }),
            expect.objectContaining({
              kind: "bool",
              option: "managed",
              value: true,
            }),
            expect.objectContaining({
              kind: "bool",
              option: "other-config",
              value: false,
            }),
            expect.objectContaining({
              kind: "bool",
              option: "router-discovery",
              value: false,
            }),
            expect.objectContaining({
              kind: "scalar",
              option: "link-mtu",
              value: "1500",
            }),
            expect.objectContaining({
              kind: "scalar",
              option: "reachable-time",
              value: "30000",
            }),
            expect.objectContaining({
              kind: "scalar",
              option: "retrans-timer",
              value: "1000",
            }),
            expect.objectContaining({
              kind: "scalar",
              option: "current-hop-limit",
              value: "64",
            }),
            expect.objectContaining({
              kind: "lifetime",
              option: "default-lifetime",
              value: "90",
              sensitive: true,
            }),
            expect.objectContaining({
              kind: "lifetime",
              option: "route-lifetime",
              value: "1800",
              sensitive: false,
            }),
            expect.objectContaining({
              kind: "linger-time",
              option: "prefix-linger-time",
              value: "120",
            }),
            expect.objectContaining({
              kind: "linger-time",
              option: "route-linger-time",
              value: "240",
            }),
            expect.objectContaining({
              kind: "preference",
              option: "default-preference",
              value: "high",
            }),
            expect.objectContaining({
              kind: "preference",
              option: "route-preference",
              value: "low",
            }),
            expect.objectContaining({
              kind: "local",
              option: "rdnss-local",
              value: true,
            }),
            expect.objectContaining({
              kind: "local",
              option: "dnssl-local",
              value: false,
            }),
            expect.objectContaining({
              kind: "local",
              option: "custom-option-local",
              value: true,
            }),
            expect.objectContaining({
              kind: "rdnss",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "ns",
                  value: "2001:db8::53",
                }),
                expect.objectContaining({
                  kind: "lifetime",
                  value: "3",
                  multiplier: true,
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "rdnss",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "ns",
                  value: "2001:db8::54",
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "dnssl",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "domain",
                  value: "example.net",
                }),
                expect.objectContaining({
                  kind: "lifetime",
                  value: "600",
                  multiplier: false,
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "dnssl",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "domain",
                  value: "example.org",
                }),
              ]),
            }),
          ]),
        }),
      );
    }
  });

  it("parses RADV interface declarations without option blocks", async () => {
    const sample = `
      protocol radv ra1 {
        interface "eth0";
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-interface",
            patterns: ["eth0"],
            entries: [],
          }),
        ]),
      );
    }
  });

  it("parses comma-separated RADV interface patterns", async () => {
    const sample = `
      protocol radv ra1 {
        interface "eth0", "eth1";
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol?.kind).toBe("protocol");
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-interface",
            patterns: ["eth0", "eth1"],
          }),
        ]),
      );
    }
  });

  it("parses RADV prefix blocks", async () => {
    const sample = `
      protocol radv ra1 {
        interface "eth0" {
          prefix 2001:db8:1::/64 {
            skip no;
            onlink yes;
            autonomous yes;
            pd preferred yes;
            valid lifetime 3600 sensitive yes;
            preferred lifetime 1800 sensitive no;
          };
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const iface = protocol.statements.find(
        (item) => item.kind === "radv-interface",
      );
      expect(iface?.kind).toBe("radv-interface");
      if (iface?.kind === "radv-interface") {
        expect(iface.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "prefix",
              prefix: "2001:db8:1::/64",
              entries: expect.arrayContaining([
                expect.objectContaining({ kind: "skip", value: false }),
                expect.objectContaining({ kind: "onlink", value: true }),
                expect.objectContaining({ kind: "autonomous", value: true }),
                expect.objectContaining({
                  kind: "pd-preferred",
                  value: true,
                }),
                expect.objectContaining({
                  kind: "lifetime",
                  option: "valid-lifetime",
                  value: "3600",
                  sensitive: true,
                }),
                expect.objectContaining({
                  kind: "lifetime",
                  option: "preferred-lifetime",
                  value: "1800",
                  sensitive: false,
                }),
              ]),
            }),
          ]),
        );
      }
    }
  });

  it("parses RADV lifetime expressions with whitespace", async () => {
    const sample = `
      protocol radv ra1 {
        interface "eth0" {
          default lifetime (30 + 60) sensitive yes;
          route lifetime (120 + 60) sensitive no;
          prefix 2001:db8:1::/64 {
            valid lifetime (3600 + 60) sensitive yes;
            preferred lifetime (1800 + 60) sensitive no;
          };
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol?.kind).toBe("protocol");
    if (protocol?.kind === "protocol") {
      const iface = protocol.statements.find(
        (item) => item.kind === "radv-interface",
      );
      expect(iface?.kind).toBe("radv-interface");
      if (iface?.kind === "radv-interface") {
        expect(iface.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "lifetime",
              option: "default-lifetime",
              value: "(30 + 60)",
              sensitive: true,
            }),
            expect.objectContaining({
              kind: "lifetime",
              option: "route-lifetime",
              value: "(120 + 60)",
              sensitive: false,
            }),
            expect.objectContaining({
              kind: "prefix",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "lifetime",
                  option: "valid-lifetime",
                  value: "(3600 + 60)",
                  sensitive: true,
                }),
                expect.objectContaining({
                  kind: "lifetime",
                  option: "preferred-lifetime",
                  value: "(1800 + 60)",
                  sensitive: false,
                }),
              ]),
            }),
          ]),
        );
      }
    }
  });

  it("parses RADV protocol prefix blocks", async () => {
    const sample = `
      protocol radv ra1 {
        prefix 2001:db8:2::/64 {
          skip no;
          valid lifetime 3600 sensitive yes;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-prefix",
            prefix: "2001:db8:2::/64",
            entries: expect.arrayContaining([
              expect.objectContaining({ kind: "skip", value: false }),
              expect.objectContaining({
                kind: "lifetime",
                option: "valid-lifetime",
                value: "3600",
                sensitive: true,
              }),
            ]),
          }),
        ]),
      );
    }
  });

  it("parses RADV protocol DNS blocks", async () => {
    const sample = `
      protocol radv ra1 {
        rdnss {
          ns 2001:db8::53;
          lifetime mult 3;
        };
        dnssl {
          domain "example.net";
          lifetime 600;
        };
        rdnss 2001:db8::54;
        dnssl "example.org";
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-dns",
            block: "rdnss",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "ns",
                value: "2001:db8::53",
              }),
              expect.objectContaining({
                kind: "lifetime",
                value: "3",
                multiplier: true,
              }),
            ]),
          }),
          expect.objectContaining({
            kind: "radv-dns",
            block: "dnssl",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "domain",
                value: "example.net",
              }),
              expect.objectContaining({
                kind: "lifetime",
                value: "600",
                multiplier: false,
              }),
            ]),
          }),
          expect.objectContaining({
            kind: "radv-dns",
            block: "rdnss",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "ns",
                value: "2001:db8::54",
              }),
            ]),
          }),
          expect.objectContaining({
            kind: "radv-dns",
            block: "dnssl",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "domain",
                value: "example.org",
              }),
            ]),
          }),
        ]),
      );
    }
  });

  it("parses RADV DNS lifetime expressions", async () => {
    const sample = `
      protocol radv ra1 {
        rdnss {
          ns 2001:db8::53;
          lifetime mult (2 + 1);
        };
        dnssl {
          domain "example.net";
          lifetime (600 + 60);
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol?.kind).toBe("protocol");
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-dns",
            block: "rdnss",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "lifetime",
                value: "(2 + 1)",
                multiplier: true,
              }),
            ]),
          }),
          expect.objectContaining({
            kind: "radv-dns",
            block: "dnssl",
            entries: expect.arrayContaining([
              expect.objectContaining({
                kind: "lifetime",
                value: "(600 + 60)",
                multiplier: false,
              }),
            ]),
          }),
        ]),
      );
    }
  });

  it("parses RADV custom option statements", async () => {
    const sample = `
      protocol radv ra1 {
        custom option type 42 value 0102;

        interface "eth0" {
          custom option type 99 value 0xCAFE;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-custom-option",
            optionType: "42",
            value: "0102",
          }),
        ]),
      );

      const iface = protocol.statements.find(
        (item) => item.kind === "radv-interface",
      );
      expect(iface?.kind).toBe("radv-interface");
      if (iface?.kind === "radv-interface") {
        expect(iface.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "custom-option",
              optionType: "99",
              value: "0xCAFE",
            }),
          ]),
        );
      }
    }
  });

  it("parses RADV custom option expressions", async () => {
    const sample = `
      protocol radv ra1 {
        custom option type (40 + 2) value hex:0e:10:20:01;

        interface "eth0" {
          custom option type (90 + 9) value hex:01:02:03;
        };
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol?.kind).toBe("protocol");
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "radv-custom-option",
            optionType: "(40 + 2)",
            value: "hex:0e:10:20:01",
          }),
        ]),
      );

      const iface = protocol.statements.find(
        (item) => item.kind === "radv-interface",
      );
      expect(iface?.kind).toBe("radv-interface");
      if (iface?.kind === "radv-interface") {
        expect(iface.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "custom-option",
              optionType: "(90 + 9)",
              value: "hex:01:02:03",
            }),
          ]),
        );
      }
    }
  });

  it("preserves generic protocol statements as other entries", async () => {
    const sample = `
      protocol ospf core {
        area 0;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const otherStatement = protocol.statements.find(
        (item) => item.kind === "other",
      );
      expect(otherStatement?.kind).toBe("other");
      if (otherStatement?.kind === "other") {
        expect(otherStatement.text.toLowerCase()).toContain("area");
      }
    }
  });

  it("parses OSPF protocol option statements", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf v3 core {
        rfc5838 yes;
        vpn pe no;
        stub router yes;
        graceful restart aware;
        graceful restart time 120;
        ecmp yes limit 8;
        merge external no;
        tick 2;
        instance id 64;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.statements).toMatchObject([
        { kind: "ospf-option", option: "rfc5838", value: true },
        { kind: "ospf-option", option: "vpn-pe", value: false },
        { kind: "ospf-option", option: "stub-router", value: true },
        {
          kind: "ospf-option",
          option: "graceful-restart-aware",
        },
        {
          kind: "ospf-option",
          option: "graceful-restart-time",
          value: "120",
        },
        {
          kind: "ospf-option",
          option: "ecmp",
          value: true,
          limit: "8",
        },
        { kind: "ospf-option", option: "merge-external", value: false },
        { kind: "ospf-option", option: "tick", value: "2" },
        { kind: "ospf-option", option: "instance-id", value: "64" },
      ]);
      expect(
        protocol.statements.some(
          (item) =>
            item.kind === "other" &&
            /\b(rfc5838|vpn pe|stub router|graceful restart|ecmp|merge external|tick|instance id)\b/.test(
              item.text,
            ),
        ),
      ).toBe(false);
    }
  });

  it("parses OSPF area scalar options", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf core {
        area 0 {
          stub no;
          nssa;
          summary yes;
          default nssa no;
          default cost 10;
          default cost2 20;
          stub cost 30;
          translator yes;
          translator stability 40;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const area = protocol.statements.find(
        (item) => item.kind === "ospf-area",
      );
      expect(area).toEqual(
        expect.objectContaining({
          kind: "ospf-area",
          areaId: "0",
          entries: expect.arrayContaining([
            expect.objectContaining({ kind: "stub", value: false }),
            expect.objectContaining({ kind: "nssa" }),
            expect.objectContaining({ kind: "summary", value: true }),
            expect.objectContaining({ kind: "default-nssa", value: false }),
            expect.objectContaining({ kind: "default-cost", value: "10" }),
            expect.objectContaining({ kind: "default-cost2", value: "20" }),
            expect.objectContaining({ kind: "stub-cost", value: "30" }),
            expect.objectContaining({ kind: "translator", value: true }),
            expect.objectContaining({
              kind: "translator-stability",
              value: "40",
            }),
          ]),
        }),
      );
      expect(
        protocol.statements.some(
          (item) => item.kind === "other" && /\barea\s+0\s*\{/.test(item.text),
        ),
      ).toBe(false);
    }
  });

  it("parses OSPF area interface options", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf core {
        area 0 {
          interface "eth0", "ix*" {
            cost 10;
            hello 5;
            retransmit 6;
            transmit delay 7;
            wait 8;
            dead 40;
            dead count 4;
            type ptp;
            priority 9;
            strict nonbroadcast yes;
            stub no;
            check link yes;
            ecmp weight 32;
            link lsa suppression no;
            authentication cryptographic;
            rx buffer large;
            tx priority 6;
            tx length 512;
            ttl security yes;
            bfd no;
            neighbors {
              192.0.2.1 eligible;
              192.0.2.2;
            };
            password "secret";
          };
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const area = protocol.statements.find(
        (item) => item.kind === "ospf-area",
      );
      expect(area?.kind).toBe("ospf-area");
      if (area?.kind === "ospf-area") {
        expect(area.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "interface",
              patterns: ["eth0", "ix*"],
              entries: expect.arrayContaining([
                expect.objectContaining({ kind: "cost", value: "10" }),
                expect.objectContaining({
                  kind: "timer",
                  option: "hello",
                  value: "5",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "dead-count",
                  value: "4",
                }),
                expect.objectContaining({ kind: "type", value: "ptp" }),
                expect.objectContaining({ kind: "priority", value: "9" }),
                expect.objectContaining({
                  kind: "strict-nonbroadcast",
                  value: true,
                }),
                expect.objectContaining({ kind: "stub", value: false }),
                expect.objectContaining({ kind: "check-link", value: true }),
                expect.objectContaining({ kind: "ecmp-weight", value: "32" }),
                expect.objectContaining({
                  kind: "link-lsa-suppression",
                  value: false,
                }),
                expect.objectContaining({
                  kind: "authentication",
                  value: "cryptographic",
                }),
                expect.objectContaining({ kind: "rx-buffer", value: "large" }),
                expect.objectContaining({
                  kind: "tx",
                  option: "priority",
                  value: "6",
                }),
                expect.objectContaining({
                  kind: "ttl-security",
                  value: true,
                }),
                expect.objectContaining({ kind: "bfd", value: false }),
                expect.objectContaining({
                  kind: "neighbors",
                  entries: expect.arrayContaining([
                    expect.objectContaining({
                      address: "192.0.2.1",
                      eligible: true,
                    }),
                    expect.objectContaining({
                      address: "192.0.2.2",
                      eligible: false,
                    }),
                  ]),
                }),
                expect.objectContaining({
                  kind: "other",
                  text: 'password "secret"',
                }),
              ]),
            }),
          ]),
        );
      }
    }
  });

  it("parses OSPF area interface header variants", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf core {
        area 0 {
          interface "eth0" instance 7 {
            real broadcast yes;
            ptp netmask no;
            ptp address yes;
            ttl security tx only;
          };
          interface "lo";
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const area = protocol.statements.find(
        (item) => item.kind === "ospf-area",
      );
      expect(area?.kind).toBe("ospf-area");
      if (area?.kind === "ospf-area") {
        expect(area.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "interface",
              patterns: ["eth0"],
              instanceId: "7",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "real-broadcast",
                  value: true,
                }),
                expect.objectContaining({
                  kind: "ptp-netmask",
                  value: false,
                }),
                expect.objectContaining({
                  kind: "ptp-address",
                  value: true,
                }),
                expect.objectContaining({
                  kind: "ttl-security",
                  value: "tx-only",
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "interface",
              patterns: ["lo"],
              entries: [],
            }),
          ]),
        );
        expect(
          area.entries.some(
            (item) =>
              item.kind === "other" &&
              /\b(real broadcast|ptp netmask|ptp address|ttl security tx only|interface "lo")\b/.test(
                item.text,
              ),
          ),
        ).toBe(false);
      }
    }
  });

  it("parses OSPF area virtual link options", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf core {
        area 1 {
          virtual link 192.0.2.1 instance 7 {
            hello 5;
            retransmit 6;
            transmit delay 7;
            wait 8;
            dead 40;
            dead count 4;
            authentication simple;
            password "secret";
          };
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const area = protocol.statements.find(
        (item) => item.kind === "ospf-area",
      );
      expect(area?.kind).toBe("ospf-area");
      if (area?.kind === "ospf-area") {
        expect(area.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "virtual-link",
              routerId: "192.0.2.1",
              instanceId: "7",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  kind: "timer",
                  option: "hello",
                  value: "5",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "retransmit",
                  value: "6",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "transmit-delay",
                  value: "7",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "wait",
                  value: "8",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "dead",
                  value: "40",
                }),
                expect.objectContaining({
                  kind: "timer",
                  option: "dead-count",
                  value: "4",
                }),
                expect.objectContaining({
                  kind: "authentication",
                  value: "simple",
                }),
                expect.objectContaining({
                  kind: "other",
                  text: 'password "secret"',
                }),
              ]),
            }),
          ]),
        );
        expect(
          area.entries.some(
            (item) =>
              item.kind === "other" && /\bvirtual\s+link\b/i.test(item.text),
          ),
        ).toBe(false);
      }
    }
  });

  it("parses OSPF area networks and stubnets", async () => {
    const parsed = await parseBirdConfig(`
      protocol ospf core {
        area 0 {
          networks {
            10.0.0.0/24;
            10.0.1.0/24 hidden;
            10.0.2.0/24 tag 65000;
          };
          external {
            192.0.2.0/24 tag 100;
          };
          stubnet 10.0.3.0/24 {
            hidden yes;
            summary no;
            cost 50;
          };
          stubnet 10.0.4.0/24;
        };
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const area = protocol.statements.find(
        (item) => item.kind === "ospf-area",
      );
      expect(area?.kind).toBe("ospf-area");
      if (area?.kind === "ospf-area") {
        expect(area.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "networks",
              entries: expect.arrayContaining([
                expect.objectContaining({ prefix: "10.0.0.0/24" }),
                expect.objectContaining({
                  prefix: "10.0.1.0/24",
                  hidden: true,
                }),
                expect.objectContaining({
                  prefix: "10.0.2.0/24",
                  tag: "65000",
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "external",
              entries: expect.arrayContaining([
                expect.objectContaining({
                  prefix: "192.0.2.0/24",
                  tag: "100",
                }),
              ]),
            }),
            expect.objectContaining({
              kind: "stubnet",
              prefix: "10.0.3.0/24",
              entries: expect.arrayContaining([
                expect.objectContaining({ kind: "hidden", value: true }),
                expect.objectContaining({ kind: "summary", value: false }),
                expect.objectContaining({ kind: "cost", value: "50" }),
              ]),
            }),
            expect.objectContaining({
              kind: "stubnet",
              prefix: "10.0.4.0/24",
              entries: [],
            }),
          ]),
        );
      }
    }
  });

  it("preserves multi-line protocol statements as a single other entry", async () => {
    const sample = `
      protocol ospf core {
        area 0
          stub;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const otherStatements = protocol.statements.filter(
        (item) => item.kind === "other",
      );
      expect(otherStatements).toHaveLength(1);
      const text =
        otherStatements[0]?.kind === "other" ? otherStatements[0].text : "";
      expect(text.toLowerCase()).toContain("area");
      expect(text.toLowerCase()).toContain("stub");
    }
  });

  it("keeps invalid neighbor IP as ip-like candidate for semantic validation", async () => {
    const sample = `
      protocol bgp edge_peer {
        neighbor 203.0.113.999 as 65002;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const neighbor = protocol.statements.find(
        (item) => item.kind === "neighbor",
      );
      expect(neighbor?.kind).toBe("neighbor");
      if (neighbor?.kind === "neighbor") {
        expect(neighbor.addressKind).toBe("ip");
      }
    }
  });

  it("extracts filter/function control statements, literals and match expressions", async () => {
    const sample = `
      function is_private() -> bool {
        if net ~ [ 10.0.0.0/8+, 2001:db8::/32{33,128} ] then return true;
        return false;
      }

      filter export_policy {
        if bgp_path ~ [= * 65003 * =] then reject;
        case net.type {
          NET_IP4: accept;
          else: reject;
        }
        accept;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const fn = parsed.program.declarations.find(
      (item) => item.kind === "function",
    );
    const filter = parsed.program.declarations.find(
      (item) => item.kind === "filter",
    );

    expect(fn).toBeDefined();
    if (fn?.kind === "function") {
      expect(fn.statements.some((item) => item.kind === "if")).toBe(true);
      expect(fn.statements.some((item) => item.kind === "return")).toBe(true);
      expect(fn.literals.some((item) => item.kind === "prefix")).toBe(true);
      expect(fn.matches.some((item) => item.operator === "~")).toBe(true);
    }

    expect(filter).toBeDefined();
    if (filter?.kind === "filter") {
      expect(filter.statements.some((item) => item.kind === "if")).toBe(true);
      expect(filter.statements.some((item) => item.kind === "case")).toBe(true);
      expect(filter.statements.some((item) => item.kind === "accept")).toBe(
        true,
      );
      expect(filter.statements.some((item) => item.kind === "reject")).toBe(
        true,
      );
      expect(filter.matches.some((item) => item.operator === "~")).toBe(true);
    }
  });

  it("extracts filter and function calls", async () => {
    const parsed = await parseBirdConfig(`
      roa4 table rpki_roa4;

      filter rpki_guard {
        if roa_check(rpki_roa4) = ROA_VALID then accept;
        if roa_check(rpki_roa4, net, bgp_path.last) = ROA_INVALID then reject;
        accept;
      }

      function assert_roa() {
        bt_assert(roa_check(rpki_roa4, net, bgp_path.last) = ROA_VALID);
        return true;
      }
    `);

    const filter = parsed.program.declarations.find(
      (item) => item.kind === "filter",
    );
    const fn = parsed.program.declarations.find(
      (item) => item.kind === "function",
    );

    expect(filter).toBeDefined();
    if (filter?.kind === "filter") {
      expect(filter.calls).toMatchObject([
        { name: "roa_check", argumentsText: "rpki_roa4" },
        { name: "roa_check", argumentsText: "rpki_roa4, net, bgp_path.last" },
      ]);
    }

    expect(fn).toBeDefined();
    if (fn?.kind === "function") {
      expect(fn.calls).toMatchObject([
        {
          name: "bt_assert",
          argumentsText: "roa_check(rpki_roa4, net, bgp_path.last) = ROA_VALID",
        },
        { name: "roa_check", argumentsText: "rpki_roa4, net, bgp_path.last" },
      ]);
    }
  });

  it("extracts ASPA and defined filter calls", async () => {
    const parsed = await parseBirdConfig(`
      aspa table at;

      function guard(bgppath p) -> bool {
        if !defined(p) then return false;
        bt_assert(aspa_check(at, p, true) = ASPA_VALID);
        return aspa_check(at, p, false) = ASPA_VALID;
      }
    `);

    const fn = parsed.program.declarations.find(
      (item) => item.kind === "function",
    );

    expect(parsed.issues).toHaveLength(0);
    expect(fn).toBeDefined();
    if (fn?.kind === "function") {
      expect(fn.calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "defined", argumentsText: "p" }),
          expect.objectContaining({
            name: "bt_assert",
            argumentsText: "aspa_check(at, p, true) = ASPA_VALID",
          }),
          expect.objectContaining({
            name: "aspa_check",
            argumentsText: "at, p, true",
          }),
          expect.objectContaining({
            name: "aspa_check",
            argumentsText: "at, p, false",
          }),
        ]),
      );
    }
  });

  it("preserves return values in function statements", async () => {
    const parsed = await parseBirdConfig(`
      function callmeagain(int a; int b; int c) -> int {
        return a + b + c;
      }
    `);

    const fn = parsed.program.declarations.find(
      (item) => item.kind === "function",
    );

    expect(parsed.issues).toHaveLength(0);
    expect(fn).toBeDefined();
    if (fn?.kind === "function") {
      expect(fn.statements).toContainEqual(
        expect.objectContaining({
          kind: "return",
          valueText: "a + b + c",
        }),
      );
    }
  });

  it("parses BIRD3 bitwise filter terms", async () => {
    const parsed = await parseBirdConfig(`
      function bitwise() {
        bt_assert(0xfee1a | 0xbeef = 0xffeff);
        bt_assert(0xfee1a & 0xbeef = 0xae0a);
      }
    `);

    expect(parsed.issues).toHaveLength(0);
  });

  it("extracts filter print, unset and assignment statements", async () => {
    const sample = `
      filter export_policy
      int metric;
      {
        print "route ", net, " source ", source;
        printn "metric ", rip_metric;
        metric = 7;
        rip_metric = 14;
        unset(rip_metric);
        accept;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const filter = parsed.program.declarations.find(
      (item) => item.kind === "filter",
    );

    expect(filter).toBeDefined();
    if (filter?.kind === "filter") {
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "print" &&
            item.newline === true &&
            item.argumentsText === '"route ", net, " source ", source',
        ),
      ).toBe(true);
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "print" &&
            item.newline === false &&
            item.argumentsText === '"metric ", rip_metric',
        ),
      ).toBe(true);
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "assignment" &&
            item.targetText === "metric" &&
            item.valueText === "7",
        ),
      ).toBe(true);
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "assignment" &&
            item.targetText === "rip_metric" &&
            item.valueText === "14",
        ),
      ).toBe(true);
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "unset" && item.attributeText === "rip_metric",
        ),
      ).toBe(true);
    }
  });

  it("accepts BIRD2 bridge dynamic kbr_source filters", async () => {
    const parsed = await parseBirdConfig(`
      filter bridge_only {
        if kbr_source = KBR_SRC_BIRD then accept;
        kbr_source = KBR_SRC_STATIC;
        reject;
      }
    `);

    expect(parsed.issues).toHaveLength(0);

    const filter = parsed.program.declarations.find(
      (item) => item.kind === "filter",
    );
    expect(filter).toBeDefined();
    if (filter?.kind === "filter") {
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "if" &&
            item.conditionText === "kbr_source = KBR_SRC_BIRD",
        ),
      ).toBe(true);
      expect(
        filter.statements.some(
          (item) =>
            item.kind === "assignment" &&
            item.targetText === "kbr_source" &&
            item.valueText === "KBR_SRC_STATIC",
        ),
      ).toBe(true);
    }
  });

  it("does not collect nested protocol statements inside inline filter blocks", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        import filter {
          local as 65003;
          neighbor 198.51.100.1 as 65004;
        };
        neighbor 192.0.2.1 as 65002;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const localAsStatements = protocol.statements.filter(
        (item) => item.kind === "local-as",
      );
      const neighborStatements = protocol.statements.filter(
        (item) => item.kind === "neighbor",
      );
      const importStatements = protocol.statements.filter(
        (item) => item.kind === "import",
      );

      expect(localAsStatements).toHaveLength(1);
      expect(neighborStatements).toHaveLength(1);
      expect(importStatements).toHaveLength(1);
    }
  });

  it("extracts declaration text correctly with non-ASCII content on the same line", async () => {
    const sample = `include "路由.conf"; protocol bgp edge { local as 65001; };`;
    const parsed = await parseBirdConfig(sample);

    const includeDeclaration = parsed.program.declarations.find(
      (item) => item.kind === "include",
    );
    const protocolDeclaration = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );

    expect(includeDeclaration).toBeDefined();
    if (includeDeclaration?.kind === "include") {
      expect(includeDeclaration.path).toBe("路由.conf");
    }

    expect(protocolDeclaration).toBeDefined();
    if (protocolDeclaration?.kind === "protocol") {
      expect(protocolDeclaration.protocolType).toBe("bgp");
      expect(protocolDeclaration.name).toBe("edge");
      expect(protocolDeclaration.statements.map((item) => item.kind)).toEqual([
        "local-as",
      ]);
    }
  });

  it("reports missing declaration symbols for incomplete headers", async () => {
    const sample = `
      include;
      define;
      router id;
      table;
      ipv4 table;
      protocol bgp {
      }
      template bgp {
      }
      filter {
      }
      function {
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const messages = parsed.issues.map((item) => item.message);

    expect(messages).toContain("Missing path for include declaration");
    expect(messages).toContain("Missing name for define declaration");
    expect(messages).toContain("Missing value for router id declaration");
    expect(messages).toContain("Missing name for table declaration");
    expect(messages).toContain("Missing name for template declaration");
    expect(messages).toContain("Missing name for filter declaration");
    expect(messages).toContain("Missing name for function declaration");
  });

  it("reports unbalanced brace recovery issues", async () => {
    const sample = `
      protocol bgp edge {
        ipv4 {
          import where net.len <= 24;
    `;

    const parsed = await parseBirdConfig(sample);
    expect(
      parsed.issues.some((item) => item.code === "syntax/unbalanced-brace"),
    ).toBe(true);
  });

  it("reports missing semicolon recovery issues", async () => {
    const sample = `
      protocol bgp edge {
        local as 65001
        neighbor 192.0.2.1 as 65002;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(
      parsed.issues.some((item) => item.code === "syntax/missing-semicolon"),
    ).toBe(true);
  });

  it("parses neighbor statements with scoped interface and custom port", async () => {
    const sample = `
      protocol bgp edge {
        neighbor 1.0.0.2 % 'ens19' as 123456 port 12346;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(
      parsed.issues.some((item) => item.code === "syntax/missing-semicolon"),
    ).toBe(false);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const neighbor = protocol.statements.find(
        (item) => item.kind === "neighbor",
      );
      expect(neighbor).toBeDefined();
      if (neighbor?.kind === "neighbor") {
        expect(neighbor.interface).toBe("'ens19'");
        expect(neighbor.asn).toBe("123456");
        expect(neighbor.port).toBe("12346");
      }
    }
  });

  it("recovers split link-local IPv6 neighbor clauses", async () => {
    const sample = `
      protocol bgp edge {
        neighbor fe80::1980:1:1 % 'eth1' as 199594;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    expect(
      parsed.issues.some((item) => item.code === "syntax/missing-semicolon"),
    ).toBe(false);

    const protocol = parsed.program.declarations.find(
      (item) => item.kind === "protocol",
    );
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const neighbor = protocol.statements.find(
        (item) => item.kind === "neighbor",
      );
      expect(neighbor).toBeDefined();
      if (neighbor?.kind === "neighbor") {
        expect(neighbor.address).toBe("fe80::1980:1:1");
        expect(neighbor.interface).toBe("'eth1'");
        expect(neighbor.asn).toBe("199594");
      }
    }
  });

  it("accepts anonymous protocol declarations", async () => {
    const parsed = await parseBirdConfig(
      "protocol static {\n  route 2001:db8::/32 reject;\n}\n",
    );
    const issue = parsed.issues.find(
      (item) => item.message === "Missing name for protocol declaration",
    );

    expect(issue).toBeUndefined();
  });

  it("suppresses recoverable syntax errors for local address and allow local as", async () => {
    const parsed = await parseBirdConfig(`
      template bgp rr_session {
        local OWNIPv6_rr port 1179 as PUB_MYASN;
        allow local as;
      };
    `);

    expect(parsed.issues).toHaveLength(0);
  });

  it("suppresses recoverable syntax errors for semicolon-separated function params and declarations", async () => {
    const parsed = await parseBirdConfig(`
      function f1 (int a; bgppath p; bool debug)
      int remain;
      {
        return true;
      }
    `);

    expect(parsed.issues).toHaveLength(0);
  });

  it("collects function leading declarations as expression statements", async () => {
    const parsed = await parseBirdConfig(`
      function f1 (int a; bgppath p; bool debug)
      int remain;
      {
        remain = p.len;
        return true;
      }
    `);

    const fn = parsed.program.declarations.find(
      (item) => item.kind === "function",
    );
    expect(fn).toBeDefined();
    if (fn?.kind === "function") {
      const expressions = fn.statements
        .filter((item) => item.kind === "expression")
        .map((item) => item.expressionText);
      expect(expressions).toContain("int a");
      expect(expressions).toContain("bgppath p");
      expect(expressions).toContain("int remain");
    }
  });

  it("accepts comma-separated identifiers inside generic blocks", async () => {
    const parsed = await parseBirdConfig(`
      log syslog {
        error,
        fatal,
        remote,
        auth,
        bug
      };
    `);

    expect(parsed.issues).toHaveLength(0);
  });
});
