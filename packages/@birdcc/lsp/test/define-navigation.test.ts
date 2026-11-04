import { describe, expect, it } from "vitest";
import {
  buildSymbolTableFromParsed,
  resolveCrossFileReferences,
} from "@birdcc/core";
import { parseBirdConfig } from "@birdcc/parser";
import { createDefinitionLocations } from "../src/definition.js";
import { createReferenceLocations } from "../src/references.js";

describe("define navigation", () => {
  const uri = "file:///workspace/bird.conf";
  const text =
    "define LOCAL_AS = 65000;\nprotocol bgp edge { local as LOCAL_AS; }\n";

  it("resolves a constant usage and its declaration to the constant name", async () => {
    const symbolTable = buildSymbolTableFromParsed(
      await parseBirdConfig(text),
      { uri },
    );
    const expected = [
      {
        uri,
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 15 },
        },
      },
    ];
    expect(
      createDefinitionLocations(
        symbolTable,
        uri,
        { line: 1, character: 31 },
        text,
      ),
    ).toEqual(expected);
    expect(
      createDefinitionLocations(
        symbolTable,
        uri,
        { line: 0, character: 9 },
        text,
      ),
    ).toEqual(expected);
  });

  it("resolves constants from an included document", async () => {
    const rootText =
      'include "constants.conf";\nprotocol bgp edge { local as LOCAL_AS; }\n';
    const constantsUri = "file:///workspace/constants.conf";
    const result = await resolveCrossFileReferences({
      entryUri: uri,
      documents: [
        { uri, text: rootText },
        { uri: constantsUri, text: "define LOCAL_AS = 65000;\n" },
      ],
      loadFromFileSystem: false,
    });
    expect(
      createDefinitionLocations(
        result.symbolTable,
        uri,
        { line: 1, character: 31 },
        rootText,
      ),
    ).toEqual([
      {
        uri: constantsUri,
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 15 },
        },
      },
    ]);
  });

  it.each([
    { name: "local_as", declarationLine: 0 },
    { name: "LOCAL_AS", declarationLine: 1 },
    { name: "Local_As", declarationLine: null },
  ])("matches local define case ($name)", async ({ name, declarationLine }) => {
    const sourceText =
      "define local_as = 65000;\ndefine LOCAL_AS = 65001;\n" +
      `protocol bgp edge { local as ${name}; }\n`;
    const symbolTable = buildSymbolTableFromParsed(
      await parseBirdConfig(sourceText),
      { uri },
    );
    const expected =
      declarationLine === null
        ? []
        : [
            {
              uri,
              range: {
                start: { line: declarationLine, character: 7 },
                end: { line: declarationLine, character: 15 },
              },
            },
          ];
    const position = { line: 2, character: 31 };
    expect(
      createDefinitionLocations(symbolTable, uri, position, sourceText),
    ).toEqual(expected);
    expect(
      createReferenceLocations(symbolTable, uri, position, sourceText),
    ).toEqual(expected);
  });

  it.each([
    { name: "local_as", definitionUri: uri },
    { name: "LOCAL_AS", definitionUri: "file:///workspace/constants.conf" },
    { name: "Local_As", definitionUri: null },
  ])("matches included define ($name)", async ({ name, definitionUri }) => {
    const rootText =
      'define local_as = 65000;\ninclude "constants.conf";\n' +
      `protocol bgp edge { local as ${name}; }\n`;
    const result = await resolveCrossFileReferences({
      entryUri: uri,
      documents: [
        { uri, text: rootText },
        {
          uri: "file:///workspace/constants.conf",
          text: "define LOCAL_AS = 65001;\n",
        },
      ],
      loadFromFileSystem: false,
    });
    const expected = definitionUri
      ? [
          {
            uri: definitionUri,
            range: {
              start: { line: 0, character: 7 },
              end: { line: 0, character: 15 },
            },
          },
        ]
      : [];
    const position = { line: 2, character: 31 };
    expect(
      createDefinitionLocations(result.symbolTable, uri, position, rootText),
    ).toEqual(expected);
    expect(
      createReferenceLocations(result.symbolTable, uri, position, rootText),
    ).toEqual(expected);
  });
});
