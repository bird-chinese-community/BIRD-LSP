import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextDocument } from "vscode";

import { enforceLargeFileGuard } from "../src/performance/large-file.js";
import { defaultExtensionConfiguration } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  stat: vi.fn(async () => ({ size: 0 })),
  setStatusBarMessage: vi.fn(),
  showErrorMessage: vi.fn(async () => undefined),
  openExternal: vi.fn(async () => true),
}));

vi.mock("vscode", () => ({
  Uri: {
    parse: (value: string) => ({ toString: () => value }),
  },
  env: {
    openExternal: mocks.openExternal,
  },
  window: {
    setStatusBarMessage: mocks.setStatusBarMessage,
    showErrorMessage: mocks.showErrorMessage,
  },
  workspace: {
    fs: {
      stat: mocks.stat,
    },
  },
}));

const createDocument = (uri = "file:///tmp/large.conf"): TextDocument =>
  ({
    uri: {
      scheme: "file",
      toString: () => uri,
    },
    getText: () => "",
  }) as unknown as TextDocument;

const createConfiguration = (maxBytes: number) => ({
  ...defaultExtensionConfiguration,
  performanceMaxFileSizeBytes: maxBytes,
});

describe("large-file guard", () => {
  beforeEach(() => vi.clearAllMocks());
  it("measures the dirty buffer instead of the smaller saved file", async () => {
    const before = mocks.stat.mock.calls.length;
    const result = await enforceLargeFileGuard({
      document: {
        ...createDocument("file:///workspace/dirty.bird"),
        isDirty: true,
        getText: () => "x".repeat(2048),
      },
      configuration: createConfiguration(1024),
      outputChannel: { appendLine: vi.fn() } as never,
      featureName: "formatting",
      warningCache: new Set(),
    });
    expect(result.skipped).toBe(true);
    expect(result.bytes).toBe(2048);
    expect(mocks.stat.mock.calls.length).toBe(before);
  });

  it("skips large files and only shows one error alert across features", async () => {
    mocks.stat.mockResolvedValueOnce({ size: 8 * 1024 * 1024 });
    mocks.stat.mockResolvedValueOnce({ size: 8 * 1024 * 1024 });

    const outputChannel = {
      appendLine: vi.fn(),
    } as never;
    const document = createDocument();
    const configuration = createConfiguration(1024);

    const first = await enforceLargeFileGuard({
      document,
      configuration,
      outputChannel,
      featureName: "type hints",
      warningCache: new Set<string>(),
    });
    const second = await enforceLargeFileGuard({
      document,
      configuration,
      outputChannel,
      featureName: "formatting",
      warningCache: new Set<string>(),
    });

    expect(first.skipped).toBe(true);
    expect(second.skipped).toBe(true);
    expect(mocks.showErrorMessage).toHaveBeenCalledTimes(1);
  });
});
