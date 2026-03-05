import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { detectWorkspaceEntry } from "../src/init/workspace-init.js";

const createMockConnection = () =>
  ({
    console: {
      log: () => undefined,
    },
    sendNotification: () => undefined,
  }) as unknown as import("vscode-languageserver/node.js").Connection;

describe("detectWorkspaceEntry", () => {
  it("builds suggested entry URI via file URL conversion", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-init-"));
    try {
      await mkdir(join(root, "site a"), { recursive: true });
      const entryPath = join(root, "site a", "bird.conf");
      await writeFile(
        entryPath,
        ["router id 10.0.0.1;", "protocol device {}", ""].join("\n"),
        "utf8",
      );

      const result = await detectWorkspaceEntry(
        pathToFileURL(root).toString(),
        createMockConnection(),
      );

      expect(result.suggestedEntryUri).toBe(
        pathToFileURL(entryPath).toString(),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
