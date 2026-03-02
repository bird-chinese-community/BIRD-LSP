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
  const url = new URL(
    `../../../../refer/BIRD-tm-language-grammar/sample/${name}`,
    import.meta.url,
  );
  return readFileSync(url, "utf8");
};

describe("@birdcc/parser fixtures", () => {
  for (const fileName of fixtureFiles) {
    it(`parses fixture ${fileName}`, async () => {
      const text = readFixture(fileName);
      const parsed = await parseBirdConfig(text);

      expect(parsed.program.declarations.length).toBeGreaterThan(0);
      expect(
        parsed.issues.filter((item) => item.code === "parser/syntax-error"),
      ).toHaveLength(0);
    });
  }

  it("extracts protocol statements from protocol_phrases.conf", async () => {
    const text = readFixture("protocol_phrases.conf");
    const parsed = await parseBirdConfig(text);

    const protocols = parsed.program.declarations.filter(
      (item) => item.kind === "protocol",
    );
    const statements = protocols.flatMap((protocol) =>
      protocol.statements.map((item) => item.kind),
    );

    expect(statements).toContain("local-as");
    expect(statements).toContain("import");
    expect(statements).toContain("export");
  });
});
