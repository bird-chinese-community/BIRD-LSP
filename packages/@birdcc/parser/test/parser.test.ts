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
});
