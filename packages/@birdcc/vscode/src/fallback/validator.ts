import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";

import {
  DiagnosticSeverity,
  Position,
  Range,
  languages,
  window,
  workspace,
  type Disposable,
  type OutputChannel,
  type TextDocument,
} from "vscode";

import { DEFAULT_VALIDATION_COMMAND, LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import {
  resolveValidationCommandTemplate,
  sanitizeLogMessage,
} from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import { parseBirdValidationOutput } from "./parser.js";

const VALIDATION_DEBOUNCE_MS = 300;

const execFileAsync = async (
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(
      command,
      [...args],
      { timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise({
            ...error,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
          });
          return;
        }

        resolvePromise({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
  });

export interface FallbackValidator {
  activate: () => void;
  validateDocument: (document: TextDocument) => Promise<void>;
  validateActiveEditor: () => Promise<void>;
  dispose: () => void;
}

const isBirdDocument = (document: TextDocument): boolean =>
  document.languageId === LANGUAGE_ID && document.uri.scheme === "file";

const normalizeForComparison = (filePath: string): string => {
  const normalized = normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

const isPathInsideRoot = (filePath: string, rootPath: string): boolean => {
  const fileNormalized = normalizeForComparison(resolve(filePath));
  const rootNormalized = normalizeForComparison(resolve(rootPath));
  const relPath = relative(rootNormalized, fileNormalized);

  if (!relPath) {
    return true;
  }

  return !relPath.startsWith("..") && !isAbsolute(relPath);
};

const isPathInsideWorkspace = (
  filePath: string,
  workspaceRoots: readonly string[],
): boolean => {
  if (workspaceRoots.length === 0) {
    return true;
  }

  return workspaceRoots.some((workspaceRoot) =>
    isPathInsideRoot(filePath, workspaceRoot),
  );
};

const isWorldWritable = (mode: number): boolean => (mode & 0o002) !== 0;

type FilePermissionCheckResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "world-writable" | "stat-failed";
      readonly details?: string;
    };

const checkFilePermission = async (
  filePath: string,
): Promise<FilePermissionCheckResult> => {
  if (process.platform === "win32") {
    return { ok: true };
  }

  try {
    const fileStat = await stat(filePath);
    if (isWorldWritable(fileStat.mode)) {
      return {
        ok: false,
        reason: "world-writable",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "stat-failed",
      details: sanitizeLogMessage(String(error)),
    };
  }
};

export const createFallbackValidator = (
  getConfiguration: () => ExtensionConfiguration,
  outputChannel: OutputChannel,
): FallbackValidator => {
  const diagnosticCollection =
    languages.createDiagnosticCollection("bird2-fallback");
  const disposables: Disposable[] = [];
  const warningCache = new Set<string>();
  const approvedCustomValidationCommands = new Set<string>();
  const pendingValidationTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  const latestValidationTicketByUri = new Map<string, number>();
  let nextValidationTicket = 0;
  let trustWarningShown = false;

  const clearPendingValidationTimer = (uri: string): void => {
    const timer = pendingValidationTimers.get(uri);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    pendingValidationTimers.delete(uri);
  };

  const isLatestValidationTicket = (uri: string, ticket: number): boolean =>
    latestValidationTicketByUri.get(uri) === ticket;

  const clearDocumentDiagnostics = (document: TextDocument): void => {
    diagnosticCollection.delete(document.uri);
  };

  const approveValidationCommandIfNeeded = async (
    configuration: ExtensionConfiguration,
  ): Promise<boolean> => {
    const commandTemplate = configuration.validationCommand.trim();
    if (commandTemplate === DEFAULT_VALIDATION_COMMAND) {
      return true;
    }

    if (approvedCustomValidationCommands.has(commandTemplate)) {
      return true;
    }

    const selection = await window.showWarningMessage(
      [
        "BIRD2 fallback validation will execute a custom command from workspace settings.",
        "Only allow this if you trust the workspace and command.",
      ].join("\n"),
      { modal: true },
      "Allow in this session",
      "Cancel",
    );
    if (selection !== "Allow in this session") {
      return false;
    }

    approvedCustomValidationCommands.add(commandTemplate);
    return true;
  };

  const runValidation = async (
    document: TextDocument,
    ticket: number,
  ): Promise<void> => {
    const uri = document.uri.toString();
    if (!isLatestValidationTicket(uri, ticket)) {
      return;
    }

    if (!isBirdDocument(document)) {
      return;
    }

    const configuration = getConfiguration();
    if (!configuration.validationEnabled) {
      if (isLatestValidationTicket(uri, ticket)) {
        clearDocumentDiagnostics(document);
      }
      return;
    }

    if (!workspace.isTrusted) {
      if (isLatestValidationTicket(uri, ticket)) {
        clearDocumentDiagnostics(document);
      }
      if (!trustWarningShown) {
        outputChannel.appendLine(
          "[bird2-lsp] workspace is untrusted; skip fallback validation command execution",
        );
        trustWarningShown = true;
      }
      return;
    }

    trustWarningShown = false;
    const guard = await enforceLargeFileGuard({
      document,
      configuration,
      outputChannel,
      featureName: "fallback validation",
      warningCache,
    });
    if (!isLatestValidationTicket(uri, ticket)) {
      return;
    }

    if (guard.skipped) {
      clearDocumentDiagnostics(document);
      return;
    }

    const workspaceRoots = (
      workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
    ).filter((path) => path.length > 0);
    if (!isPathInsideWorkspace(document.uri.fsPath, workspaceRoots)) {
      outputChannel.appendLine(
        sanitizeLogMessage(
          `[bird2-lsp] validation command blocked for file outside workspace root: ${document.uri.fsPath}`,
        ),
      );
      clearDocumentDiagnostics(document);
      return;
    }

    const permissionCheck = await checkFilePermission(document.uri.fsPath);
    if (!isLatestValidationTicket(uri, ticket)) {
      return;
    }

    if (!permissionCheck.ok) {
      if (permissionCheck.reason === "world-writable") {
        outputChannel.appendLine(
          sanitizeLogMessage(
            `[bird2-lsp] fallback validation skipped for world-writable file: ${document.uri.fsPath}`,
          ),
        );
      } else {
        outputChannel.appendLine(
          sanitizeLogMessage(
            [
              "[bird2-lsp] fallback validation skipped because file permission check failed:",
              document.uri.fsPath,
              permissionCheck.details ? `(${permissionCheck.details})` : "",
            ]
              .join(" ")
              .trim(),
          ),
        );
      }

      clearDocumentDiagnostics(document);
      return;
    }

    const approved = await approveValidationCommandIfNeeded(configuration);
    if (!isLatestValidationTicket(uri, ticket)) {
      return;
    }

    if (!approved) {
      outputChannel.appendLine(
        "[bird2-lsp] fallback validation command execution cancelled by user",
      );
      clearDocumentDiagnostics(document);
      return;
    }

    const command = resolveValidationCommandTemplate(
      configuration.validationCommand,
      document.uri.fsPath,
    );
    if (!command.ok) {
      outputChannel.appendLine(
        `[bird2-lsp] validation command rejected: ${command.reason}`,
      );
      clearDocumentDiagnostics(document);
      return;
    }

    const { command: bin, args } = command.value;
    outputChannel.appendLine(
      sanitizeLogMessage(
        `[bird2-lsp] fallback validate: ${[bin, ...args].join(" ")}`,
      ),
    );

    try {
      await execFileAsync(bin, args, configuration.validationTimeoutMs);
      if (!isLatestValidationTicket(uri, ticket)) {
        return;
      }
      clearDocumentDiagnostics(document);
    } catch (error) {
      if (!isLatestValidationTicket(uri, ticket)) {
        return;
      }

      const typedError = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      const combinedOutput =
        `${typedError.stdout ?? ""}\n${typedError.stderr ?? ""}`.trim();

      const diagnostics = parseBirdValidationOutput(
        combinedOutput || typedError.message || "bird -p validation failed",
        document.uri,
      );

      if (diagnostics.length === 0) {
        diagnosticCollection.set(document.uri, [
          {
            message: sanitizeLogMessage(
              typedError.message || "bird -p validation failed",
            ),
            severity: DiagnosticSeverity.Error,
            source: "bird -p",
            range: document.validateRange(
              new Range(new Position(0, 0), new Position(0, 1)),
            ),
          },
        ]);
        return;
      }

      diagnosticCollection.set(document.uri, diagnostics);
    }
  };

  const validateDocument = async (document: TextDocument): Promise<void> => {
    const uri = document.uri.toString();
    clearPendingValidationTimer(uri);
    const ticket = ++nextValidationTicket;
    latestValidationTicketByUri.set(uri, ticket);
    await runValidation(document, ticket);
  };

  const scheduleValidation = (document: TextDocument): void => {
    if (!isBirdDocument(document)) {
      return;
    }

    const uri = document.uri.toString();
    clearPendingValidationTimer(uri);
    const ticket = ++nextValidationTicket;
    latestValidationTicketByUri.set(uri, ticket);

    const timer = setTimeout(() => {
      pendingValidationTimers.delete(uri);
      void runValidation(document, ticket);
    }, VALIDATION_DEBOUNCE_MS);

    pendingValidationTimers.set(uri, timer);
  };

  const validateActiveEditor = async (): Promise<void> => {
    const activeDocument = window.activeTextEditor?.document;
    if (!activeDocument) {
      return;
    }

    await validateDocument(activeDocument);
  };

  const activate = (): void => {
    disposables.push(
      workspace.onDidOpenTextDocument((document) => {
        scheduleValidation(document);
      }),
    );

    disposables.push(
      workspace.onDidSaveTextDocument((document) => {
        if (!getConfiguration().validationOnSave) {
          return;
        }

        scheduleValidation(document);
      }),
    );

    disposables.push(
      workspace.onDidCloseTextDocument((document) => {
        const uri = document.uri.toString();
        clearPendingValidationTimer(uri);
        latestValidationTicketByUri.delete(uri);
        clearDocumentDiagnostics(document);
      }),
    );

    disposables.push(
      workspace.onDidGrantWorkspaceTrust(() => {
        trustWarningShown = false;
        void validateActiveEditor();
      }),
    );

    void validateActiveEditor();
  };

  const dispose = (): void => {
    for (const timer of pendingValidationTimers.values()) {
      clearTimeout(timer);
    }
    pendingValidationTimers.clear();
    latestValidationTicketByUri.clear();

    for (const disposable of disposables) {
      disposable.dispose();
    }
    disposables.length = 0;
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
  };

  return {
    activate,
    validateDocument,
    validateActiveEditor,
    dispose,
  };
};
