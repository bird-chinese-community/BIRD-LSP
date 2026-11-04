import { describe, expect, it } from "vitest";
import { collectFunctionReturnHints, buildCoreSnapshot } from "../src/index.js";

describe("parsed language hints", () => {
  it("includes define names and their exact source ranges in the symbol table", async () => {
    const result = await buildCoreSnapshot("define LOCAL_AS = 65000;\n");
    expect(result.symbols).toContainEqual({
      kind: "define",
      name: "LOCAL_AS",
      line: 1,
      column: 8,
      endLine: 1,
      endColumn: 16,
      uri: "memory://bird.conf",
    });
  });

  it("ignores return text inside comments and strings", async () => {
    const [hint] = await collectFunctionReturnHints(
      'function policy() {\n# return 123;\n/* return false; */\nprint "return true;";\naccept;\n}\n',
    );
    expect(hint?.returnDetails).toEqual([]);
    expect(hint?.inferredReturnType).toBe("unknown");
  });

  it("collects nested returns and their actual values and lines", async () => {
    const [hint] = await collectFunctionReturnHints(
      "function policy() {\nif true then {\nreturn 123;\n} else {\nreturn 456;\n}\n}\n",
    );
    expect(hint?.inferredReturnType).toBe("int");
    expect(hint?.returnDetails).toEqual([
      { line: 3, expression: "123", inferredType: "int" },
      { line: 5, expression: "456", inferredType: "int" },
    ]);
  });

  it("keeps unknown return expressions in the aggregate type", async () => {
    const [hint] = await collectFunctionReturnHints(
      "function policy() {\nif true then return 123;\nreturn unresolved();\n}\n",
    );
    expect(hint?.returnDetails.map((detail) => detail.inferredType)).toEqual([
      "int",
      "unknown",
    ]);
    expect(hint?.inferredReturnType).toBe("unknown");
  });

  it("keeps mixed known return types unknown", async () => {
    const [hint] = await collectFunctionReturnHints(
      "function policy() { if true then return 123; return false; }\n",
    );
    expect(hint?.inferredReturnType).toBe("unknown");
  });
});
