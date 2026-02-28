import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBirdConfig } from "../src/index.js";

const fixtureFiles = [
  "basic.conf",
  "bgp_advanced.conf",
  "bogon.conf",
  "protocol_phrases.conf",
] as const;

const readFixture = (name: string): string => {
  const url = new URL(`../../../../refer/BIRD-tm-language-grammar/sample/${name}`, import.meta.url);
  return readFileSync(url, "utf8");
};

describe("@birdcc/parser fixtures", () => {
  for (const fileName of fixtureFiles) {
    it(`parses fixture ${fileName}`, () => {
      const text = readFixture(fileName);
      const parsed = parseBirdConfig(text);

      expect(parsed.tokens.length).toBeGreaterThan(0);
      expect(parsed.program.declarations.length).toBeGreaterThan(0);
      expect(parsed.issues).toHaveLength(0);
    });
  }

  it("detects phrases in protocol_phrases.conf", () => {
    const text = readFixture("protocol_phrases.conf");
    const parsed = parseBirdConfig(text);

    const phrases = new Set(parsed.phraseMatches.map((item) => item.phrase));
    expect(phrases.has("local as")).toBe(true);
    expect(phrases.has("next hop self")).toBe(true);
    expect(phrases.has("source address")).toBe(true);
  });
});
