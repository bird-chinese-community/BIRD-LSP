import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutputChannel } from "vscode";

import { createLanguageClient } from "../src/client/client.js";
import { defaultExtensionConfiguration } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  resolveServerCommand: vi.fn(),
  setTrace: vi.fn(),
  capturedServerOptions: undefined as
    | { command: string; args?: readonly string[] }
    | undefined,
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
}));

vi.mock("../src/security/index.js", () => ({
  resolveServerCommand: mocks.resolveServerCommand,
}));

vi.mock("vscode-languageclient/node.js", () => ({
  LanguageClient: class LanguageClient {
    constructor(
      _id: string,
      _name: string,
      serverOptions: { command: string; args?: readonly string[] },
    ) {
      mocks.capturedServerOptions = serverOptions;
    }

    public setTrace(): void {
      mocks.setTrace();
    }
  },
  RevealOutputChannelOn: {
    Never: 4,
  },
  Trace: {
    Off: 0,
    Messages: 1,
    Verbose: 2,
  },
}));

const createOutputChannelMock = (): OutputChannel =>
  ({
    appendLine: vi.fn(),
  }) as unknown as OutputChannel;

describe("language client command resolution", () => {
  beforeEach(() => {
    mocks.existsSync.mockReset();
    mocks.resolveServerCommand.mockReset();
    mocks.setTrace.mockReset();
    mocks.capturedServerOptions = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses bundled lsp server when default serverPath is configured", () => {
    mocks.existsSync.mockReturnValue(true);

    const outputChannel = createOutputChannelMock();
    createLanguageClient(
      defaultExtensionConfiguration,
      outputChannel,
      "/tmp/ext",
    );

    expect(mocks.resolveServerCommand).not.toHaveBeenCalled();
    expect(mocks.capturedServerOptions).toEqual({
      command: process.execPath,
      args: ["/tmp/ext/node_modules/@birdcc/lsp/dist/server.js", "--stdio"],
    });
  });

  it("falls back to custom resolution when bundled server is missing", () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.resolveServerCommand.mockReturnValue({
      ok: true,
      value: {
        command: "birdcc",
        args: ["lsp", "--stdio"],
      },
    });

    const outputChannel = createOutputChannelMock();
    createLanguageClient(
      defaultExtensionConfiguration,
      outputChannel,
      "/tmp/ext",
    );

    expect(mocks.resolveServerCommand).toHaveBeenCalledTimes(1);
    expect(mocks.capturedServerOptions).toEqual({
      command: "birdcc",
      args: ["lsp", "--stdio"],
    });
  });
});
