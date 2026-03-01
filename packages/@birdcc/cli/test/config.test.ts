import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadBirdccConfigForFile, resolveSeverityOverride } from "../src/config.js";

describe("@birdcc/cli config", () => {
  it("loads config by walking up from target file directory", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-config-load-"));
    const nestedDir = join(workspaceDir, "a", "b", "c");
    const targetFile = join(nestedDir, "bird.conf");

    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(workspaceDir, "birdcc.config.json"),
      JSON.stringify(
        {
          formatter: {
            engine: "builtin",
            indentSize: 4,
            lineWidth: 120,
            safeMode: false,
          },
          linter: {
            rules: {
              "cfg/*": "warning",
            },
          },
          bird: {
            validateCommand: "bird -p -c {file}",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const loaded = await loadBirdccConfigForFile(targetFile);

    expect(loaded.path).toBe(join(workspaceDir, "birdcc.config.json"));
    expect(loaded.config.formatter?.engine).toBe("builtin");
    expect(loaded.config.formatter?.indentSize).toBe(4);
    expect(loaded.config.bird?.validateCommand).toContain("{file}");
  });

  it("returns empty config when no config file exists", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-config-empty-"));
    const targetFile = join(workspaceDir, "bird.conf");
    await writeFile(targetFile, "router id 192.0.2.1;\n", "utf8");

    const loaded = await loadBirdccConfigForFile(targetFile);
    expect(loaded.path).toBeUndefined();
    expect(loaded.config).toEqual({});
  });

  it("throws readable errors for invalid config", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-config-invalid-"));
    const targetFile = join(workspaceDir, "bird.conf");
    await writeFile(targetFile, "router id 192.0.2.1;\n", "utf8");
    await writeFile(
      join(workspaceDir, "birdcc.config.json"),
      JSON.stringify({
        formatter: {
          lineWidth: -1,
        },
      }),
      "utf8",
    );

    await expect(loadBirdccConfigForFile(targetFile)).rejects.toThrow("Invalid birdcc config");
  });

  it("rejects out-of-range formatter options", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-config-out-of-range-"));
    const targetFile = join(workspaceDir, "bird.conf");
    await writeFile(targetFile, "router id 192.0.2.1;\n", "utf8");
    await writeFile(
      join(workspaceDir, "birdcc.config.json"),
      JSON.stringify({
        formatter: {
          indentSize: 32,
          lineWidth: 10,
        },
      }),
      "utf8",
    );

    await expect(loadBirdccConfigForFile(targetFile)).rejects.toThrow("Invalid birdcc config");
  });

  it("resolves exact and wildcard severity overrides", () => {
    const rules = {
      "cfg/*": "warning",
      "cfg/no-protocol": "info",
    } as const;

    expect(resolveSeverityOverride("cfg/no-protocol", rules)).toBe("info");
    expect(resolveSeverityOverride("cfg/missing-router-id", rules)).toBe("warning");
    expect(resolveSeverityOverride("bgp/missing-neighbor", rules)).toBeUndefined();
  });

  it("propagates permission errors during config discovery", async () => {
    if (process.platform === "win32") {
      return;
    }

    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-config-permission-"));
    const blockedDir = join(workspaceDir, "blocked");
    await mkdir(blockedDir, { recursive: true });
    await chmod(blockedDir, 0o000);

    try {
      const targetFile = join(blockedDir, "bird.conf");
      await expect(loadBirdccConfigForFile(targetFile)).rejects.toThrow();
    } finally {
      await chmod(blockedDir, 0o700);
    }
  });
});
