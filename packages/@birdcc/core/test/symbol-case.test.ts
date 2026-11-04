import { describe, expect, it } from "vitest";
import {
  buildCoreSnapshot,
  collectFunctionReturnHints,
  resolveCrossFileReferences,
} from "../src/index.js";

const declarations = [
  ["define", "define NAME = 1;"],
  ["function", "function NAME() { return 1; }"],
  ["filter", "filter NAME { accept; }"],
  ["protocol", "protocol static NAME { }"],
  ["template", "template bgp NAME { }"],
  ["table", "ipv4 table NAME;"],
] as const;

describe("case-sensitive user symbols", () => {
  it.each(declarations)(
    "keeps %s declarations distinct",
    async (kind, pattern) => {
      for (const name of ["LOWER_NAME", "lower_name"]) {
        const source = `${pattern.replace("NAME", "lower_name")}\n${pattern.replace("NAME", name)}\n`;
        const result = await buildCoreSnapshot(source);
        expect(
          result.symbols
            .filter((symbol) => symbol.kind === kind)
            .map((symbol) => symbol.name),
        ).toEqual(["lower_name", name]);
        expect(
          result.diagnostics.filter(
            (item) => item.code === "semantic/duplicate-definition",
          ),
        ).toHaveLength(name === "lower_name" ? 1 : 0);
      }
    },
  );

  it.each(declarations)(
    "keeps included %s declarations distinct",
    async (kind, pattern) => {
      const uri = "file:///workspace/bird.conf";
      for (const name of ["LOWER_NAME", "lower_name"]) {
        const result = await resolveCrossFileReferences({
          entryUri: uri,
          documents: [
            {
              uri,
              text: `${pattern.replace("NAME", "lower_name")}\ninclude "symbols.conf";\n`,
            },
            {
              uri: "file:///workspace/symbols.conf",
              text: `${pattern.replace("NAME", name)}\n`,
            },
          ],
          loadFromFileSystem: false,
        });
        expect(
          result.symbolTable.definitions
            .filter((symbol) => symbol.kind === kind)
            .map((symbol) => symbol.name),
        ).toEqual(["lower_name", name]);
        expect(
          result.diagnostics.filter(
            (item) => item.code === "semantic/duplicate-definition",
          ),
        ).toHaveLength(name === "lower_name" ? 1 : 0);
      }
    },
  );

  it("resolves template inheritance using exact names", async () => {
    const result = await buildCoreSnapshot(
      "template bgp lower_name { }\ntemplate bgp LOWER_NAME from lower_name { }\nprotocol bgp edge from Lower_Name { }\n",
    );
    expect(
      result.diagnostics.filter(
        (item) => item.code === "semantic/circular-template",
      ),
    ).toEqual([]);
    expect(
      result.diagnostics
        .filter((item) => item.code === "semantic/undefined-reference")
        .map((item) => item.message),
    ).toEqual(["Undefined template reference 'Lower_Name'"]);
  });

  it("retains cycles between distinct-case templates", async () => {
    const result = await buildCoreSnapshot(
      "template bgp lower_name from LOWER_NAME { }\ntemplate bgp LOWER_NAME from lower_name { }\n",
    );
    expect(
      result.diagnostics.filter(
        (item) => item.code === "semantic/circular-template",
      ),
    ).toHaveLength(1);
  });

  it("keeps return hints attached to the exact function declaration", async () => {
    const hints = await collectFunctionReturnHints(
      "function lower_name() { return 1; }\nfunction LOWER_NAME() { return false; }\nfunction unknown_name() { return FALSE; }\n",
    );
    expect(
      hints.map((hint) => [hint.declaration.name, hint.inferredReturnType]),
    ).toEqual([
      ["lower_name", "int"],
      ["LOWER_NAME", "bool"],
      ["unknown_name", "unknown"],
    ]);
  });

  it("does not resolve differently cased variables or builtin attributes", async () => {
    const result = await buildCoreSnapshot(
      "function check_case() { int local_value; int LOCAL_VALUE; local_value = 1; LOCAL_VALUE = 2; Local_Value = 3; GW = 4; }\n",
    );
    expect(
      result.typeDiagnostics
        .filter((item) => item.code === "type/undefined-variable")
        .map((item) => item.message),
    ).toEqual([
      "Assignment to undefined variable 'Local_Value'",
      "Assignment to undefined variable 'GW'",
    ]);
  });
});
