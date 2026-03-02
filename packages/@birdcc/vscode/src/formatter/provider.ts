import { formatBirdConfig } from "@birdcc/formatter";
import type { OutputChannel, TextDocument } from "vscode";
import { Range, TextEdit, type DocumentFormattingEditProvider } from "vscode";

import { LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";

const getDocumentFullRange = (document: TextDocument): Range =>
  new Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );

export const createBirdFormattingProvider = (
  getConfiguration: () => ExtensionConfiguration,
  outputChannel: OutputChannel,
): DocumentFormattingEditProvider => {
  const warningCache = new Set<string>();

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
        const result = await formatBirdConfig(document.getText(), {
          engine: configuration.formatterEngine,
          safeMode: configuration.formatterSafeMode,
        });

        if (!result.changed) {
          return [];
        }

        return [TextEdit.replace(getDocumentFullRange(document), result.text)];
      } catch (error) {
        outputChannel.appendLine(
          `[bird2-lsp] formatting failed: ${toSanitizedErrorDetails(error)}`,
        );
        return [];
      }
    },
  };
};
