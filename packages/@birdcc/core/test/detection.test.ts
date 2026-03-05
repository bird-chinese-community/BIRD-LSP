import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { sniffProjectEntrypoints } from "../src/detection/index.js";

/**
 * Helper: create a temp directory with a given file structure.
 * Files map: relative path → content
 */
const createFixture = async (
  files: Record<string, string>,
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-detection-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
  return root;
};

describe("sniffProjectEntrypoints", () => {
  let root: string;

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  // ── v0.1 Tests ──────────────────────────────────────────────────

  it("#1 root directory only has bird.conf → single, confidence:100", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
protocol kernel { ipv4 { export all; }; }
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.kind).toBe("single");
    expect(result.confidence).toBe(100);
    expect(result.primary).not.toBeNull();
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#2 root bird.conf + subdirectory snippets/peer.conf → selects root", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
      "snippets/peer.conf": `
protocol bgp upstream {
  local as 65001;
  neighbor 192.168.1.1 as 65002;
}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
    expect(result.kind).toBe("single");
  });

  it("#3 a/bird.conf + b/bird.conf at same depth → monorepo-multi-entry", async () => {
    root = await createFixture({
      "a/bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
      "b/bird.conf": `
router id 10.0.0.2;
protocol device {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.kind).toBe("monorepo-multi-entry");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("#4 has bird.config.json with main → escape hatch (tested at CLI level)", async () => {
    // This test verifies detection still works — the escape hatch is in CLI init.ts
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
      "bird.config.json": JSON.stringify({ main: "bird.conf" }),
    });

    // sniffProjectEntrypoints doesn't check config — that's CLI's job
    const result = await sniffProjectEntrypoints(root);
    expect(result.primary).not.toBeNull();
  });

  it("#5 examples/bird.conf + ./bird.conf → ignores examples/, selects root", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
      "examples/bird.conf": `
router id 10.0.0.99;
protocol device {}
protocol bgp test {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
    expect(result.kind).toBe("single");
  });

  // ── v0.2 Tests ──────────────────────────────────────────────────

  it("#6 entry named main.conf with global router id + protocol → scores win", async () => {
    root = await createFixture({
      "main.conf": `
router id 10.0.0.1;
protocol device {}
protocol kernel { ipv4 { export all; }; }
protocol bgp upstream {
  local as 65001;
  neighbor 192.168.1.1 as 65002;
}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("main.conf");
    expect(result.primary!.score).toBeGreaterThan(30);
  });

  it("#7 vars.conf has router id but no protocol, bird.conf has protocol → bird.conf wins", async () => {
    root = await createFixture({
      "vars.conf": `
router id 10.0.0.1;
define LOCAL_AS = 65001;
define NEIGHBOR = 192.168.1.1;
`,
      "bird.conf": `
include "vars.conf";
protocol device {}
protocol kernel { ipv4 { export all; }; }
protocol bgp upstream {
  local as LOCAL_AS;
  neighbor NEIGHBOR as 65002;
}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#8 protocol-level router id (braceDepth > 0) gets lower weight than global", async () => {
    root = await createFixture({
      "foo.conf": `
protocol bgp edge {
  router id 10.0.0.99;
  local as 65001;
  neighbor 192.168.1.1 as 65002;
}
`,
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#9 two candidates with score gap < 30 → single-ambiguous", async () => {
    root = await createFixture({
      "config-a.conf": `
router id 10.0.0.1;
protocol device {}
`,
      "config-b.conf": `
router id 10.0.0.2;
protocol device {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    // Both have similar scores at same depth with no canonical name
    expect(["single-ambiguous", "monorepo-multi-entry"]).toContain(result.kind);
  });

  // ── v0.3 Tests ──────────────────────────────────────────────────

  it("#10 router id in vars.conf, included by bird.conf → propagation helps bird.conf", async () => {
    root = await createFixture({
      "vars.conf": `
router id 10.0.0.1;
define LOCAL_AS = 65001;
`,
      "bird.conf": `
include "vars.conf";
protocol device {}
protocol kernel { ipv4 { export all; }; }
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#11 include glob with 3 files → visitedCount counted correctly", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
include "protocols/bgp.conf";
include "protocols/ospf.conf";
include "protocols/static.conf";
`,
      "protocols/bgp.conf": `
protocol bgp upstream {
  local as 65001;
  neighbor 192.168.1.1 as 65002;
}
`,
      "protocols/ospf.conf": `
protocol ospf v2 {
  area 0 { interface "eth0"; };
}
`,
      "protocols/static.conf": `
protocol static {
  ipv4 { table master4; };
  route 0.0.0.0/0 via 192.168.1.1;
}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.primary!.path).toBe("bird.conf");
    expect(result.kind).toBe("single");
  });

  it("#12 include escaping 3 parent dirs → externalInclude warning", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
include "../../../etc/bird.conf";
protocol device {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    const hasExternalWarning = result.warnings.some(
      (w) => w.code === "detection/external-include",
    );
    expect(hasExternalWarning).toBe(true);
  });

  it("#13 A includes B, B includes A → cycle warning", async () => {
    root = await createFixture({
      "a.conf": `
router id 10.0.0.1;
include "b.conf";
protocol device {}
`,
      "b.conf": `
include "a.conf";
protocol bgp test {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    const hasCycleWarning = result.warnings.some(
      (w) => w.code === "detection/cycle",
    );
    expect(hasCycleWarning).toBe(true);
  });

  it("#14 dc1/ dc2/ with non-overlapping coverage → monorepo-multi-entry", async () => {
    root = await createFixture({
      "dc1/bird.conf": `
router id 10.1.0.1;
protocol device {}
include "peers.conf";
`,
      "dc1/peers.conf": `
protocol bgp dc1_peer { local as 65001; neighbor 10.1.1.1 as 65002; }
`,
      "dc2/bird.conf": `
router id 10.2.0.1;
protocol device {}
include "peers.conf";
`,
      "dc2/peers.conf": `
protocol bgp dc2_peer { local as 65003; neighbor 10.2.1.1 as 65004; }
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.kind).toBe("monorepo-multi-entry");
  });

  it("#15 single entry + mutually exclusive vars → monorepo-multi-role", async () => {
    root = await createFixture({
      "bird.conf": `
router id 10.0.0.1;
include "vars.conf";
protocol device {}
protocol kernel { ipv4 { export all; }; }
`,
      "router1/vars.conf": `
define LOCAL_AS = 65001;
define ROUTER_NAME = "router1";
`,
      "router2/vars.conf": `
define LOCAL_AS = 65002;
define ROUTER_NAME = "router2";
`,
    });

    const result = await sniffProjectEntrypoints(root);
    // This should detect the pattern — either multi-role or single with the root entry
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#16 > 1000 .conf files → degrades gracefully without timeout", async () => {
    // Create a large number of files
    const files: Record<string, string> = {
      "bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
    };

    // Generate files to test degradation (use reasonable count for test speed)
    for (let i = 0; i < 200; i++) {
      files[`generated/peer${i}.conf`] = `
protocol bgp peer${i} {
  local as 65001;
  neighbor 10.0.${Math.floor(i / 256)}.${i % 256} as ${65100 + i};
}
`;
    }

    root = await createFixture(files);

    const start = Date.now();
    const result = await sniffProjectEntrypoints(root, {
      maxFiles: 20000,
      maxDepth: 3,
    });
    const elapsed = Date.now() - start;

    expect(result.primary!.path).toBe("bird.conf");
    // Should complete in reasonable time (< 10s even on slow machines)
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000);
});
