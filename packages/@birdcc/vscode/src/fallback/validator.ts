import { execFile } from "node:child_process";
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

import { LANGUAGE_ID } from "../constants.js";
import type { ExtensionConfiguration } from "../types.js";
import { parseBirdValidationOutput } from "./parser.js";

const execFileAsync = promisify(execFile);

export interface FallbackValidator {
  activate: () => void;
  validateDocument: (document: TextDocument) => Promise<void>;
  validateActiveEditor: () => Promise<void>;
  dispose: () => void;
}

const splitCommandLine = (commandLine: string): string[] => {
  const tokens = commandLine.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ""));
};

const renderCommandTemplate = (
  commandTemplate: string,
  filePath: string,
): string[] => {
  const rendered = commandTemplate.replaceAll("{file}", filePath);
  return splitCommandLine(rendered);
};

const isBirdDocument = (document: TextDocument): boolean =>
  document.languageId === LANGUAGE_ID && document.uri.scheme === "file";

export const createFallbackValidator = (
  getConfiguration: () => ExtensionConfiguration,
  outputChannel: OutputChannel,
): FallbackValidator => {
  const diagnosticCollection =
    languages.createDiagnosticCollection("bird2-fallback");
  const disposables: Disposable[] = [];

  const clearDocumentDiagnostics = (document: TextDocument): void => {
    diagnosticCollection.delete(document.uri);
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

    const command = renderCommandTemplate(
      configuration.validationCommand,
      document.uri.fsPath,
    );
    if (command.length === 0) {
      clearDocumentDiagnostics(document);
      return;
    }

    const [bin, ...args] = command;
    outputChannel.appendLine(
      `[bird2-lsp] fallback validate: ${[bin, ...args].join(" ")}`,
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
            message: typedError.message || "bird -p validation failed",
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
