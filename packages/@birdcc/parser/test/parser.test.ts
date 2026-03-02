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
    `;

    const parsed = await parseBirdConfig(sample);

    const routerDeclarations = parsed.program.declarations.filter(
      (item) => item.kind === "router-id",
    );
    const tableDeclarations = parsed.program.declarations.filter(
      (item) => item.kind === "table",
    );

    expect(routerDeclarations).toHaveLength(4);
    expect(tableDeclarations).toHaveLength(3);

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
  });

  it("recognizes all supported table type declarations", async () => {
    const sample = `
      routing table t_routing;
      ipv4 table t_ipv4;
      ipv6 table t_ipv6;
      vpn4 table t_vpn4;
      vpn6 table t_vpn6;
      roa4 table t_roa4;
      roa6 table t_roa6;
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
      "vpn4",
      "vpn6",
      "roa4",
      "roa6",
      "flow4",
      "flow6",
    ]);
    expect(tableTypes).not.toContain("unknown");
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
        expect(channel.entries.some((item) => item.kind === "debug")).toBe(
          true,
        );
        expect(
          channel.entries.some((item) => item.kind === "keep-filtered"),
        ).toBe(true);
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
    expect(messages).toContain("Missing name for protocol declaration");
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
});
