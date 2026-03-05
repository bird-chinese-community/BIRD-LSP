import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceEntries } from "../src/workspace-patterns.js";

const createFile = async (filePath: string, content = ""): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
};

describe("resolveWorkspaceEntries", () => {
  it("supports include + exclude patterns in order", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-workspaces-"));
    try {
      await createFile(
        join(root, "sites", "a", "bird.conf"),
        "router id 1.1.1.1;",
      );
      await createFile(
        join(root, "sites", "legacy", "bird.conf"),
        "router id 2.2.2.2;",
      );

      const resolved = await resolveWorkspaceEntries(root, [
        "sites/*",
        "!sites/legacy",
      ]);

      expect(resolved).toEqual([join(root, "sites", "a", "bird.conf")]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("matches nested directories with globstar", async () => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-workspaces-"));
    try {
      await createFile(
        join(root, "regions", "asia", "tokyo", "bird.conf"),
        "router id 3.3.3.3;",
      );
      await createFile(
        join(root, "regions", "eu", "paris", "bird.conf"),
        "router id 4.4.4.4;",
      );

      const resolved = await resolveWorkspaceEntries(root, ["regions/**"]);
      expect(resolved).toContain(
        join(root, "regions", "asia", "tokyo", "bird.conf"),
      );
      expect(resolved).toContain(
        join(root, "regions", "eu", "paris", "bird.conf"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
