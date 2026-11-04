import { createContext } from "@dprint/formatter";
import { getBuffer } from "@birdcc/dprint-plugin-bird";
import { describe, expect, it } from "vitest";
import { formatBirdConfig } from "../src/index.js";

const input = "protocol device {\nscan time 10;\n}\n";
const syntaxInput =
  'define LABEL = "{#]}";\nprotocol device {\nscan time 10; # keep  {  \n}\n';
const syntaxExpected =
  'define LABEL = "{#]}";\nprotocol device {\n\tscan time 10; # keep  {  \n}\n';

describe("editor indentation options", () => {
  it.each(["builtin", "dprint"] as const)(
    "uses spaces and tabs in the %s engine",
    async (engine) => {
      const spaced = await formatBirdConfig(input, {
        engine,
        indentSize: 4,
        useTabs: false,
      });
      expect(spaced.engine).toBe(engine);
      expect(spaced.text).toContain("\n    scan time 10;\n");
      const tabbed = await formatBirdConfig(input, {
        engine,
        indentSize: 4,
        useTabs: true,
      });
      expect(tabbed.engine).toBe(engine);
      expect(tabbed.text).toContain("\n\tscan time 10;\n");
      const spacedAgain = await formatBirdConfig(input, {
        engine,
        indentSize: 4,
        useTabs: false,
      });
      expect(spacedAgain.text).toBe(spaced.text);
    },
  );

  it.each(["builtin", "dprint"] as const)(
    "preserves string and comment contents with tabs in the %s engine",
    async (engine) => {
      const options = { engine, useTabs: true, safeMode: true };
      const formatted = await formatBirdConfig(syntaxInput, options);
      expect(formatted.engine).toBe(engine);
      expect(formatted.text).toBe(syntaxExpected);
      expect((await formatBirdConfig(formatted.text, options)).text).toBe(
        syntaxExpected,
      );
    },
  );

  it("applies tabs in the direct embedded WASM path", () => {
    const context = createContext({ indentWidth: 4, useTabs: true });
    context.addPlugin(getBuffer(), {
      useTabs: true,
      indentWidth: 4,
      safeMode: true,
    });
    expect(
      context.formatText({ filePath: "bird.conf", fileText: input }),
    ).toContain("\n\tscan time 10;\n");
    expect(
      context.formatText({ filePath: "bird.conf", fileText: syntaxInput }),
    ).toBe(syntaxExpected);
    expect(() =>
      context.formatText({
        filePath: "bird.conf",
        fileText: 'define LABEL = "a\rb";\n',
      }),
    ).toThrow(/safe mode rejected/u);
  });
});
