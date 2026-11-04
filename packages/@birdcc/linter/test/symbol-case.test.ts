import { describe, expect, it } from "vitest";
import { resolveCrossFileReferences } from "@birdcc/core";
import { lintBirdConfig, lintResolvedCrossFileGraph } from "../src/index.js";

const references = [
  [
    "template",
    "template bgp lower_name { }",
    "protocol bgp edge from NAME { }",
    "sym/undefined",
  ],
  [
    "filter",
    "filter lower_name { accept; }",
    "protocol bgp edge { import filter NAME; }",
    "sym/filter-required",
  ],
  [
    "function",
    "function lower_name() { return 1; }",
    "filter policy { NAME(); accept; }\nprotocol device edge { }",
    "sym/function-required",
  ],
  [
    "table",
    "ipv4 table lower_name;",
    "protocol bgp edge { ipv4 { table NAME; }; }",
    "sym/table-required",
  ],
] as const;

describe("case-sensitive lint references", () => {
  const uri = "file:///workspace/bird.conf";

  it.each(references)(
    "checks %s references with exact case",
    async (_kind, declaration, pattern, code) => {
      for (const name of ["lower_name", "Lower_Name"]) {
        for (const included of [false, true]) {
          const usage = pattern.replace("NAME", name);
          const result = included
            ? await lintResolvedCrossFileGraph(
                await resolveCrossFileReferences({
                  entryUri: uri,
                  documents: [
                    { uri, text: `include "symbols.conf";\n${usage}` },
                    {
                      uri: "file:///workspace/symbols.conf",
                      text: declaration,
                    },
                  ],
                  loadFromFileSystem: false,
                }),
              )
            : await lintBirdConfig(`${declaration}\n${usage}`, { uri });
          expect(
            result.diagnostics.filter((item) => item.code === code),
          ).toHaveLength(name === "lower_name" ? 0 : 1);
        }
      }
    },
  );

  it("does not report a cycle for case-distinct template inheritance", async () => {
    const result = await lintBirdConfig(
      "template bgp lower_name { }\ntemplate bgp LOWER_NAME from lower_name { }\nprotocol bgp edge from LOWER_NAME { }",
      { uri },
    );
    expect(
      result.diagnostics.filter(
        (item) => item.code === "cfg/circular-template",
      ),
    ).toEqual([]);
    expect(
      result.diagnostics.filter((item) => item.code === "sym/duplicate"),
    ).toEqual([]);
  });

  it("does not resolve uppercase spellings through builtin names", async () => {
    const result = await lintBirdConfig(
      "filter policy { LEN(); PRINT(); accept; }\nprotocol bgp edge { import filter ALL; ipv4 { table MASTER4; }; }",
      { uri },
    );
    expect(
      result.diagnostics
        .filter((item) => item.code === "sym/function-required")
        .map((item) => item.message),
    ).toEqual([
      "Declaration 'policy' references undefined function 'LEN'",
      "Declaration 'policy' references undefined function 'PRINT'",
    ]);
    expect(
      result.diagnostics.filter((item) => item.code === "sym/filter-required"),
    ).toHaveLength(1);
    expect(
      result.diagnostics.filter((item) => item.code === "sym/table-required"),
    ).toHaveLength(1);
  });
});
