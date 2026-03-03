import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatBirdConfig } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "fixtures/edgecases");

const readFixture = async (name: string): Promise<string> =>
  readFile(resolve(fixturesRoot, name), "utf8");

const edgeCases = [
  {
    name: "comment-brace.conf",
    expectedName: "comment-brace.expected.conf",
  },
  {
    name: "inline-comment-open-brace.conf",
    expectedName: "inline-comment-open-brace.expected.conf",
  },
] as const;

const engines = ["builtin", "dprint"] as const;

describe("formatter edge-case regressions", () => {
  for (const { name, expectedName } of edgeCases) {
    for (const engine of engines) {
      it(`${engine} keeps indentation stable for ${name}`, async () => {
        const input = await readFixture(name);
        const expected = await readFixture(expectedName);

        const first = await formatBirdConfig(input, { engine });
        expect(first.text).toBe(expected);

        const second = await formatBirdConfig(first.text, { engine });
        expect(second.changed).toBe(false);
        expect(second.text).toBe(expected);
      });
    }
  }
});
