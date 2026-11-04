import {
  Range,
  TextEdit,
  type CancellationToken,
  type DocumentFormattingEditProvider,
  type DocumentRangeFormattingEditProvider,
  type FormattingOptions,
  type OutputChannel,
  type TextDocument,
} from "vscode";
import { loadBirdProjectConfigForFile } from "@birdcc/core";

import { LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import { createFormattingChanges } from "./edits.js";

let formatterModulePromise:
  | Promise<typeof import("@birdcc/formatter")>
  | undefined;
const getFormatterModule = (): Promise<typeof import("@birdcc/formatter")> => {
  formatterModulePromise ??= import("@birdcc/formatter");
  return formatterModulePromise;
};

export const createBirdFormattingProvider = (
  getConfiguration: (document: TextDocument) => ExtensionConfiguration,
  outputChannel: OutputChannel,
  isDocumentEligible: (document: TextDocument) => Promise<boolean> = async () =>
    true,
): DocumentFormattingEditProvider & DocumentRangeFormattingEditProvider => {
  const warningCache = new Set<string>();
  const provideEdits = async (
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> => {
    if (
      document.languageId !== LANGUAGE_ID ||
      token.isCancellationRequested ||
      range?.isEmpty
    )
      return [];
    const version = document.version;
    const configuration = getConfiguration(document);
    const guard = await enforceLargeFileGuard({
      document,
      configuration,
      outputChannel,
      featureName: "formatting",
      warningCache,
    });
    if (
      guard.skipped ||
      token.isCancellationRequested ||
      version !== document.version
    )
      return [];
    if (
      !(await isDocumentEligible(document)) ||
      token.isCancellationRequested ||
      version !== document.version
    )
      return [];

    try {
      const { formatBirdConfig } = await getFormatterModule();
      const projectFormatter =
        document.uri.scheme === "file"
          ? (await loadBirdProjectConfigForFile(document.uri.fsPath)).config
              .formatter
          : undefined;
      if (token.isCancellationRequested || version !== document.version)
        return [];
      const original = document.getText();
      const result = await formatBirdConfig(original, {
        engine: projectFormatter?.engine ?? configuration.formatterEngine,
        safeMode: projectFormatter?.safeMode ?? configuration.formatterSafeMode,
        indentSize: projectFormatter?.indentSize ?? options.tabSize,
        useTabs: projectFormatter?.useTabs ?? !options.insertSpaces,
        lineWidth: projectFormatter?.lineWidth,
      });
      if (
        !result.changed ||
        token.isCancellationRequested ||
        version !== document.version
      )
        return [];
      const changes = await createFormattingChanges(original, result.text);
      if (token.isCancellationRequested || version !== document.version)
        return [];
      return changes
        .map((change) =>
          TextEdit.replace(
            new Range(
              document.positionAt(change.start),
              document.positionAt(change.end),
            ),
            change.text,
          ),
        )
        .filter((edit) => !range || range.contains(edit.range));
    } catch (error) {
      outputChannel.appendLine(
        `[bird2-lsp] formatting failed: ${toSanitizedErrorDetails(error)}`,
      );
      return [];
    }
  };
  return {
    provideDocumentFormattingEdits: (document, options, token) =>
      provideEdits(document, options, token),
    provideDocumentRangeFormattingEdits: (document, range, options, token) =>
      provideEdits(document, options, token, range),
  };
};
