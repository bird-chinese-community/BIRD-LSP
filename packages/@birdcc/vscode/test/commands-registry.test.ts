import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutputChannel } from "vscode";

import {
  BIRD_COMMAND_IDS,
  registerBirdCommands,
} from "../src/commands/registry.js";
import { defaultExtensionConfiguration } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  commandHandlers: new Map<string, () => void>(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  executeCommand: vi.fn(async () => undefined),
  openExternal: vi.fn(async () => true),
  updateConfiguration: vi.fn(async () => undefined),
  workspaceState: {
    isTrusted: true,
  },
}));

vi.mock("vscode", () => ({
  ConfigurationTarget: {
    Workspace: 5,
    Global: 1,
  },
  Uri: {
    parse: (value: string) => ({
      toString: () => value,
    }),
  },
  env: {
    openExternal: mocks.openExternal,
  },
  workspace: {
    get isTrusted() {
      return mocks.workspaceState.isTrusted;
    },
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      update: mocks.updateConfiguration,
    })),
  },
  window: {
    activeTextEditor: undefined,
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
  },
  commands: {
    registerCommand: vi.fn((id: string, handler: () => void) => {
      mocks.commandHandlers.set(id, handler);
      return {
        dispose: vi.fn(),
      };
    }),
    executeCommand: mocks.executeCommand,
  },
}));

const createContext = () => ({
  outputChannel: {
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  } as unknown as OutputChannel,
  lifecycle: {
    restart: vi.fn(async () => undefined),
  },
  getConfiguration: () => defaultExtensionConfiguration,
  validateActiveDocument: vi.fn(async () => undefined),
  reloadConfiguration: vi.fn(async () => undefined),
});

describe("commands registry", () => {
  beforeEach(() => {
    mocks.commandHandlers.clear();
    mocks.workspaceState.isTrusted = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks restart command in untrusted workspace", async () => {
    const context = createContext();
    mocks.workspaceState.isTrusted = false;

    registerBirdCommands(context);
    const handler = mocks.commandHandlers.get(
      BIRD_COMMAND_IDS.restartLanguageServer,
    );

    expect(handler).toBeDefined();
    handler?.();
    await vi.waitUntil(() => mocks.showWarningMessage.mock.calls.length > 0);

    expect(mocks.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(context.lifecycle.restart).not.toHaveBeenCalled();
  });

  it("calls reloadConfiguration once when reload command executes", async () => {
    const context = createContext();

    registerBirdCommands(context);
    const handler = mocks.commandHandlers.get(
      BIRD_COMMAND_IDS.reloadConfiguration,
    );

    expect(handler).toBeDefined();
    handler?.();
    await vi.waitUntil(
      () => mocks.showInformationMessage.mock.calls.length > 0,
    );

    expect(context.reloadConfiguration).toHaveBeenCalledTimes(1);
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      "BIRD2 configuration reloaded.",
    );
  });
});
