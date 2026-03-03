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

import { BIRD_DOCUMENT_SELECTOR, LANGUAGE_ID } from "../constants.js";
import { enforceLargeFileGuard } from "../performance/large-file.js";
import { toSanitizedErrorDetails } from "../security/index.js";
import { showGuidedErrorMessage } from "../support/faq.js";
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

const isBirdDocument = (document: TextDocument): boolean =>
  document.languageId === LANGUAGE_ID;

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
  const inFlightLoads = new Map<
    string,
    Promise<readonly FunctionReturnHint[]>
  >();
  const warningCache = new Set<string>();
  const errorCache = new Set<string>();

  const loadHints = async (
    document: TextDocument,
  ): Promise<readonly FunctionReturnHint[]> => {
    const uri = document.uri.toString();
    const version = document.version;
    const cacheKey = `${uri}@${version}`;
    const cachedHints = cache.get(uri, version);
    if (cachedHints) {
      return cachedHints;
    }

    const inFlight = inFlightLoads.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const task = (async (): Promise<readonly FunctionReturnHint[]> => {
      const hints = await collectFunctionReturnHints(document.getText());
      const snapshot: CachedHintSnapshot = { version, hints };
      cache.set(uri, snapshot.version, snapshot.hints);
      return hints;
    })();

    inFlightLoads.set(cacheKey, task);
    try {
      return await task;
    } finally {
      inFlightLoads.delete(cacheKey);
    }
  };

  const hoverProvider = languages.registerHoverProvider(
    [...BIRD_DOCUMENT_SELECTOR],
    {
      provideHover: async (document, position): Promise<Hover | null> => {
        const configuration = getConfiguration();
        if (
          !configuration.typeHintsEnabled ||
          !configuration.typeHintsHoverEnabled ||
          !isBirdDocument(document)
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
          const dedupeKey = `hover:${document.uri.toString()}:${document.version}`;
          if (!errorCache.has(dedupeKey)) {
            errorCache.add(dedupeKey);
            outputChannel.appendLine(
              `[bird2-lsp] type hints hover failed: ${toSanitizedErrorDetails(error)}`,
            );
            void showGuidedErrorMessage({
              message:
                "BIRD2 type hints hover failed. Open FAQ for quick fixes or report this issue.",
              faqId: "type-hints-runtime-failed",
            });
          }
          return null;
        }
      },
    },
  );

  const inlayProvider = languages.registerInlayHintsProvider(
    [...BIRD_DOCUMENT_SELECTOR],
    {
      provideInlayHints: async (document, range): Promise<InlayHint[]> => {
        const configuration = getConfiguration();
        if (
          !configuration.typeHintsEnabled ||
          !configuration.typeHintsInlayEnabled ||
          !isBirdDocument(document)
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
          const dedupeKey = `inlay:${document.uri.toString()}:${document.version}`;
          if (!errorCache.has(dedupeKey)) {
            errorCache.add(dedupeKey);
            outputChannel.appendLine(
              `[bird2-lsp] type hints inlay failed: ${toSanitizedErrorDetails(error)}`,
            );
            void showGuidedErrorMessage({
              message:
                "BIRD2 type hints inlay failed. Open FAQ for quick fixes or report this issue.",
              faqId: "type-hints-runtime-failed",
            });
          }
          return [];
        }
      },
    },
  );

  const closeSubscription = workspace.onDidCloseTextDocument((document) => {
    const uri = document.uri.toString();
    cache.delete(uri);
    for (const key of inFlightLoads.keys()) {
      if (key.startsWith(`${uri}@`)) {
        inFlightLoads.delete(key);
      }
    }
    for (const key of errorCache) {
      if (key.includes(uri)) {
        errorCache.delete(key);
      }
    }
  });

  return [hoverProvider, inlayProvider, closeSubscription];
};
