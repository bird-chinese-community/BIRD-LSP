import { describe, expect, it } from "vitest";

import { loadBirdHoverDocs, resolveBirdHoverTopic } from "../src/hover/docs.js";

describe("bird keyword hover resolver", () => {
  it("loads LSP-backed hover docs source", async () => {
    const docs = await loadBirdHoverDocs();
    expect(docs.source).toBe("lsp");
  });

  it("resolves multi-word router id topic", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "router id 10.0.0.1;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("id") + 1, docs);

    expect(topic?.key).toBe("router id");
    expect(topic?.markdown).toContain("router ID");
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

  it("resolves three-word keyword when hovering last token", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "export settle time 100 ms;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("time") + 1, docs);

    expect(topic?.key).toBe("export settle time");
  });

  it("resolves dot-prefixed member operator", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "if net.len = 24 then accept;";
    const topic = resolveBirdHoverTopic(line, line.indexOf(".len") + 1, docs);

    expect(topic?.key).toBe(".len");
    expect(topic?.markdown).toContain(".len");
  });

  it("prefers channel table docs in channel context", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "table master4;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("table") + 1, docs, {
      contextPath: ["protocol", "bgp", "channel", "ipv4"],
    });

    expect(topic?.markdown).toContain("Associate channel with routing table");
  });

  it("resolves usage snippets by context for shared keywords", async () => {
    const docs = await loadBirdHoverDocs();
    const line = 'password "secret";';

    const bgpTopic = resolveBirdHoverTopic(
      line,
      line.indexOf("password") + 1,
      docs,
      {
        contextPath: ["protocol", "bgp"],
      },
    );
    const ospfTopic = resolveBirdHoverTopic(
      line,
      line.indexOf("password") + 1,
      docs,
      {
        contextPath: ["protocol", "ospf", "area", "authentication"],
      },
    );

    expect(bgpTopic?.markdown).toContain("bgp-secret");
    expect(ospfTopic?.markdown).toContain("ospf-secret");
  });

  it("supports underscore variant smart matching", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "debug_latency on;";
    const topic = resolveBirdHoverTopic(
      line,
      line.indexOf("debug_latency") + 3,
      docs,
    );

    expect(topic?.key).toBe("debug latency");
    expect(topic?.markdown).toContain("latency");
  });

  it("supports cursor at word boundary", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "router id 10.0.0.1;";
    const boundaryCharacter = line.indexOf("id") + "id".length;
    const topic = resolveBirdHoverTopic(line, boundaryCharacter, docs);

    expect(topic?.key).toBe("router id");
  });
});
