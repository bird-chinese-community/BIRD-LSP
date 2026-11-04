import { describe, expect, it } from "vitest";
import {
  buildSymbolTableFromParsed,
  resolveCrossFileReferences,
} from "@birdcc/core";
import { parseBirdConfig } from "@birdcc/parser";
import { createDefinitionLocations } from "../src/definition.js";
import { createReferenceLocations } from "../src/references.js";

const declarations = [
  ["define", "define NAME = 1;"],
  ["function", "function NAME() { return 1; }"],
  ["filter", "filter NAME { accept; }"],
  ["protocol", "protocol static NAME { }"],
  ["template", "template bgp NAME { }"],
  ["table", "ipv4 table NAME;"],
] as const;

describe("case-sensitive symbol navigation", () => {
  const uri = "file:///workspace/bird.conf";
  const includedUri = "file:///workspace/symbols.conf";

  it.each(declarations)(
    "navigates to the exact %s name",
    async (_kind, pattern) => {
      const lower = pattern.replace("NAME", "lower_name");
      const upper = pattern.replace("NAME", "LOWER_NAME");
      for (const included of [false, true]) {
        for (const name of ["lower_name", "LOWER_NAME", "Lower_Name"]) {
          const source = `${lower}\n${included ? 'include "symbols.conf";' : upper}\nfunction use_symbol() { print ${name}; }\n`;
          const symbolTable = included
            ? (
                await resolveCrossFileReferences({
                  entryUri: uri,
                  documents: [
                    { uri, text: source },
                    { uri: includedUri, text: upper },
                  ],
                  loadFromFileSystem: false,
                })
              ).symbolTable
            : buildSymbolTableFromParsed(await parseBirdConfig(source), {
                uri,
              });
          const expected =
            name === "Lower_Name"
              ? []
              : [
                  {
                    uri: name === "LOWER_NAME" && included ? includedUri : uri,
                    range: {
                      start: {
                        line: name === "LOWER_NAME" && !included ? 1 : 0,
                        character: lower.indexOf("lower_name"),
                      },
                      end: {
                        line: name === "LOWER_NAME" && !included ? 1 : 0,
                        character: lower.indexOf("lower_name") + name.length,
                      },
                    },
                  },
                ];
          const position = {
            line: 2,
            character: "function use_symbol() { print ".length + 1,
          };
          expect(
            createDefinitionLocations(symbolTable, uri, position, source),
          ).toEqual(expected);
          expect(
            createReferenceLocations(symbolTable, uri, position, source),
          ).toEqual(expected);
        }
      }
    },
  );

  it("keeps recorded template references in their exact-case groups", async () => {
    const source =
      "template bgp lower_name { }\ntemplate bgp LOWER_NAME { }\nprotocol bgp lower_edge from lower_name { }\nprotocol bgp upper_edge from LOWER_NAME { }\nprotocol bgp missing_edge from Lower_Name { }\n";
    const symbolTable = buildSymbolTableFromParsed(
      await parseBirdConfig(source),
      { uri },
    );
    for (const [declarationLine, referenceLine] of [
      [0, 2],
      [1, 3],
    ] as const) {
      const position = { line: declarationLine, character: 15 };
      expect(
        createReferenceLocations(symbolTable, uri, position, source).map(
          (location) => location.range.start.line,
        ),
      ).toEqual([declarationLine, referenceLine]);
      expect(
        createDefinitionLocations(
          symbolTable,
          uri,
          { line: referenceLine, character: 31 },
          source,
        ).map((location) => location.range.start.line),
      ).toEqual([declarationLine]);
    }
    expect(
      createDefinitionLocations(
        symbolTable,
        uri,
        { line: 4, character: 34 },
        source,
      ),
    ).toEqual([]);
    expect(
      createReferenceLocations(
        symbolTable,
        uri,
        { line: 4, character: 34 },
        source,
      ).map((location) => location.range.start.line),
    ).toEqual([4]);
  });
});
