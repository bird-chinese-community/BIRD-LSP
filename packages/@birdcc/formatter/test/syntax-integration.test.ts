import { describe, expect, it } from "vitest";
import { createContext } from "@dprint/formatter";
import { getBuffer } from "@birdcc/dprint-plugin-bird";
import { formatBirdConfig } from "../src/index.js";

const samples = [
  {
    name: "inline comment contents and trailing spaces",
    input: "protocol device {} # preserve  {  \n",
    output: "protocol device {} # preserve  {  \n",
  },
  {
    name: "empty files",
    input: "",
    output: "\n",
  },
  {
    name: "CRLF line endings",
    input: "# comment\r\nprotocol device {}\r\n",
    output: "# comment\nprotocol device {}\n",
  },
  {
    name: "braces and comment characters in strings",
    input: 'define LABEL = "{#]}";\nprotocol device {\n}\n',
    output: 'define LABEL = "{#]}";\nprotocol device {\n}\n',
  },
  {
    name: "escaped quotes and Unicode string contents",
    input:
      'define LABEL = "路由\\\"{#";\nprotocol device {\nscan time 10;\n}\n',
    output:
      'define LABEL = "路由\\\"{#";\nprotocol device {\n  scan time 10;\n}\n',
  },
  {
    name: "strings in multiline sets",
    input: 'define LABELS = [\n"{",\n"}",\n];\nprotocol device {\n}\n',
    output: 'define LABELS = [\n  "{",\n  "}",\n];\nprotocol device {\n}\n',
  },
  {
    name: "multiline comments",
    input: "/* {\n  } # [\n\n\n*/\nprotocol device {\nscan time 10;\n}\n",
    output: "/* {\n  } # [\n\n\n*/\nprotocol device {\n  scan time 10;\n}\n",
  },
  {
    name: "code adjacent to multiline comments",
    input:
      "protocol device { /* {\n } ] */\nscan time 10;\n}\nprotocol direct {\n}\n",
    output:
      "protocol device { /* {\n } ] */\n  scan time 10;\n}\nprotocol direct {\n}\n",
  },
];

describe.each(["builtin", "dprint"] as const)(
  "%s syntax formatting",
  (engine) => {
    it.each(samples)(
      "formats $name and is idempotent",
      async ({ input, output }) => {
        const result = await formatBirdConfig(input, { engine });
        expect(result.text).toBe(output);
        expect((await formatBirdConfig(result.text, { engine })).changed).toBe(
          false,
        );
      },
    );
  },
);

describe("direct WASM safety", () => {
  it("formats strings and multiline comments through the plugin without the TS wrapper", () => {
    const plugin = createContext().addPlugin(getBuffer(), { safeMode: true });
    expect(plugin.getResolvedConfig().safeMode).toBe(true);
    for (const { input, output } of samples) {
      expect(
        plugin.formatText({ filePath: "bird.conf", fileText: input }),
      ).toBe(output);
    }
  });

  it("rejects a token content change with safeMode and permits it when disabled", () => {
    const input = 'define LABEL = "a\rb";\n';
    const safe = createContext().addPlugin(getBuffer(), { safeMode: true });
    expect(() =>
      safe.formatText({ filePath: "bird.conf", fileText: input }),
    ).toThrow(/safe mode rejected/u);
    const unchecked = createContext().addPlugin(getBuffer(), {
      safeMode: false,
    });
    expect(unchecked.getResolvedConfig().safeMode).toBe(false);
    expect(
      unchecked.formatText({ filePath: "bird.conf", fileText: input }),
    ).toBe('define LABEL = "a\nb";\n');
  });
});
