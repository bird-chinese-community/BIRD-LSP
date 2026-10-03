import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveIncludeGraph } from "../src/detection/include-graph.js";
import type { ContentSignals } from "../src/detection/types.js";

const createSignals = (includeStatements: string[]): ContentSignals => ({
  hasGlobalRouterId: false,
  hasProtocolRouterIdOnly: false,
  hasProtocolDevice: false,
  hasProtocolKernel: false,
  hasLogDirective: false,
  hasProtocolBlock: false,
  hasDefine: false,
  includeStatements,
  commentedIncludes: [],
});

describe("include graph root boundary", () => {
  it("rejects an include that resolves to the root parent itself", () => {
    const graph = resolveIncludeGraph(
      resolve("workspace"),
      new Map([
        ["bird.conf", createSignals([".."])],
        ["..", createSignals([])],
      ]),
    );

    expect(graph.edges.get("bird.conf")).toEqual([]);
    expect(graph.missingBySource.get("bird.conf")).toBe(1);
    expect(graph.includedByCount.get("..")).toBeUndefined();
  });
});
