import { describe, expect, it } from "vitest";
import {
  buildSymbolTableFromParsed,
  resolveCrossFileReferences,
} from "@birdcc/core";
import { parseBirdConfig } from "@birdcc/parser";
import { createDefinitionLocations } from "../src/definition.js";

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
});
