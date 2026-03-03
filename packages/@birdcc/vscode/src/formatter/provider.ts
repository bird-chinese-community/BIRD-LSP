import type { OutputChannel, TextDocument } from "vscode";
import {
  Range,
  TextEdit,
  type DocumentFormattingEditProvider,
  type DocumentRangeFormattingEditProvider,
} from "vscode";

import { LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";

const getDocumentFullRange = (document: TextDocument): Range =>
  new Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );

let formatterModulePromise:
  | Promise<typeof import("@birdcc/formatter")>
  | undefined;

const getFormatterModule = (): Promise<typeof import("@birdcc/formatter")> => {
  formatterModulePromise ??= import("@birdcc/formatter");
  return formatterModulePromise;
};

export const createBirdFormattingProvider = (
  getConfiguration: () => ExtensionConfiguration,
  outputChannel: OutputChannel,
): DocumentFormattingEditProvider & DocumentRangeFormattingEditProvider => {
  const warningCache = new Set<string>();

  const formatText = async (
    input: string,
    configuration: ExtensionConfiguration,
  ): Promise<string | undefined> => {
    const { formatBirdConfig } = await getFormatterModule();
    const result = await formatBirdConfig(input, {
      engine: configuration.formatterEngine,
      safeMode: configuration.formatterSafeMode,
    });

    if (!result.changed) {
      return undefined;
    }

    return result.text;
  };

  return {
    provideDocumentFormattingEdits: async (document) => {
      if (document.languageId !== LANGUAGE_ID) {
        return [];
      }

      const configuration = getConfiguration();
      const guard = await enforceLargeFileGuard({
        document,
        configuration,
        outputChannel,
        featureName: "formatting",
        warningCache,
      });
      if (guard.skipped) {
        return [];
      }

      try {
        const formattedText = await formatText(
          document.getText(),
          configuration,
        );
        if (!formattedText) {
          return [];
        }

        return [
          TextEdit.replace(getDocumentFullRange(document), formattedText),
        ];
      } catch (error) {
        outputChannel.appendLine(
          `[bird2-lsp] formatting failed: ${toSanitizedErrorDetails(error)}`,
        );
        return [];
      }
    },
    provideDocumentRangeFormattingEdits: async (document, range) => {
      if (document.languageId !== LANGUAGE_ID) {
        return [];
      }

      if (range.isEmpty || document.getText(range).trim().length === 0) {
        return [];
      }

      const configuration = getConfiguration();
      const guard = await enforceLargeFileGuard({
        document,
        configuration,
        outputChannel,
        featureName: "range formatting",
        warningCache,
      });
      if (guard.skipped) {
        return [];
      }

      try {
        const formattedText = await formatText(
          document.getText(range),
          configuration,
        );
        if (!formattedText) {
          return [];
        }

        return [TextEdit.replace(range, formattedText)];
      } catch (error) {
        outputChannel.appendLine(
          `[bird2-lsp] formatting failed: ${toSanitizedErrorDetails(error)}`,
        );
        return [];
      }
    },
  };
};
