import {
  Hover,
  InlayHint,
  InlayHintKind,
  MarkdownString,
  Position,
  Range,
  languages,
  workspace,
  type Disposable,
  type OutputChannel,
  type TextDocument,
} from "vscode";

import { LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import {
  collectFunctionReturnHints,
  type FunctionReturnHint,
} from "./inference.js";
import { createTypeHintCache } from "./cache.js";

export interface BirdTypeHintRegistrationContext {
  readonly getConfiguration: () => ExtensionConfiguration;
  readonly outputChannel: OutputChannel;
}

interface CachedHintSnapshot {
  readonly version: number;
  readonly hints: readonly FunctionReturnHint[];
}

const TYPE_HINT_CACHE_MAX_ENTRIES = 50;
const TYPE_HINT_CACHE_TTL_MS = 10 * 60 * 1000;

const toRange = (
  line: number,
  column: number,
  endLine: number,
  endColumn: number,
): Range =>
  new Range(
    new Position(line - 1, Math.max(column - 1, 0)),
    new Position(endLine - 1, Math.max(endColumn - 1, 0)),
  );

const isBirdFileDocument = (document: TextDocument): boolean =>
  document.languageId === LANGUAGE_ID && document.uri.scheme === "file";

const appendReturnDetails = (
  markdown: MarkdownString,
  hint: FunctionReturnHint,
): void => {
  if (hint.returnDetails.length === 0) {
    markdown.appendText("No explicit return statement found.\n");
    return;
  }

  markdown.appendText("Return expressions:\n");
  for (const detail of hint.returnDetails.slice(0, 5)) {
    markdown.appendText(
      `- L${detail.line}: ${detail.expression} -> ${detail.inferredType}\n`,
    );
  }

  if (hint.returnDetails.length > 5) {
    markdown.appendText(`- ... and ${hint.returnDetails.length - 5} more\n`);
  }
};

export const registerBirdTypeHintProviders = ({
  getConfiguration,
  outputChannel,
}: BirdTypeHintRegistrationContext): readonly Disposable[] => {
  const cache = createTypeHintCache<FunctionReturnHint>({
    maxEntries: TYPE_HINT_CACHE_MAX_ENTRIES,
    ttlMs: TYPE_HINT_CACHE_TTL_MS,
  });
  const warningCache = new Set<string>();

  const loadHints = async (
    document: TextDocument,
  ): Promise<readonly FunctionReturnHint[]> => {
    const key = document.uri.toString();
    const cachedHints = cache.get(key, document.version);
    if (cachedHints) {
      return cachedHints;
    }

    const hints = await collectFunctionReturnHints(document.getText());
    const snapshot: CachedHintSnapshot = { version: document.version, hints };
    cache.set(key, snapshot.version, snapshot.hints);
    return hints;
  };

  const hoverProvider = languages.registerHoverProvider(
    { language: LANGUAGE_ID, scheme: "file" },
    {
      provideHover: async (document, position): Promise<Hover | null> => {
        const configuration = getConfiguration();
        if (
          !configuration.typeHintsEnabled ||
          !configuration.typeHintsHoverEnabled ||
          !isBirdFileDocument(document)
        ) {
          return null;
        }

        try {
          const guard = await enforceLargeFileGuard({
            document,
            configuration,
            outputChannel,
            featureName: "type hints",
            warningCache,
          });
          if (guard.skipped) {
            return null;
          }

          const hints = await loadHints(document);
          const matchedHint = hints.find((hint) =>
            toRange(
              hint.declaration.nameRange.line,
              hint.declaration.nameRange.column,
              hint.declaration.nameRange.endLine,
              hint.declaration.nameRange.endColumn,
            ).contains(position),
          );

          if (!matchedHint) {
            return null;
          }

          const markdown = new MarkdownString("", false);
          markdown.appendText(`function ${matchedHint.declaration.name}\n\n`);
          if (matchedHint.declaredReturnType) {
            markdown.appendText(
              `Declared return type: ${matchedHint.declaredReturnType}\n\n`,
            );
          }
          markdown.appendText(
            `Inferred return type: ${matchedHint.inferredReturnType} (POC)\n\n`,
          );
          appendReturnDetails(markdown, matchedHint);
          markdown.isTrusted = false;

          return new Hover(
            markdown,
            toRange(
              matchedHint.declaration.nameRange.line,
              matchedHint.declaration.nameRange.column,
              matchedHint.declaration.nameRange.endLine,
              matchedHint.declaration.nameRange.endColumn,
            ),
          );
        } catch (error) {
          outputChannel.appendLine(
            `[bird2-lsp] type hints hover failed: ${toSanitizedErrorDetails(error)}`,
          );
          return null;
        }
      },
    },
  );

  const inlayProvider = languages.registerInlayHintsProvider(
    { language: LANGUAGE_ID, scheme: "file" },
    {
      provideInlayHints: async (document, range): Promise<InlayHint[]> => {
        const configuration = getConfiguration();
        if (
          !configuration.typeHintsEnabled ||
          !configuration.typeHintsInlayEnabled ||
          !isBirdFileDocument(document)
        ) {
          return [];
        }

        try {
          const guard = await enforceLargeFileGuard({
            document,
            configuration,
            outputChannel,
            featureName: "type hints",
            warningCache,
          });
          if (guard.skipped) {
            return [];
          }

          const hints = await loadHints(document);
          return hints
            .filter((hint) => {
              const returnType =
                hint.declaredReturnType ?? hint.inferredReturnType;
              return returnType !== "unknown";
            })
            .filter((hint) =>
              range.intersection(
                toRange(
                  hint.declaration.line,
                  hint.declaration.column,
                  hint.declaration.endLine,
                  hint.declaration.endColumn,
                ),
              ),
            )
            .map((hint) => {
              const returnType =
                hint.declaredReturnType ?? hint.inferredReturnType;
              const inlayHint = new InlayHint(
                new Position(
                  hint.declaration.nameRange.endLine - 1,
                  Math.max(hint.declaration.nameRange.endColumn - 1, 0),
                ),
                `: ${returnType}`,
                InlayHintKind.Type,
              );

              inlayHint.paddingLeft = true;
              inlayHint.tooltip = hint.declaredReturnType
                ? `Declared return type: ${hint.declaredReturnType}`
                : "Inferred return type (POC)";
              return inlayHint;
            });
        } catch (error) {
          outputChannel.appendLine(
            `[bird2-lsp] type hints inlay failed: ${toSanitizedErrorDetails(error)}`,
          );
          return [];
        }
      },
    },
  );

  const closeSubscription = workspace.onDidCloseTextDocument((document) => {
    cache.delete(document.uri.toString());
  });

  return [hoverProvider, inlayProvider, closeSubscription];
};
