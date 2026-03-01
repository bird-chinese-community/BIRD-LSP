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

    expect(kinds).toEqual(["include", "template", "protocol", "filter", "function"]);

    const protocol = parsed.program.declarations.find((item) => item.kind === "protocol");
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bgp");
      expect(protocol.name).toBe("edge");
      expect(protocol.fromTemplate).toBe("edge_tpl");
    }
  });

  it("extracts protocol common statements", async () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        import all;
        export filter policy_out;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const protocol = parsed.program.declarations.find((item) => item.kind === "protocol");

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const localAs = protocol.statements.find((item) => item.kind === "local-as");
      const neighbor = protocol.statements.find((item) => item.kind === "neighbor");
      const importStatement = protocol.statements.find((item) => item.kind === "import");
      const exportStatement = protocol.statements.find((item) => item.kind === "export");

      expect(localAs?.kind).toBe("local-as");
      if (localAs?.kind === "local-as") {
        expect(localAs.asn).toBe("65001");
      }

      expect(neighbor?.kind).toBe("neighbor");
      if (neighbor?.kind === "neighbor") {
        expect(neighbor.address).toBe("192.0.2.1");
        expect(neighbor.asn).toBe("65002");
      }

      expect(importStatement?.kind).toBe("import");
      if (importStatement?.kind === "import") {
        expect(importStatement.mode).toBe("all");
      }

      expect(exportStatement?.kind).toBe("export");
      if (exportStatement?.kind === "export") {
        expect(exportStatement.mode).toBe("filter");
        expect(exportStatement.filterName).toBe("policy_out");
      }
    }
  });

  it("does not collect nested protocol statements inside inner blocks", async () => {
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
    const protocol = parsed.program.declarations.find((item) => item.kind === "protocol");

    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      const localAsStatements = protocol.statements.filter((item) => item.kind === "local-as");
      const neighborStatements = protocol.statements.filter((item) => item.kind === "neighbor");
      const importStatements = protocol.statements.filter((item) => item.kind === "import");

      expect(localAsStatements).toHaveLength(1);
      expect(neighborStatements).toHaveLength(1);
      expect(importStatements).toHaveLength(1);
    }
  });

  it("reports missing declaration symbols for incomplete headers", async () => {
    const sample = `
      include;
      define;
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
    expect(messages).toContain("Missing name for protocol declaration");
    expect(messages).toContain("Missing name for template declaration");
    expect(messages).toContain("Missing name for filter declaration");
    expect(messages).toContain("Missing name for function declaration");
  });

  it("reports unbalanced brace recovery issues", async () => {
    const sample = `
      protocol bgp edge {
        local as 65001;
    `;

    const parsed = await parseBirdConfig(sample);
    expect(parsed.issues.some((item) => item.code === "parser/unbalanced-brace")).toBe(true);
  });
});
