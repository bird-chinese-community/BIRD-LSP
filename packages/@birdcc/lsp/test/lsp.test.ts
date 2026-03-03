import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseBirdConfig } from "@birdcc/parser";
import {
  createCompletionItemsFromParsed,
  createDefinitionLocations,
  createDocumentSymbolsFromParsed,
  createHoverFromParsed,
  createReferenceLocations,
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
      include "base.conf";
      define ASN = 65001;
      ipv4 table main4;
      router id 1.1.1.1;
      template bgp edge_tpl {}
      protocol bgp edge from edge_tpl {}
      filter export_policy { accept; }
      function helper() -> bool { return true; }
    `);

    const symbols = createDocumentSymbolsFromParsed(parsed);
    const names = symbols.map((item) => item.name);

    expect(names).toContain("base.conf");
    expect(names).toContain("ASN");
    expect(names).toContain("main4");
    expect(names).toContain("router id 1.1.1.1");
    expect(names).toContain("edge_tpl");
    expect(names).toContain("edge");
    expect(names).toContain("export_policy");
    expect(names).toContain("helper");
  });

  it("creates hover for declaration symbol", async () => {
    const text = `protocol bgp edge {}`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: 14,
    });

    expect(hover?.contents).toBeDefined();
  });

  it("creates hover for keyword", async () => {
    const text = `include "base.conf";`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: 1,
    });

    expect(hover?.contents).toBeDefined();
  });

  it("escapes markdown code content in include hover", async () => {
    const text = 'include "unsafe`name.conf";';
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: 12,
    });

    expect(hover?.contents).toBeDefined();
    expect(
      hover && typeof hover.contents !== "string" ? hover.contents.value : "",
    ).toContain("unsafe\\`name.conf");
  });

  it("creates hover for multi-word keyword phrase", async () => {
    const text = `protocol bgp edge { local as 65001; }`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: 28,
    });

    expect(hover?.contents).toBeDefined();
  });

  it("creates hover for dot-prefixed keyword member operator", async () => {
    const text = `if net.len = 24 then accept;`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: text.indexOf(".len") + 2,
    });

    expect(hover?.contents).toBeDefined();
    expect(
      hover && typeof hover.contents !== "string" ? hover.contents.value : "",
    ).toContain(".len");
  });

  it("creates hover for underscore alias keyword", async () => {
    const text = `debug_latency on;`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: text.indexOf("debug_latency") + 6,
    });

    expect(hover?.contents).toBeDefined();
    expect(
      hover && typeof hover.contents !== "string" ? hover.contents.value : "",
    ).toContain("debug latency");
  });

  it("creates hover when cursor is at word boundary", async () => {
    const text = `router id 1.1.1.1;`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);
    const idEnd = text.indexOf("id") + "id".length;

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: idEnd,
    });

    expect(hover?.contents).toBeDefined();
    expect(
      hover && typeof hover.contents !== "string" ? hover.contents.value : "",
    ).toContain("router id");
  });

  it("creates hover for define declaration name", async () => {
    const text = `define ASN = 65001;`;
    const parsed = await parseBirdConfig(text);
    const document = TextDocument.create("file:///bird.conf", "bird", 1, text);

    const hover = createHoverFromParsed(parsed, document, {
      line: 0,
      character: 8,
    });

    expect(hover?.contents).toBeDefined();
  });

  it("creates completion items with keywords and symbols", async () => {
    const parsed = await parseBirdConfig(`
      include "base.conf";
      define ASN = 65001;
      ipv4 table main4;
      router id 1.1.1.1;
      template bgp edge_tpl {}
      filter export_policy { accept; }
    `);

    const items = createCompletionItemsFromParsed(parsed);
    const labels = items.map((item) => item.label);

    expect(labels).toContain("define");
    expect(labels).toContain("protocol");
    expect(labels).toContain("template");
    expect(labels).toContain("base.conf");
    expect(labels).toContain("ASN");
    expect(labels).toContain("main4");
    expect(labels).toContain("router id 1.1.1.1");
    expect(labels).toContain("edge_tpl");
    expect(labels).toContain("export_policy");
  });

  it("returns template completions in protocol from context", async () => {
    const parsed = await parseBirdConfig(`
      template bgp edge_tpl {}
      template bgp core_tpl {}
      define ASN = 65001;
      filter export_policy { accept; }
    `);

    const items = createCompletionItemsFromParsed(parsed, {
      linePrefix: "protocol bgp edge from ",
    });
    const labels = items.map((item) => item.label);

    expect(labels).toContain("edge_tpl");
    expect(labels).toContain("core_tpl");
    expect(labels).not.toContain("ASN");
    expect(labels).not.toContain("export_policy");
  });

  it("returns include path candidates inside include string context", async () => {
    const parsed = await parseBirdConfig(`
      include "base.conf";
      include "upstream/edge.conf";
      template bgp edge_tpl {}
    `);

    const items = createCompletionItemsFromParsed(parsed, {
      linePrefix: 'include "',
    });
    const labels = items.map((item) => item.label);

    expect(labels).toContain("base.conf");
    expect(labels).toContain("upstream/edge.conf");
    expect(labels).not.toContain("template");
  });

  it("returns empty completion list for include context without include declarations", async () => {
    const parsed = await parseBirdConfig(`
      template bgp edge_tpl {}
    `);

    const items = createCompletionItemsFromParsed(parsed, {
      linePrefix: 'include "',
    });

    expect(items).toEqual([]);
  });

  it("returns empty completion list for from context without template declarations", async () => {
    const parsed = await parseBirdConfig(`
      define ASN = 65001;
      filter export_policy { accept; }
    `);

    const items = createCompletionItemsFromParsed(parsed, {
      linePrefix: "protocol bgp edge from ",
    });

    expect(items).toEqual([]);
  });

  it("includes snippet completion items in generic context", async () => {
    const parsed = await parseBirdConfig(`
      template bgp edge_tpl {}
    `);

    const items = createCompletionItemsFromParsed(parsed);
    const labels = items.map((item) => item.label);

    expect(labels).toContain('include "..."');
    expect(labels).toContain("define NAME = value;");
    expect(labels).toContain("router id 1.1.1.1;");
    expect(labels).toContain("protocol bgp ...");
  });

  it("merges additional declarations into from/filter/table completion contexts", async () => {
    const entryParsed = await parseBirdConfig(`
      protocol bgp edge from 
    `);
    const includeParsed = await parseBirdConfig(`
      template bgp core_tpl {}
      filter import_policy { accept; }
      ipv4 table main4;
    `);

    const additionalDeclarations = includeParsed.program.declarations;
    const fromItems = createCompletionItemsFromParsed(entryParsed, {
      linePrefix: "protocol bgp edge from ",
      additionalDeclarations,
    });
    expect(fromItems.map((item) => item.label)).toContain("core_tpl");

    const filterItems = createCompletionItemsFromParsed(entryParsed, {
      linePrefix: "import filter ",
      additionalDeclarations,
    });
    expect(filterItems.map((item) => item.label)).toContain("import_policy");

    const tableItems = createCompletionItemsFromParsed(entryParsed, {
      linePrefix: "table ",
      additionalDeclarations,
    });
    expect(tableItems.map((item) => item.label)).toContain("main4");
  });

  it("resolves cross-file definition and references from merged symbol table", () => {
    const symbolTable = {
      definitions: [
        {
          kind: "template" as const,
          name: "edge_tpl",
          line: 1,
          column: 14,
          endLine: 1,
          endColumn: 22,
          uri: "file:///templates.conf",
        },
      ],
      references: [
        {
          kind: "template" as const,
          name: "edge_tpl",
          line: 1,
          column: 24,
          endLine: 1,
          endColumn: 32,
          uri: "file:///main.conf",
        },
      ],
    };

    const definitionLocations = createDefinitionLocations(
      symbolTable,
      "file:///main.conf",
      { line: 0, character: 25 },
      "protocol bgp edge from edge_tpl {}",
    );
    expect(definitionLocations).toHaveLength(1);
    expect(definitionLocations[0]?.uri).toBe("file:///templates.conf");

    const referenceLocations = createReferenceLocations(
      symbolTable,
      "file:///main.conf",
      { line: 0, character: 25 },
      "protocol bgp edge from edge_tpl {}",
    );
    expect(referenceLocations.map((item) => item.uri)).toContain(
      "file:///templates.conf",
    );
    expect(referenceLocations.map((item) => item.uri)).toContain(
      "file:///main.conf",
    );
  });
});
