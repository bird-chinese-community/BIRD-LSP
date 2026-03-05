import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveProjectAnalysisOptions } from "../src/project-config.js";

const toUri = (path: string): string => pathToFileURL(path).toString();

describe("resolveProjectAnalysisOptions", () => {
  it("uses main entry from bird.config.json for single-project setup", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-main-"));
    try {
      await mkdir(join(root, "filters"), { recursive: true });
      await mkdir(join(root, "peers"), { recursive: true });
      await writeFile(join(root, "bird.conf"), "router id 1.1.1.1;\n", "utf8");
      await writeFile(
        join(root, "bird.config.json"),
        JSON.stringify(
          {
            main: "bird.conf",
            includePaths: ["./filters"],
            crossFile: {
              maxDepth: 9,
              maxFiles: 300,
              externalIncludes: true,
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      const documentPath = join(root, "peers", "upstream.conf");
      await writeFile(documentPath, "protocol bgp edge {}\n", "utf8");

      const resolved = await resolveProjectAnalysisOptions({
        documentUri: toUri(documentPath),
        workspaceRootUris: [toUri(root)],
        defaults: { maxDepth: 16, maxFiles: 256 },
      });

      expect(resolved.mode).toBe("main");
      expect(resolved.entryUri).toBe(toUri(join(root, "bird.conf")));
      expect(resolved.workspaceRootUri).toBe(toUri(root));
      expect(resolved.includeSearchPathUris).toContain(toUri(root));
      expect(resolved.includeSearchPathUris).toContain(
        toUri(join(root, "filters")),
      );
      expect(resolved.maxDepth).toBe(9);
      expect(resolved.maxFiles).toBe(300);
      expect(resolved.allowIncludeOutsideWorkspace).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses workspace bird.conf entry when workspaces are configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-ws-"));
    try {
      await mkdir(join(root, "sites", "tokyo"), { recursive: true });
      await mkdir(join(root, "shared"), { recursive: true });
      await writeFile(
        join(root, "bird.config.json"),
        JSON.stringify(
          {
            workspaces: ["sites/*"],
            includePaths: ["./shared"],
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        join(root, "sites", "tokyo", "bird.conf"),
        "router id 2.2.2.2;\n",
        "utf8",
      );
      const documentPath = join(root, "sites", "tokyo", "peers.conf");
      await writeFile(documentPath, "protocol device {}\n", "utf8");

      const resolved = await resolveProjectAnalysisOptions({
        documentUri: toUri(documentPath),
        workspaceRootUris: [toUri(root)],
        defaults: { maxDepth: 16, maxFiles: 256 },
      });

      expect(resolved.mode).toBe("workspace");
      expect(resolved.entryUri).toBe(
        toUri(join(root, "sites", "tokyo", "bird.conf")),
      );
      expect(resolved.workspaceRootUri).toBe(
        toUri(join(root, "sites", "tokyo")),
      );
      expect(resolved.includeSearchPathUris).toContain(toUri(root));
      expect(resolved.includeSearchPathUris).toContain(
        toUri(join(root, "shared")),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to document entry when no project config exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-doc-"));
    try {
      const documentPath = join(root, "bird.conf");
      await writeFile(documentPath, "router id 3.3.3.3;\n", "utf8");

      const resolved = await resolveProjectAnalysisOptions({
        documentUri: toUri(documentPath),
        workspaceRootUris: [toUri(root)],
        defaults: { maxDepth: 16, maxFiles: 256 },
      });

      expect(resolved.mode).toBe("document");
      expect(resolved.entryUri).toBe(toUri(documentPath));
      expect(resolved.workspaceRootUri).toBe(toUri(root));
      expect(resolved.includeSearchPathUris).toEqual([]);
      expect(resolved.maxDepth).toBe(16);
      expect(resolved.maxFiles).toBe(256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
