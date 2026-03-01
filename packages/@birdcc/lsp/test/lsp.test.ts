import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseBirdConfig } from "@birdcc/parser";
import {
  createCompletionItemsFromParsed,
  createDocumentSymbolsFromParsed,
  createHoverFromParsed,
  toLspDiagnostic,
} from "../src/index.js";

describe("@birdcc/lsp", () => {
  it("maps bird diagnostics to lsp diagnostics", () => {
    const output = toLspDiagnostic({
      code: "semantic/undefined-reference",
      message: "undefined ref",
      severity: "error",
      source: "core",
      range: {
        line: 10,
        column: 3,
        endLine: 10,
        endColumn: 8,
      },
    });

    expect(output.severity).toBe(DiagnosticSeverity.Error);
    expect(output.range.start.line).toBe(9);
    expect(output.range.start.character).toBe(2);
  });

  it("creates document symbols for key declaration kinds", async () => {
    const parsed = await parseBirdConfig(`
      template bgp edge_tpl {}
      protocol bgp edge from edge_tpl {}
      filter export_policy { accept; }
      function helper() -> bool { return true; }
    `);

    const symbols = createDocumentSymbolsFromParsed(parsed);
    const names = symbols.map((item) => item.name);

    expect(names).toContain("edge_tpl");
    expect(names).toContain("edge");
    expect(names).toContain("export_policy");
    expect(names).toContain("helper");
  });

  it("creates hover for declaration symbol", async () => {
    const text = `protocol bgp edge {}`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, { line: 0, character: 14 });

    expect(hover?.contents).toBeDefined();
  });

  it("creates hover for keyword", async () => {
    const text = `include "base.conf";`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, { line: 0, character: 1 });

    expect(hover?.contents).toBeDefined();
  });

  it("creates completion items with keywords and symbols", async () => {
    const parsed = await parseBirdConfig(`
      template bgp edge_tpl {}
      filter export_policy { accept; }
    `);

    const items = createCompletionItemsFromParsed(parsed);
    const labels = items.map((item) => item.label);

    expect(labels).toContain("protocol");
    expect(labels).toContain("template");
    expect(labels).toContain("edge_tpl");
    expect(labels).toContain("export_policy");
  });
});
