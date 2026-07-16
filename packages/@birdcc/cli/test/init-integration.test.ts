import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInit, type InitOptions } from "../src/commands/init.js";

const configExists = async (root: string): Promise<boolean> => {
  try {
    await access(join(root, "bird.config.json"));
    return true;
  } catch {
    return false;
  }
};

describe("birdcc init detector integration", () => {
  let root = "";
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  const baseOptions: InitOptions = {
    configName: "bird.config.json",
    dryRun: false,
    write: false,
    force: false,
    json: false,
  };

  beforeEach(async () => {
    process.exitCode = undefined;
    root = await mkdtemp(join(tmpdir(), "birdcc-init-foreign-"));
    await writeFile(
      join(root, "nginx.conf"),
      "events {}\nhttp { server { listen 80; } }\n",
      "utf8",
    );
  });

  afterEach(async () => {
    consoleLog.mockClear();
    consoleError.mockClear();
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ["ordinary", {}],
    ["write", { write: true }],
    ["json write", { json: true, write: true }],
  ])(
    "does not create a config for foreign-only projects in %s mode",
    async (_name, overrides) => {
      await runInit(root, { ...baseOptions, ...overrides });

      expect(await configExists(root)).toBe(false);
    },
  );

  it("shows rejected candidates in JSON mode", async () => {
    await runInit(root, { ...baseOptions, json: true });

    const result = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
      kind: string;
      primary: unknown;
      candidates: Array<{ path: string; qualified?: boolean }>;
    };
    expect(result.kind).toBe("not-found");
    expect(result.primary).toBeNull();
    expect(result.candidates).toContainEqual(
      expect.objectContaining({ path: "nginx.conf", qualified: false }),
    );
  });
});
