import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseBirdConfig: vi.fn(),
}));

vi.mock("@birdcc/parser", () => ({
  parseBirdConfig: mocks.parseBirdConfig,
}));

import { analyzeFileContent } from "../src/detection/content-scanner.js";

describe("content scanner resilience", () => {
  let root = "";

  afterEach(async () => {
    mocks.parseBirdConfig.mockReset();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("isolates parser failures to the affected candidate", async () => {
    root = await mkdtemp(join(tmpdir(), "birdcc-content-scan-"));
    await writeFile(join(root, "broken.conf"), "protocol device {}", "utf8");
    mocks.parseBirdConfig.mockRejectedValueOnce(new Error("parser failed"));

    await expect(analyzeFileContent(root, "broken.conf")).resolves.toBeNull();
  });

  it.each([
    ["canonical filename", "bird.conf", false, "canonical-filename"],
    ["explicit main", "custom.conf", true, "explicit-main"],
  ])(
    "preserves the %s escape hatch when the parser fails",
    async (_name, fileName, explicitMain, reason) => {
      root = await mkdtemp(join(tmpdir(), "birdcc-content-scan-"));
      await writeFile(join(root, fileName), "protocol device {", "utf8");
      mocks.parseBirdConfig.mockRejectedValueOnce(new Error("parser failed"));

      const analysis = await analyzeFileContent(root, fileName, explicitMain);

      expect(analysis?.eligibility).toEqual({
        eligible: true,
        reason,
        declarationKinds: [],
      });
      expect(analysis?.signals.hasProtocolDevice).toBe(true);
    },
  );

  it("ignores a recovered include declaration without a string path", async () => {
    root = await mkdtemp(join(tmpdir(), "birdcc-content-scan-"));
    await writeFile(join(root, "recovered.conf"), "include;", "utf8");
    mocks.parseBirdConfig.mockResolvedValueOnce({
      program: {
        declarations: [{ kind: "include", path: undefined }],
      },
    });

    const analysis = await analyzeFileContent(root, "recovered.conf");

    expect(analysis?.signals.includeStatements).toEqual([]);
  });
});
