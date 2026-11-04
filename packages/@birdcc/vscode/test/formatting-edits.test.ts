import { describe, expect, it } from "vitest";
import { createFormattingChanges } from "../src/formatter/edits.js";

describe("formatting edit generation", () => {
  it.each([
    [
      "router id 192.0.2.1;\nprotocol device {\nscan time 10;\n}\n",
      "router id 192.0.2.1;\nprotocol device {\n    scan time 10;\n}\n",
    ],
    ["# 😀\r\nrouter id 192.0.2.1;\r\n", "# 😀\nrouter id 192.0.2.1;\n"],
    ["a\r\nb\r\n", "a\rX\nb\r\n"],
    ["", "router id 192.0.2.1;\n"],
  ])(
    "reconstructs formatter output with non-overlapping edits",
    async (original, formatted) => {
      const edits = await createFormattingChanges(original, formatted);
      let result = original;
      for (const edit of [...edits].reverse())
        result =
          result.slice(0, edit.start) + edit.text + result.slice(edit.end);
      expect(result).toBe(formatted);
      for (let index = 1; index < edits.length; index += 1)
        expect(edits[index]!.start).toBeGreaterThanOrEqual(
          edits[index - 1]!.end,
        );
      if (original.startsWith("router"))
        expect(edits[0]!.start).toBeGreaterThan(0);
    },
  );

  it("returns no edits for unchanged content", async () => {
    expect(
      await createFormattingChanges(
        "router id 192.0.2.1;\n",
        "router id 192.0.2.1;\n",
      ),
    ).toEqual([]);
  });
});
