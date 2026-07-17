import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  selectAutoDetectedEntry,
  sniffProjectEntrypoints,
} from "../src/detection/index.js";
import { getCandidateDirectory } from "../src/detection/topology.js";

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
    expect(result.kind).toBe("single-ambiguous");
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

  it("#11 three direct includes → visitedCount counted correctly", async () => {
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
    expect(result.primary!.visitedCount).toBe(3);
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
    expect(result.kind).toBe("monorepo-multi-role");
    expect(result.primary!.path).toBe("bird.conf");
  });

  it("#16 200 generated .conf files → degrades gracefully without timeout", async () => {
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

  it("#17 keeps full-scan fallback when shallow scan only sees fragment confs", async () => {
    root = await createFixture({
      "filters/common.conf": `
define LOCAL_AS = 65001;
`,
      "sites/asia/tokyo/bird.conf": `
router id 10.0.0.1;
protocol device {}
`,
    });

    const result = await sniffProjectEntrypoints(root);
    expect(result.kind).toBe("single");
    expect(result.primary?.path).toBe("sites/asia/tokyo/bird.conf");
  });

  it.each([
    ["nginx.conf", "events {}\nhttp { server { listen 80; } }"],
    [
      "httpd.conf",
      "<VirtualHost *:80>\nServerName example.test\n</VirtualHost>",
    ],
    ["haproxy.conf", "global\n  daemon\ndefaults\n  mode http"],
    ["redis.conf", "maxmemory 2gb\nsave 60 1"],
    ["prometheus.conf", "global:\n  scrape_interval: 15s"],
    ["service.conf", "[Service]\nExecStart=/usr/bin/example"],
    ["empty.conf", ""],
    ["comments.conf", "# protocol device {}"],
    ["strings.conf", 'message = "protocol device {}";'],
    ["random.conf", "this is not a routing configuration"],
    ["external.conf", 'protocol http { endpoint = "https://example.test"; }'],
  ])("rejects foreign-only candidate %s", async (fileName, content) => {
    root = await createFixture({ [fileName]: content });

    const result = await sniffProjectEntrypoints(root);

    expect(result.kind).toBe("not-found");
    expect(result.primary).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      path: fileName,
      qualified: false,
      role: "external",
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "detection/no-bird-evidence" }),
    );
  });

  it.each(["bird.conf", "bird2.conf", "bird3.conf", "bird6.conf"])(
    "accepts empty canonical entry %s",
    async (fileName) => {
      root = await createFixture({ [fileName]: "" });

      const result = await sniffProjectEntrypoints(root);

      expect(result.kind).toBe("single");
      expect(result.primary?.path).toBe(fileName);
      expect(selectAutoDetectedEntry(result)?.path).toBe(fileName);
    },
  );

  it("accepts an explicitly configured empty main", async () => {
    root = await createFixture({ "custom.conf": "" });

    const result = await sniffProjectEntrypoints(root, {
      explicitMain: "./custom.conf",
    });

    expect(result.kind).toBe("single");
    expect(result.primary?.path).toBe("custom.conf");
  });

  it("resolves includes relative to the includer and excludes included fragments", async () => {
    root = await createFixture({
      "routers/main.conf": [
        'include "../shared/vars.conf";',
        'include "../protocols/*.conf";',
      ].join("\n"),
      "shared/vars.conf": "define LOCAL_AS = 65001;",
      "protocols/bgp.conf": "protocol bgp edge { local as LOCAL_AS; }",
      "protocols/device.conf": "protocol device {}",
    });

    const result = await sniffProjectEntrypoints(root);

    expect(result.primary).toMatchObject({
      path: "routers/main.conf",
      visitedCount: 3,
      missingIncludes: 0,
    });
    expect(
      result.candidates.find(
        (candidate) => candidate.path === "protocols/bgp.conf",
      ),
    ).toMatchObject({ includedByCount: 1 });
  });

  it("does not reward missing includes", async () => {
    root = await createFixture({
      "main.conf": 'include "missing/*.conf";',
    });

    const result = await sniffProjectEntrypoints(root);

    expect(result.primary).toMatchObject({
      path: "main.conf",
      visitedCount: 0,
      missingIncludes: 1,
    });
    expect(
      result.primary?.signals.some((signal) =>
        signal.name.startsWith("visited-count"),
      ),
    ).toBe(false);
  });

  it("keeps mixed foreign and BIRD candidates explainable", async () => {
    root = await createFixture({
      "nginx.conf": "events {}\nhttp { server { listen 80; } }",
      "main.conf": "protocol device {}",
    });

    const result = await sniffProjectEntrypoints(root);

    expect(result.primary?.path).toBe("main.conf");
    expect(
      result.candidates.find((candidate) => candidate.path === "nginx.conf"),
    ).toMatchObject({ qualified: false, role: "external" });
  });

  it("uses a stable path tie-break and refuses ambiguous auto-selection", async () => {
    root = await createFixture({
      "a.conf": "protocol device {}",
      "b.conf": "protocol device {}",
    });

    const first = await sniffProjectEntrypoints(root);
    const second = await sniffProjectEntrypoints(root);

    expect(first.kind).toBe("single-ambiguous");
    expect(first.primary?.path).toBe("a.conf");
    expect(second.candidates.map((candidate) => candidate.path)).toEqual(
      first.candidates.map((candidate) => candidate.path),
    );
    expect(selectAutoDetectedEntry(first)).toBeNull();
  });

  it("reports candidate truncation explicitly", async () => {
    root = await createFixture({
      "a.conf": "protocol device {}",
      "b.conf": "protocol kernel {}",
    });

    const result = await sniffProjectEntrypoints(root, { maxCandidates: 1 });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "detection/candidate-limit-reached" }),
    );
  });

  it("does not let a shallow canonical entry hide a deep instance", async () => {
    root = await createFixture({
      "bird.conf": "protocol device {}",
      "sites/asia/tokyo/bird.conf": "protocol kernel {}",
    });

    const result = await sniffProjectEntrypoints(root);

    expect(result.kind).toBe("monorepo-multi-entry");
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(
      expect.arrayContaining(["bird.conf", "sites/asia/tokyo/bird.conf"]),
    );
    expect(selectAutoDetectedEntry(result)).toBeNull();
  });
});

describe("candidate path normalization", () => {
  it("returns stable POSIX directories for Windows candidate paths", () => {
    expect(getCandidateDirectory("sites\\tokyo\\bird.conf")).toBe(
      "sites/tokyo",
    );
    expect(getCandidateDirectory("sites/tokyo/bird.conf")).toBe("sites/tokyo");
  });
});
