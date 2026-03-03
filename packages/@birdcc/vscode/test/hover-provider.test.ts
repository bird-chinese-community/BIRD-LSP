import { describe, expect, it } from "vitest";

import { loadBirdHoverDocs, resolveBirdHoverTopic } from "../src/hover/docs.js";

describe("bird keyword hover resolver", () => {
  it("keeps strong structured coverage in merged runtime docs", async () => {
    const docs = await loadBirdHoverDocs();
    const values = [...docs.docs.values()];

    const withPath = values.filter((entry) => entry.path !== undefined).length;
    const withRelated = values.filter(
      (entry) => Array.isArray(entry.related) && entry.related.length > 0,
    ).length;
    const withParameters = values.filter(
      (entry) => Array.isArray(entry.parameters) && entry.parameters.length > 0,
    ).length;
    const withUsage = values.filter(
      (entry) =>
        typeof entry.usage === "string" && entry.usage.trim().length > 0,
    ).length;

    expect(values.length).toBeGreaterThanOrEqual(100);
    expect(withPath).toBeGreaterThanOrEqual(100);
    expect(withRelated).toBeGreaterThanOrEqual(75);
    expect(withParameters).toBeGreaterThanOrEqual(75);
    expect(withUsage).toBeGreaterThanOrEqual(85);
  });

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
  });

  it("matches dot-prefixed token against dotless fallback keyword", () => {
    const fallbackDocs = new Map([
      [
        "len",
        {
          keyword: "len",
          title: "Length function",
          summary: "Return the length of a collection.",
        },
      ],
    ]);
    const line = "if net.len = 24 then accept;";
    const topic = resolveBirdHoverTopic(
      line,
      line.indexOf(".len") + 2,
      fallbackDocs,
    );

    expect(topic?.doc.title).toBe("Length function");
  });

  it("loads metadata and references for versioned docs", async () => {
    const docs = await loadBirdHoverDocs();
    const debugDoc = docs.docs.get("debug");

    expect(debugDoc).toBeDefined();
    expect(debugDoc?.version).toBe("v2-v3");
    expect(debugDoc?.diff).toBe("modified");
    expect(debugDoc?.links?.length).toBeGreaterThanOrEqual(2);
    expect(debugDoc?.links?.[0]?.url).toMatch(
      /^https:\/\/bird\.nic\.cz\/doc\//,
    );
  });

  it("hydrates usage snippets from usage database", async () => {
    const docs = await loadBirdHoverDocs();
    const routerIdDoc = docs.docs.get("router id");
    const neighborDoc = docs.docs.get("neighbor");
    const holdTimeDoc = docs.docs.get("hold time");

    expect(routerIdDoc?.usage).toContain("router id 10.0.0.1;");
    expect(neighborDoc?.usage).toContain("neighbor 192.0.2.1 as 64496;");
    expect(holdTimeDoc?.usage).toContain("hold time 90;");
  });

  it("loads path-specific parameters for ospf interface docs", async () => {
    const docs = await loadBirdHoverDocs();
    const interfaceDocs = docs.docsByKey.get("interface") ?? [];
    const ospfInterfaceDoc = interfaceDocs.find(
      (doc) => doc.path === "protocol.ospf.area",
    );

    expect(ospfInterfaceDoc).toBeDefined();
    expect(ospfInterfaceDoc?.parameters?.length).toBeGreaterThanOrEqual(1);
  });

  it("exposes structured metadata for bgp keyword docs", async () => {
    const docs = await loadBirdHoverDocs();
    const neighborDoc = docs.docs.get("neighbor");

    expect(neighborDoc?.path).toBe("protocol.bgp");
    expect(neighborDoc?.related).toContain("multihop");
    expect(neighborDoc?.parameters?.some((item) => item.name === "asn")).toBe(
      true,
    );
  });

  it("exposes structured metadata for global and filter keywords", async () => {
    const docs = await loadBirdHoverDocs();
    const routerIdDoc = docs.docs.get("router id");
    const ifDoc = docs.docs.get("if");

    expect(routerIdDoc?.path).toBe("global");
    expect(routerIdDoc?.related).toContain("router id from");
    expect(
      routerIdDoc?.parameters?.some((item) => item.name === "router-id"),
    ).toBe(true);

    expect(ifDoc?.path).toBe("filter");
    expect(ifDoc?.related).toContain("then");
  });

  it("loads structured docs for extended protocols", async () => {
    const docs = await loadBirdHoverDocs();
    const rpkiDoc = docs.docs.get("rpki");
    const routeDoc = docs.docs.get("route");

    expect(rpkiDoc?.path).toBe("protocol");
    expect(rpkiDoc?.related).toContain("rpki reload");
    expect(
      rpkiDoc?.parameters?.some((item) => item.name === "cache-address"),
    ).toBe(true);
    expect(rpkiDoc?.usage).toContain("protocol rpki");

    expect(routeDoc?.path).toBe("protocol.static");
    expect(routeDoc?.related).toContain("next hop");
    expect(routeDoc?.usage).toContain("203.0.113.0/24");
  });

  it("prefers path-specific docs for ospf interface context", async () => {
    const docs = await loadBirdHoverDocs();
    const line = 'interface "eth0" { cost 10; };';
    const topic = resolveBirdHoverTopic(
      line,
      line.indexOf("interface") + 2,
      docs,
      {
        contextPath: ["protocol", "ospf", "area"],
      },
    );

    expect(topic?.doc.title).toBe("OSPF interface block");
  });

  it("prefers channel table docs in channel context", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "table master4;";
    const topic = resolveBirdHoverTopic(line, line.indexOf("table") + 1, docs, {
      contextPath: ["protocol", "bgp", "channel", "ipv4"],
    });

    expect(topic?.doc.title).toBe("Associate channel with routing table");
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
        contextPath: ["protocol", "ospf", "authentication"],
      },
    );

    expect(bgpTopic?.doc.usage).toContain("bgp-secret");
    expect(ospfTopic?.doc.usage).toContain("ospf-secret");
  });

  it("supports underscore variant smart matching", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "debug_latency on;";
    const topic = resolveBirdHoverTopic(
      line,
      line.indexOf("debug_latency") + 3,
      docs,
    );

    expect(topic?.key).toBe("debug_latency");
    expect(topic?.doc.title).toContain("latency");
  });

  it("supports cursor at word boundary", async () => {
    const docs = await loadBirdHoverDocs();
    const line = "router id 10.0.0.1;";
    const boundaryCharacter = line.indexOf("id") + "id".length;
    const topic = resolveBirdHoverTopic(line, boundaryCharacter, docs);

    expect(topic?.key).toBe("router id");
  });
});
