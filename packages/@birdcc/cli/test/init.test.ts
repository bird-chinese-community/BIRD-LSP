import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runInit } from "../src/commands/init.js";
import {
  detectIndentSizeFromFiles,
  detectIndentSizeFromText,
} from "../src/commands/init-indent.js";

vi.mock("@birdcc/core", () => ({
  sniffProjectEntrypoints: vi.fn(),
}));

import { sniffProjectEntrypoints } from "@birdcc/core";

describe("@birdcc/cli init", () => {
  beforeEach(() => {
    vi.mocked(sniffProjectEntrypoints).mockReset();
  });

  it("detects 2-space indentation from a single config text", () => {
    const result = detectIndentSizeFromText(
      [
        "protocol bgp edge {",
        "  ipv4 {",
        "    import all;",
        "  };",
        "}",
        "",
      ].join("\n"),
    );

    expect(result.indentSize).toBe(2);
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("detects 4-space indentation from multiple files", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-init-indent-"));
    const a = "a.conf";
    const b = "b.conf";

    await writeFile(
      join(workspaceDir, a),
      [
        "protocol bgp edge {",
        "    ipv4 {",
        "        import all;",
        "    };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(workspaceDir, b),
      [
        "filter test {",
        "    if net ~ [ 192.0.2.0/24 ] then accept;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await detectIndentSizeFromFiles(workspaceDir, [a, b]);

    expect(result.indentSize).toBe(4);
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("writes formatter.indentSize when init can sniff indentation", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-init-run-"));
    const entryFile = join(workspaceDir, "bird.conf");

    await writeFile(
      entryFile,
      [
        "protocol bgp edge {",
        "    ipv4 {",
        "        import all;",
        "    };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    vi.mocked(sniffProjectEntrypoints).mockResolvedValue({
      kind: "single",
      confidence: 95,
      primary: {
        path: "bird.conf",
        role: "entry",
        score: 100,
        signals: [],
      },
      candidates: [
        {
          path: "bird.conf",
          role: "entry",
          score: 100,
          signals: [],
        },
      ],
      warnings: [],
    });

    await runInit(workspaceDir, {
      configName: "bird.config.json",
      dryRun: false,
      write: true,
      force: true,
      json: false,
    });

    const content = JSON.parse(
      await readFile(join(workspaceDir, "bird.config.json"), "utf8"),
    ) as { formatter?: { indentSize?: number } };

    expect(content.formatter?.indentSize).toBe(4);
  });

  it("skips formatter block when indentation confidence is too low", async () => {
    const workspaceDir = await mkdtemp(
      join(tmpdir(), "birdcc-init-low-confidence-"),
    );
    const entryFile = join(workspaceDir, "bird.conf");

    await mkdir(join(workspaceDir, "nested"), { recursive: true });
    await writeFile(
      entryFile,
      ["router id 192.0.2.1;", 'include "nested/filters.conf";', ""].join("\n"),
      "utf8",
    );

    vi.mocked(sniffProjectEntrypoints).mockResolvedValue({
      kind: "single",
      confidence: 95,
      primary: {
        path: "bird.conf",
        role: "entry",
        score: 100,
        signals: [],
      },
      candidates: [
        {
          path: "bird.conf",
          role: "entry",
          score: 100,
          signals: [],
        },
      ],
      warnings: [],
    });

    await runInit(workspaceDir, {
      configName: "bird.config.json",
      dryRun: false,
      write: true,
      force: true,
      json: false,
    });

    const content = JSON.parse(
      await readFile(join(workspaceDir, "bird.config.json"), "utf8"),
    ) as { formatter?: { indentSize?: number } };

    expect(content.formatter).toBeUndefined();
  });
});
