import { describe, expect, it, vi } from "vitest";

import {
  buildMarketplaceTarget,
  parseArguments,
  verifyMarketplace,
} from "../scripts/verify-marketplace.mjs";

describe("marketplace publication verifier", () => {
  it("builds a version-specific VS Code Marketplace endpoint", () => {
    expect(
      buildMarketplaceTarget({
        registry: "vscode",
        publisher: "BIRDCC",
        extensionName: "bird2-lsp",
        version: "0.5.2",
      }),
    ).toEqual({
      label: "VS Code Marketplace",
      statusUrl:
        "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/BIRDCC/vsextensions/bird2-lsp/0.5.2/vspackage",
      previewUrl:
        "https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp",
    });
  });

  it("builds a version-specific Open VSX endpoint", () => {
    expect(
      buildMarketplaceTarget({
        registry: "openvsx",
        publisher: "BIRDCC",
        extensionName: "bird2-lsp",
        version: "0.5.2",
      }),
    ).toEqual({
      label: "Open VSX",
      statusUrl: "https://open-vsx.org/api/BIRDCC/bird2-lsp/0.5.2",
      previewUrl: "https://open-vsx.org/extension/BIRDCC/bird2-lsp",
    });
  });

  it("rejects incomplete CLI arguments", () => {
    expect(() => parseArguments(["--registry", "vscode"])).toThrow(
      "--manifest is required",
    );
  });

  it("retries until the requested version is available", async () => {
    const responses = [
      new Response(null, { status: 404 }),
      new Response(null, { status: 200 }),
    ];
    const fetchImplementation = vi.fn(async () => responses.shift()!);
    const sleepImplementation = vi.fn(async () => undefined);

    await expect(
      verifyMarketplace({
        registry: "openvsx",
        publisher: "BIRDCC",
        extensionName: "bird2-lsp",
        version: "0.5.2",
        initialDelayMs: 0,
        pollIntervalMs: 1,
        maxWaitMs: 100,
        fetchImplementation,
        sleepImplementation,
      }),
    ).resolves.toBeUndefined();

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleepImplementation).toHaveBeenCalledOnce();
  });

  it("accepts response bodies without a cancel method", async () => {
    const fetchImplementation = vi.fn(async () => ({
      body: {},
      status: 200,
    }));

    await expect(
      verifyMarketplace({
        registry: "vscode",
        publisher: "BIRDCC",
        extensionName: "bird2-lsp",
        version: "0.5.2",
        initialDelayMs: 0,
        maxWaitMs: 0,
        fetchImplementation,
      }),
    ).resolves.toBeUndefined();
  });
});
