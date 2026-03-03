import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Range, TextDocument, TextDocumentChangeEvent } from "vscode";

import { createFallbackValidator } from "../src/fallback/validator.js";
import { defaultExtensionConfiguration } from "../src/types.js";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  stat: vi.fn(),
  enforceLargeFileGuard: vi.fn(async () => ({ skipped: false })),
  resolveValidationCommandTemplate: vi.fn(() => ({
    ok: true,
    value: {
      command: "bird",
      args: ["-p", "-c", "/tmp/bird.conf"],
    },
  })),
  parseBirdValidationOutput: vi.fn(() => []),
  diagnosticSet: vi.fn(),
  diagnosticDelete: vi.fn(),
  diagnosticClear: vi.fn(),
  diagnosticDispose: vi.fn(),
  onDidOpenTextDocument: undefined as
    | ((document: TextDocument) => void)
    | undefined,
  onDidSaveTextDocument: undefined as
    | ((document: TextDocument) => void)
    | undefined,
  onDidChangeTextDocument: undefined as
    | ((event: TextDocumentChangeEvent) => void)
    | undefined,
  onDidCloseTextDocument: undefined as
    | ((document: TextDocument) => void)
    | undefined,
  onDidGrantWorkspaceTrust: undefined as (() => void) | undefined,
  workspaceState: {
    isTrusted: true,
  },
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("node:fs/promises", () => ({
  stat: mocks.stat,
}));

vi.mock("../src/performance/large-file.js", () => ({
  enforceLargeFileGuard: mocks.enforceLargeFileGuard,
}));

vi.mock("../src/security/index.js", () => ({
  resolveValidationCommandTemplate: mocks.resolveValidationCommandTemplate,
  sanitizeLogMessage: (value: string) => value,
}));

vi.mock("../src/fallback/parser.js", () => ({
  parseBirdValidationOutput: mocks.parseBirdValidationOutput,
}));

vi.mock("vscode", () => ({
  DiagnosticSeverity: {
    Error: 0,
  },
  Position: class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  },
  Range: class Range {
    constructor(
      public readonly start: unknown,
      public readonly end: unknown,
    ) {}
  },
  languages: {
    createDiagnosticCollection: vi.fn(() => ({
      set: mocks.diagnosticSet,
      delete: mocks.diagnosticDelete,
      clear: mocks.diagnosticClear,
      dispose: mocks.diagnosticDispose,
    })),
  },
  window: {
    activeTextEditor: undefined,
    showWarningMessage: vi.fn(),
  },
  workspace: {
    get isTrusted() {
      return mocks.workspaceState.isTrusted;
    },
    workspaceFolders: [],
    onDidOpenTextDocument: vi.fn(
      (listener: (document: TextDocument) => void) => {
        mocks.onDidOpenTextDocument = listener;
        return { dispose: vi.fn() };
      },
    ),
    onDidSaveTextDocument: vi.fn(
      (listener: (document: TextDocument) => void) => {
        mocks.onDidSaveTextDocument = listener;
        return { dispose: vi.fn() };
      },
    ),
    onDidChangeTextDocument: vi.fn(
      (listener: (event: TextDocumentChangeEvent) => void) => {
        mocks.onDidChangeTextDocument = listener;
        return { dispose: vi.fn() };
      },
    ),
    onDidCloseTextDocument: vi.fn(
      (listener: (document: TextDocument) => void) => {
        mocks.onDidCloseTextDocument = listener;
        return { dispose: vi.fn() };
      },
    ),
    onDidGrantWorkspaceTrust: vi.fn((listener: () => void) => {
      mocks.onDidGrantWorkspaceTrust = listener;
      return { dispose: vi.fn() };
    }),
  },
}));

const createDocument = (path = "/tmp/bird.conf"): TextDocument =>
  ({
    languageId: "bird2",
    uri: {
      scheme: "file",
      fsPath: path,
      toString: () => `file://${path}`,
    },
    validateRange: (range: unknown) => range,
  }) as unknown as TextDocument;

const createChangeEvent = (
  document: TextDocument,
  text: string,
): TextDocumentChangeEvent => ({
  document,
  contentChanges: [
    {
      text,
      range: {} as Range,
      rangeOffset: 0,
      rangeLength: 0,
    },
  ],
  reason: undefined,
});

const getConfiguration = () => defaultExtensionConfiguration;

describe("fallback validator scheduling", () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
    mocks.stat.mockReset();
    mocks.enforceLargeFileGuard.mockClear();
    mocks.resolveValidationCommandTemplate.mockClear();
    mocks.parseBirdValidationOutput.mockReset();
    mocks.parseBirdValidationOutput.mockReturnValue([]);
    mocks.diagnosticSet.mockReset();
    mocks.diagnosticDelete.mockReset();
    mocks.diagnosticClear.mockReset();
    mocks.diagnosticDispose.mockReset();
    mocks.onDidOpenTextDocument = undefined;
    mocks.onDidSaveTextDocument = undefined;
    mocks.onDidChangeTextDocument = undefined;
    mocks.onDidCloseTextDocument = undefined;
    mocks.onDidGrantWorkspaceTrust = undefined;
    mocks.workspaceState.isTrusted = true;

    mocks.stat.mockResolvedValue({ mode: 0o644 });
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: { timeout: number },
        callback: (
          error: Error | null,
          stdout: string | Buffer,
          stderr: string | Buffer,
        ) => void,
      ) => {
        callback(null, "", "");
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces burst open/change/save events into a single validation run", async () => {
    vi.useFakeTimers();
    const validator = createFallbackValidator(getConfiguration, {
      appendLine: vi.fn(),
      dispose: vi.fn(),
    } as never);

    validator.activate();
    const document = createDocument();

    mocks.onDidOpenTextDocument?.(document);
    mocks.onDidChangeTextDocument?.(
      createChangeEvent(document, "router id 1.1.1.1;"),
    );
    mocks.onDidSaveTextDocument?.(document);
    mocks.onDidSaveTextDocument?.(document);

    await vi.advanceTimersByTimeAsync(299);
    expect(mocks.execFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitUntil(() => mocks.execFile.mock.calls.length === 1);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
  });

  it("drops stale in-flight validation errors after a newer run succeeds", async () => {
    const callbacks: Array<
      (
        error: Error | null,
        stdout: string | Buffer,
        stderr: string | Buffer,
      ) => void
    > = [];

    mocks.parseBirdValidationOutput.mockReturnValue([
      {
        message: "stale",
      },
    ]);
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: { timeout: number },
        callback: (
          error: Error | null,
          stdout: string | Buffer,
          stderr: string | Buffer,
        ) => void,
      ) => {
        callbacks.push(callback);
      },
    );

    const validator = createFallbackValidator(getConfiguration, {
      appendLine: vi.fn(),
      dispose: vi.fn(),
    } as never);
    const document = createDocument();

    void validator.validateDocument(document);
    await vi.waitUntil(() => callbacks.length === 1);
    void validator.validateDocument(document);
    await vi.waitUntil(() => callbacks.length === 2);
    callbacks[1]?.(null, "", "");
    await vi.waitUntil(() => mocks.diagnosticDelete.mock.calls.length > 0);

    callbacks[0]?.(new Error("stale"), "", "stale");
    await vi.waitUntil(() => mocks.execFile.mock.calls.length === 2);

    expect(mocks.diagnosticSet).not.toHaveBeenCalled();
  });

  it("preserves execFile error message when stdout/stderr are empty", async () => {
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: readonly string[],
        _options: { timeout: number },
        callback: (
          error: Error | null,
          stdout: string | Buffer,
          stderr: string | Buffer,
        ) => void,
      ) => {
        callback(new Error("spawn bird ENOENT"), "", "");
      },
    );

    const validator = createFallbackValidator(getConfiguration, {
      appendLine: vi.fn(),
      dispose: vi.fn(),
    } as never);
    const document = createDocument();

    await validator.validateDocument(document);

    expect(mocks.parseBirdValidationOutput).toHaveBeenCalledWith(
      "spawn bird ENOENT",
      document.uri,
    );
    expect(mocks.diagnosticSet).toHaveBeenCalledWith(
      document.uri,
      expect.arrayContaining([
        expect.objectContaining({
          message: "spawn bird ENOENT",
        }),
      ]),
    );
  });
});
