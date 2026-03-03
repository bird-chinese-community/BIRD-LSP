import { describe, expect, it } from "vitest";
import {
  buildCoreSnapshot,
  buildCoreSnapshotFromParsed,
  checkTypes,
  resolveCrossFileReferences,
} from "../src/index.js";
import { parseBirdConfig } from "@birdcc/parser";

describe("@birdcc/core boundaries", () => {
  it("reports duplicate symbol definitions", async () => {
    const sample = `
      filter policy_a { accept; }
      filter policy_a { reject; }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) =>
          item.code === "semantic/duplicate-definition" &&
          item.severity === "error",
      ),
    ).toBe(true);
  });

  it("reports undefined template reference", async () => {
    const sample = `
      protocol bgp edge from missing_template {
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/undefined-reference",
      ),
    ).toBe(true);
  });

  it("reports invalid router id", async () => {
    const sample = `
      router id 999.0.0.1;
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/invalid-router-id",
      ),
    ).toBe(true);
  });

  it("reports invalid neighbor address", async () => {
    const sample = `
      protocol bgp edge {
        local as 65001;
        neighbor 203.0.113.999 as 65002;
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/invalid-neighbor-address",
      ),
    ).toBe(true);
  });

  it("reports invalid CIDR literal", async () => {
    const sample = `
      filter export_policy {
        if net ~ [ 2001:db8::/200 ] then reject;
        accept;
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some((item) => item.code === "semantic/invalid-cidr"),
    ).toBe(true);
  });

  it("passes valid router and prefix literals", async () => {
    const sample = `
      router id 192.0.2.1;

      template bgp edge_tpl {
      }

      protocol bgp edge from edge_tpl {
        local as 65001;
        neighbor 192.0.2.1 as 65002;
        ipv4 {
          import where net.len <= 24;
        };
      }

      filter export_policy {
        if net ~ [ 10.0.0.0/8+, 2001:db8::/32{33,128} ] then reject;
        accept;
      }
    `;

    const result = await buildCoreSnapshot(sample);

    const errorCodes = result.diagnostics
      .filter((item) => item.severity === "error")
      .map((item) => item.code);

    expect(errorCodes).not.toContain("semantic/invalid-router-id");
    expect(errorCodes).not.toContain("semantic/invalid-neighbor-address");
    expect(errorCodes).not.toContain("semantic/invalid-cidr");
  });

  it("emits type diagnostics for assignment mismatch and undefined variable", async () => {
    const sample = `
      filter export_policy {
        int limit = 42;
        limit = "too-big";
        unknown_var = 5;
        accept;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);

    expect(
      snapshot.typeDiagnostics.some((item) => item.code === "type/mismatch"),
    ).toBe(true);
    expect(
      snapshot.typeDiagnostics.some(
        (item) => item.code === "type/undefined-variable",
      ),
    ).toBe(true);
  });

  it("checkTypes works with explicit program + symbolTable input", async () => {
    const sample = `
      function calc() -> int {
        int value = 1;
        value = 2;
        return value;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);
    const diagnostics = checkTypes(parsed.program, snapshot.symbolTable);

    expect(diagnostics).toHaveLength(0);
  });

  it("infers expression types for arithmetic comparison and boolean logic", async () => {
    const sample = `
      filter export_policy {
        int threshold = 24;
        bool in_range = (threshold + 1) >= 20;
        bool ok = in_range && true;
        bool precedence_ok = 1 < 2 == true;
        bool mismatch = threshold + 1;
        int wrong = in_range;
        accept;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);
    const mismatchDiagnostics = snapshot.typeDiagnostics.filter(
      (item) => item.code === "type/mismatch",
    );

    expect(mismatchDiagnostics).toHaveLength(2);
  });

  it("infers nested expressions and reports mismatch on incompatible assignment", async () => {
    const sample = `
      function calc() -> bool {
        int value = 3;
        bool ok = !(value < 1) || ((value + 2) > 4);
        int mismatch = value > 1;
        return ok;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);
    const diagnostics = checkTypes(parsed.program, snapshot.symbolTable);
    const mismatchDiagnostics = diagnostics.filter(
      (item) => item.code === "type/mismatch",
    );

    expect(mismatchDiagnostics).toHaveLength(1);
  });

  it("infers match expressions against set literals as bool", async () => {
    const sample = `
      filter export_policy {
        prefix target = 10.0.0.0/8;
        bool matched = target ~ [ 10.0.0.0/8, 192.0.2.0/24 ];
        bool not_matched = target !~ [ 203.0.113.0/24 ];
        int mismatch = target ~ [ 10.0.0.0/8 ];
        accept;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);
    const mismatchDiagnostics = snapshot.typeDiagnostics.filter(
      (item) => item.code === "type/mismatch",
    );

    expect(mismatchDiagnostics).toHaveLength(1);
    expect(mismatchDiagnostics[0]?.message).toContain("expected int, got bool");
  });

  it("infers integer membership against int set literal", async () => {
    const sample = `
      function calc() -> bool {
        int asn = 65001;
        bool in_set = asn ~ [ 65000, 65001, 65002 ];
        return in_set;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);

    expect(snapshot.typeDiagnostics).toHaveLength(0);
  });

  it("does not infer non-set int membership as bool", async () => {
    const sample = `
      function calc() -> int {
        int value = 65001 ~ 65002;
        return value;
      }
    `;

    const parsed = await parseBirdConfig(sample);
    const snapshot = buildCoreSnapshotFromParsed(parsed);

    expect(snapshot.typeDiagnostics).toHaveLength(0);
  });

  it("resolves include/template references across files", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `
            include "templates/common.conf";
            protocol bgp edge from edge_tpl {
            }
          `,
        },
        {
          uri: "/workspace/templates/common.conf",
          text: `
            template bgp edge_tpl {
            }
          `,
        },
      ],
    });

    const undefinedTemplateDiagnostics = result.diagnostics.filter(
      (item) => item.code === "semantic/undefined-reference",
    );

    expect(result.visitedUris).toContain("/workspace/main.conf");
    expect(result.visitedUris).toContain("/workspace/templates/common.conf");
    expect(undefinedTemplateDiagnostics).toHaveLength(0);
  });

  it("reports circular template inheritance in single document", async () => {
    const sample = `
      template bgp a from b {
      }
      template bgp b from c {
      }
      template bgp c from a {
      }
    `;

    const result = await buildCoreSnapshot(sample);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/circular-template",
      ),
    ).toBe(true);
  });

  it("reports circular template inheritance across includes", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `
            include "templates/a.conf";
            include "templates/b.conf";
            include "templates/c.conf";
          `,
        },
        {
          uri: "/workspace/templates/a.conf",
          text: `
            template bgp a from b {
            }
          `,
        },
        {
          uri: "/workspace/templates/b.conf",
          text: `
            template bgp b from c {
            }
          `,
        },
        {
          uri: "/workspace/templates/c.conf",
          text: `
            template bgp c from a {
            }
          `,
        },
      ],
    });

    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/circular-template",
      ),
    ).toBe(true);
  });

  it("loads include files through readFileText fallback", async () => {
    const readFileText = async (uri: string): Promise<string> => {
      if (uri === "file:///workspace/templates/common.conf") {
        return `
          template bgp edge_tpl {
          }
        `;
      }

      throw new Error(`missing ${uri}`);
    };

    const result = await resolveCrossFileReferences({
      entryUri: "file:///workspace/main.conf",
      documents: [
        {
          uri: "file:///workspace/main.conf",
          text: `
            include "./templates/common.conf";
            protocol bgp edge from edge_tpl {
            }
          `,
        },
      ],
      readFileText,
    });

    expect(result.visitedUris).toContain(
      "file:///workspace/templates/common.conf",
    );
    expect(result.stats.loadedFromFileSystem).toBe(1);
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/undefined-reference",
      ),
    ).toBe(false);
  });

  it("resolves includes from explicit include search paths", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "file:///workspace/main.conf",
      includeSearchPaths: ["file:///workspace/shared"],
      documents: [
        {
          uri: "file:///workspace/main.conf",
          text: `
            include "common.conf";
            protocol bgp edge from edge_tpl {
            }
          `,
        },
        {
          uri: "file:///workspace/shared/common.conf",
          text: `
            template bgp edge_tpl {
            }
          `,
        },
      ],
    });

    expect(result.visitedUris).toContain(
      "file:///workspace/shared/common.conf",
    );
    expect(
      result.diagnostics.some(
        (item) => item.code === "semantic/undefined-reference",
      ),
    ).toBe(false);
  });

  it("emits include warning when max depth is reached", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `include "a.conf";`,
        },
        {
          uri: "/workspace/a.conf",
          text: `include "b.conf";`,
        },
        {
          uri: "/workspace/b.conf",
          text: `template bgp edge_tpl { }`,
        },
      ],
      maxDepth: 0,
    });

    expect(result.stats.skippedByDepth).toBeGreaterThan(0);
    expect(
      result.diagnostics.some((item) => item.message.includes("max depth")),
    ).toBe(true);
  });

  it("emits include warning when max files limit is reached", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `
            include "a.conf";
            include "b.conf";
          `,
        },
        {
          uri: "/workspace/a.conf",
          text: `template bgp a_tpl { }`,
        },
        {
          uri: "/workspace/b.conf",
          text: `template bgp b_tpl { }`,
        },
      ],
      maxFiles: 1,
    });

    expect(result.stats.skippedByFileLimit).toBeGreaterThan(0);
    expect(
      result.diagnostics.some((item) => item.message.includes("max files")),
    ).toBe(true);
  });

  it("skips include paths outside workspace root by default", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `
            include "../outside.conf";
            include "inside.conf";
          `,
        },
        {
          uri: "/workspace/inside.conf",
          text: `template bgp inside_tpl { }`,
        },
        {
          uri: "/outside.conf",
          text: `template bgp outside_tpl { }`,
        },
      ],
    });

    expect(result.visitedUris).toContain("/workspace/inside.conf");
    expect(result.visitedUris).not.toContain("/outside.conf");
    expect(
      result.diagnostics.some((item) =>
        item.message.includes("outside workspace root"),
      ),
    ).toBe(true);
  });

  it("allows include paths outside workspace root when explicitly enabled", async () => {
    const result = await resolveCrossFileReferences({
      entryUri: "/workspace/main.conf",
      allowIncludeOutsideWorkspace: true,
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `include "../outside.conf";`,
        },
        {
          uri: "/outside.conf",
          text: `template bgp outside_tpl { }`,
        },
      ],
    });

    expect(result.visitedUris).toContain("/outside.conf");
  });

  it("reuses parsed document cache across repeated cross-file resolution calls", async () => {
    const options = {
      entryUri: "/workspace/main.conf",
      documents: [
        {
          uri: "/workspace/main.conf",
          text: `include "inside.conf";`,
        },
        {
          uri: "/workspace/inside.conf",
          text: `template bgp cached_tpl { }`,
        },
      ],
    };

    const first = await resolveCrossFileReferences(options);
    const second = await resolveCrossFileReferences(options);

    expect(first.stats.parsedCacheMisses).toBeGreaterThan(0);
    expect(second.stats.parsedCacheHits).toBeGreaterThan(0);
  });
});
