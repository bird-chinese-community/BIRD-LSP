import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { toLspDiagnostic } from "../src/index.js";

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
});
