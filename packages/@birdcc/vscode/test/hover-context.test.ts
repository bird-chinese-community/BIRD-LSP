import { describe, expect, it } from "vitest";

import { resolveHoverContextPath } from "../src/hover/context.js";

interface MockDocument {
  readonly uri: { toString: () => string };
  readonly version: number;
  readonly lineCount: number;
  lineAt: (line: number) => { text: string };
}

let mockDocumentSequence = 0;

const createMockDocument = (source: string): MockDocument => {
  const lines = source.split(/\r?\n/);
  mockDocumentSequence += 1;
  const uriValue = `file:///tmp/mock-${String(mockDocumentSequence)}.conf`;

  return {
    uri: {
      toString: () => uriValue,
    },
    version: 1,
    lineCount: lines.length,
    lineAt: (line) => ({ text: lines[line] ?? "" }),
  };
};

describe("hover context path resolver", () => {
  it("resolves ospf area interface context", () => {
    const document = createMockDocument(
      `
protocol ospf v2 test {
  area 0 {
    interface "eth0" {
      cost 10;
    };
  };
};
`.trim(),
    ) as never;

    const path = resolveHoverContextPath(document, 3, 8);
    expect(path).toEqual(["protocol", "ospf", "area", "interface"]);
  });

  it("keeps parent-only context before block opening brace", () => {
    const document = createMockDocument(
      `
protocol ospf v2 test {
  area 0 {
    interface "eth0" {
      cost 10;
    };
  };
};
`.trim(),
    ) as never;

    const line = document.lineAt(1).text;
    const path = resolveHoverContextPath(document, 1, line.indexOf("area") + 1);
    expect(path).toEqual(["protocol", "ospf"]);
  });

  it("resolves nested external context", () => {
    const document = createMockDocument(
      `
protocol ospf v2 test {
  area 0 {
    external {
      type 1;
    };
  };
};
`.trim(),
    ) as never;

    const path = resolveHoverContextPath(document, 3, 8);
    expect(path).toEqual(["protocol", "ospf", "area", "external"]);
  });

  it("resolves channel context inside protocol family blocks", () => {
    const document = createMockDocument(
      `
protocol bgp edge {
  ipv4 {
    import all;
  };
};
`.trim(),
    ) as never;

    const path = resolveHoverContextPath(document, 2, 6);
    expect(path).toEqual(["protocol", "bgp", "channel", "ipv4"]);
  });

  it("resolves template protocol context for family blocks", () => {
    const document = createMockDocument(
      `
template bgp EDGE_BASE {
  ipv4 {
    export all;
  };
};
`.trim(),
    ) as never;

    const path = resolveHoverContextPath(document, 2, 6);
    expect(path).toEqual(["protocol", "bgp", "channel", "ipv4"]);
  });
});
