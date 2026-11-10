import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutputChannel } from "vscode";

import type { LanguageClientOptions } from "vscode-languageclient/node.js";
import {
  createLanguageClient,
  resolveLanguageServerCommand,
} from "../src/client/client.js";
import { defaultExtensionConfiguration } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  resolveServerCommand: vi.fn(),
  setTrace: vi.fn(),
  capturedClientOptions: undefined as LanguageClientOptions | undefined,
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
      public clientOptions: LanguageClientOptions,
    ) {
      mocks.capturedServerOptions = serverOptions;
      mocks.capturedClientOptions = clientOptions;
    }

    public setTrace(): void {
      mocks.setTrace();
    }

    public sendRequest(): Promise<void> {
      return Promise.resolve();
    }

    public handleFailedRequest(): void {}

    public createDefaultErrorHandler() {
      return { error: vi.fn(), closed: vi.fn() };
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
    mocks.capturedClientOptions = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses bundled lsp server when default serverPath is configured", () => {
    mocks.existsSync.mockReturnValue(true);

    const outputChannel = createOutputChannelMock();
    const resolved = resolveLanguageServerCommand(
      defaultExtensionConfiguration,
      outputChannel,
      "/tmp/ext",
    );

    expect(mocks.resolveServerCommand).not.toHaveBeenCalled();
    expect(resolved).toEqual({
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
    const resolved = resolveLanguageServerCommand(
      defaultExtensionConfiguration,
      outputChannel,
      "/tmp/ext",
    );

    expect(mocks.resolveServerCommand).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual({
      command: "birdcc",
      args: ["lsp", "--stdio"],
    });
  });

  it("responds to DN42 configuration with the current user setting", async () => {
    mocks.existsSync.mockReturnValue(true);
    let enabled = false;
    createLanguageClient(
      defaultExtensionConfiguration,
      createOutputChannelMock(),
      "/extension",
      () => ({
        ...defaultExtensionConfiguration,
        intelDn42Enabled: enabled,
      }),
    );
    expect(mocks.capturedClientOptions?.markdown).toEqual({
      supportHtml: true,
    });
    const middleware =
      mocks.capturedClientOptions?.middleware?.workspace?.configuration;
    expect(middleware).toBeDefined();
    const params = {
      items: [
        {
          section: "bird2-lsp.intel.dn42.enabled",
          scopeUri: "file:///workspace/bird.conf",
        },
        { section: "other" },
      ],
    };
    const next = async () => [true, "kept"];
    expect(await middleware!(params, undefined as never, next)).toEqual([
      false,
      "kept",
    ]);
    enabled = true;
    expect(await middleware!(params, undefined as never, next)).toEqual([
      true,
      "kept",
    ]);
    enabled = false;
    expect(await middleware!(params, undefined as never, next)).toEqual([
      false,
      "kept",
    ]);
  });
});
