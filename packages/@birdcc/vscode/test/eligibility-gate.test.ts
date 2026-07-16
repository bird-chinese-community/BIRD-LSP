import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextDocument } from "vscode";

const mocks = vi.hoisted(() => ({
  workspaceRoot: "",
}));

const disposable = () => ({ dispose: vi.fn() });

vi.mock("vscode", () => ({
  workspace: {
    getWorkspaceFolder: () => ({
      uri: { fsPath: mocks.workspaceRoot },
    }),
    createFileSystemWatcher: () => ({
      ...disposable(),
      onDidCreate: () => disposable(),
      onDidChange: () => disposable(),
      onDidDelete: () => disposable(),
    }),
    onDidChangeWorkspaceFolders: () => disposable(),
    onDidCloseTextDocument: () => disposable(),
  },
}));

import { createBirdDocumentEligibilityGate } from "../src/eligibility/gate.js";

const createDocument = (
  filePath: string,
  text: string,
  version: number,
): TextDocument =>
  ({
    uri: {
      scheme: "file",
      fsPath: filePath,
      toString: () => `file://${filePath}`,
    },
    version,
    getText: () => text,
  }) as unknown as TextDocument;

describe("VS Code BIRD document eligibility gate", () => {
  beforeEach(async () => {
    mocks.workspaceRoot = await mkdtemp(join(tmpdir(), "birdcc-vscode-gate-"));
  });

  afterEach(async () => {
    await rm(mocks.workspaceRoot, { recursive: true, force: true });
  });

  it("re-evaluates by URI and document version", async () => {
    const gate = createBirdDocumentEligibilityGate();
    const filePath = join(mocks.workspaceRoot, "nginx.conf");

    await expect(
      gate.isEligible(
        createDocument(
          filePath,
          "events {}\nhttp { server { listen 80; } }",
          1,
        ),
      ),
    ).resolves.toBe(false);
    await expect(
      gate.isEligible(createDocument(filePath, "protocol device {}", 2)),
    ).resolves.toBe(true);

    gate.dispose();
  });

  it("accepts canonical and explicitly configured empty documents", async () => {
    const gate = createBirdDocumentEligibilityGate();
    const canonicalPath = join(mocks.workspaceRoot, "bird3.conf");
    const explicitPath = join(mocks.workspaceRoot, "custom.conf");
    await writeFile(
      join(mocks.workspaceRoot, "bird.config.json"),
      JSON.stringify({ main: "custom.conf" }),
      "utf8",
    );

    await expect(
      gate.isEligible(createDocument(canonicalPath, "", 1)),
    ).resolves.toBe(true);
    await expect(
      gate.isEligible(createDocument(explicitPath, "", 1)),
    ).resolves.toBe(true);

    gate.dispose();
  });

  it("continues searching after a non-matching project configuration", async () => {
    const gate = createBirdDocumentEligibilityGate();
    const explicitPath = join(mocks.workspaceRoot, "custom.conf");
    await writeFile(
      join(mocks.workspaceRoot, "bird.config.json"),
      JSON.stringify({ main: "other.conf" }),
      "utf8",
    );
    await writeFile(
      join(mocks.workspaceRoot, "birdcc.config.json"),
      JSON.stringify({ main: "custom.conf" }),
      "utf8",
    );

    await expect(
      gate.isEligible(createDocument(explicitPath, "", 1)),
    ).resolves.toBe(true);

    gate.dispose();
  });

  it("matches explicit-main casing according to the host file system", async () => {
    const gate = createBirdDocumentEligibilityGate();
    const explicitPath = join(mocks.workspaceRoot, "Custom.conf");
    const caseVariantPath = join(mocks.workspaceRoot, "custom.conf");
    await writeFile(explicitPath, "", "utf8");
    await writeFile(
      join(mocks.workspaceRoot, "bird.config.json"),
      JSON.stringify({ main: "custom.conf" }),
      "utf8",
    );

    const caseVariantExists = await realpath(caseVariantPath).then(
      () => true,
      () => false,
    );
    const shouldMatch =
      (process.platform === "win32" || process.platform === "darwin") &&
      caseVariantExists;

    await expect(
      gate.isEligible(createDocument(explicitPath, "", 1)),
    ).resolves.toBe(shouldMatch);

    gate.dispose();
  });

  it("caches explicit-main lookup until project configuration is invalidated", async () => {
    const gate = createBirdDocumentEligibilityGate();
    const explicitPath = join(mocks.workspaceRoot, "custom.conf");
    const configPath = join(mocks.workspaceRoot, "bird.config.json");
    await writeFile(
      configPath,
      JSON.stringify({ main: "custom.conf" }),
      "utf8",
    );

    await expect(
      gate.isEligible(createDocument(explicitPath, "", 1)),
    ).resolves.toBe(true);
    await writeFile(configPath, JSON.stringify({}), "utf8");
    await expect(
      gate.isEligible(createDocument(explicitPath, "", 2)),
    ).resolves.toBe(true);

    gate.clear();
    await expect(
      gate.isEligible(createDocument(explicitPath, "", 3)),
    ).resolves.toBe(false);

    gate.dispose();
  });

  it.each(["null", "[]", '"bird.conf"'])(
    "ignores non-object project configuration %s",
    async (configContent) => {
      const gate = createBirdDocumentEligibilityGate();
      const customPath = join(mocks.workspaceRoot, "custom.conf");
      await writeFile(
        join(mocks.workspaceRoot, "bird.config.json"),
        configContent,
        "utf8",
      );

      await expect(
        gate.isEligible(createDocument(customPath, "", 1)),
      ).resolves.toBe(false);

      gate.dispose();
    },
  );
});
