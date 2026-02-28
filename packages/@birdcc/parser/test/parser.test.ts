import { describe, expect, it } from "vitest";
import { parseBirdConfig } from "../src/index.js";

describe("@birdcc/parser prototype", () => {
  it("detects multi-word phrases in bgp block", () => {
    const sample = `
      protocol bgp edge_peer {
        local as 65001;
        next hop self;
      }
    `;

    const parsed = parseBirdConfig(sample);
    const phrases = parsed.phraseMatches.map((item) => item.phrase);

    expect(phrases).toContain("local as");
    expect(phrases).toContain("next hop self");
  });

  it("does not merge through symbols", () => {
    const sample = `local; as 65001;`;
    const parsed = parseBirdConfig(sample);
    const phrases = parsed.phraseMatches.map((item) => item.phrase);

    expect(phrases).not.toContain("local as");
  });

  it("builds top-level DSL declarations", () => {
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

    const parsed = parseBirdConfig(sample);
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

  it("keeps escaped quote inside string token", () => {
    const sample = String.raw`include "dir/\"edge\".conf";`;
    const parsed = parseBirdConfig(sample);
    const includeDecl = parsed.program.declarations.find((item) => item.kind === "include");

    expect(includeDecl).toBeDefined();
    if (includeDecl?.kind === "include") {
      expect(includeDecl.path).toBe(String.raw`dir/\"edge\".conf`);
    }
  });

  it("reports missing declaration symbols for incomplete headers", () => {
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

    const parsed = parseBirdConfig(sample);
    const messages = parsed.issues.map((item) => item.message);

    expect(messages).toContain("Missing path for include declaration");
    expect(messages).toContain("Missing name for define declaration");
    expect(messages).toContain("Missing name for protocol declaration");
    expect(messages).toContain("Missing name for template declaration");
    expect(messages).toContain("Missing name for filter declaration");
    expect(messages).toContain("Missing name for function declaration");

    const protocol = parsed.program.declarations.find((item) => item.kind === "protocol");
    expect(protocol).toBeDefined();
    if (protocol?.kind === "protocol") {
      expect(protocol.protocolType).toBe("bgp");
      expect(protocol.name).toBe("");
    }
  });
});
