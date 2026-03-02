import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";

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

const execFileAsync = promisify(execFile);

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

const isSafeFilePermission = async (filePath: string): Promise<boolean> => {
  if (process.platform === "win32") {
    return true;
  }

  try {
    const fileStat = await stat(filePath);
    return !isWorldWritable(fileStat.mode);
  } catch {
    return true;
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
  let trustWarningShown = false;

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

  const validateDocument = async (document: TextDocument): Promise<void> => {
    if (!isBirdDocument(document)) {
      return;
    }

    const configuration = getConfiguration();
    if (!configuration.validationEnabled) {
      clearDocumentDiagnostics(document);
      return;
    }

    if (!workspace.isTrusted) {
      clearDocumentDiagnostics(document);
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

    if (!(await isSafeFilePermission(document.uri.fsPath))) {
      outputChannel.appendLine(
        sanitizeLogMessage(
          `[bird2-lsp] fallback validation skipped for world-writable file: ${document.uri.fsPath}`,
        ),
      );
      clearDocumentDiagnostics(document);
      return;
    }

    if (!(await approveValidationCommandIfNeeded(configuration))) {
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
      await execFileAsync(bin, args, {
        timeout: configuration.validationTimeoutMs,
      });
      clearDocumentDiagnostics(document);
    } catch (error) {
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
        void validateDocument(document);
      }),
    );

    disposables.push(
      workspace.onDidSaveTextDocument((document) => {
        if (!getConfiguration().validationOnSave) {
          return;
        }

        void validateDocument(document);
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
