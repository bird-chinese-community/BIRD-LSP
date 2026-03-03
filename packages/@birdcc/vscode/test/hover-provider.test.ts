import { describe, expect, it } from "vitest";

import { loadBirdHoverDocs, resolveBirdHoverTopic } from "../src/hover/docs.js";

describe("bird keyword hover resolver", () => {
  it("resolves multi-word router id topic", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "router id 10.0.0.1;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("id") + 1, docs);

    expect(topic?.key).toBe("router id");
    expect(topic?.doc.title).toContain("router");
  });

  it("resolves multi-word keyword", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "local as 65001;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("as") + 1, docs);

    expect(topic?.key).toBe("local as");
  });

  it("returns undefined for unknown words", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "mystery_token on;";
    const topic = resolveBirdHoverTopic(
      line,
      line.indexOf("mystery_token"),
      docs,
    );

    expect(topic).toBeUndefined();
  });
});
