import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const snippetsPath = resolve(here, "../snippets/bird2.json");

describe("snippets catalog", () => {
  it("contains 40 normalized bird-* snippets", async () => {
    const raw = await readFile(snippetsPath, "utf8");
    const snippets = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(snippets).filter(([, value]) => {
      if (!value || typeof value !== "object") {
        return false;
      }

      const candidate = value as {
        prefix?: unknown;
        body?: unknown;
      };

      return Array.isArray(candidate.prefix) && Array.isArray(candidate.body);
    });

    expect(entries).toHaveLength(40);
    for (const [name] of entries) {
      expect(name.startsWith("bird-")).toBe(true);
      expect(name.startsWith("bird-global-")).toBe(false);
    }

    for (const [, value] of entries) {
      const candidate = value as { description?: unknown };
      expect(typeof candidate.description).toBe("string");
      expect((candidate.description as string).includes("[Global]")).toBe(
        false,
      );
      expect((candidate.description as string).includes("[Function]")).toBe(
        false,
      );
    }
  });
});
