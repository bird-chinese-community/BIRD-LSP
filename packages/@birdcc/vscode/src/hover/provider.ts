import {
  Hover,
  MarkdownString,
  Position,
  Range,
  languages,
  type Disposable,
} from "vscode";

import { BIRD_DOCUMENT_SELECTOR, LANGUAGE_ID } from "../constants.js";
import { resolveHoverContextPath } from "./context.js";
import type { ResolvedHoverTopic } from "./docs.js";

export interface HoverProviderOptions {
  /** Return `true` when the LSP client is handling hover requests. */
  readonly isLspActive?: () => boolean;
}

const toRange = (
  line: number,
  startCharacter: number,
  endCharacter: number,
): Range =>
  new Range(
    new Position(line, startCharacter),
    new Position(line, endCharacter),
  );

const renderHoverMarkdown = (topic: ResolvedHoverTopic): MarkdownString => {
  const markdown = new MarkdownString(topic.markdown, false);
  markdown.isTrusted = false;
  return markdown;
};

const HOVER_TOPIC_CACHE_LIMIT = 1024;
const hoverTopicCache = new Map<string, ResolvedHoverTopic | null>();

const toHoverCacheKey = (
  documentUri: string,
  documentVersion: number,
  line: number,
  character: number,
  lineText: string,
): string =>
  `${documentUri}:${String(documentVersion)}:${String(line)}:${String(character)}:${lineText}`;

const setCachedTopic = (
  cacheKey: string,
  topic: ResolvedHoverTopic | null,
): void => {
  hoverTopicCache.set(cacheKey, topic);
  if (hoverTopicCache.size > HOVER_TOPIC_CACHE_LIMIT) {
    const oldestKey = hoverTopicCache.keys().next().value;
    if (oldestKey) {
      hoverTopicCache.delete(oldestKey);
    }
  }
};

let hoverDocsModulePromise: Promise<typeof import("./docs.js")> | undefined;

const getHoverDocsModule = (): Promise<typeof import("./docs.js")> => {
  hoverDocsModulePromise ??= import("./docs.js");
  return hoverDocsModulePromise;
};

export const registerBirdKeywordHoverProvider = (
  options?: HoverProviderOptions,
): Disposable =>
  languages.registerHoverProvider([...BIRD_DOCUMENT_SELECTOR], {
    provideHover: async (document, position) => {
      if (document.languageId !== LANGUAGE_ID) {
        return null;
      }

      // When the LSP server is running, it already provides keyword hover
      // through textDocument/hover. Returning null here avoids duplicate
      // hover tooltips that would otherwise be merged by VS Code.
      if (options?.isLspActive?.()) {
        return null;
      }

      try {
        const { loadBirdHoverDocs, resolveBirdHoverTopic } =
          await getHoverDocsModule();
        const docs = await loadBirdHoverDocs();
        const lineText = document.lineAt(position.line).text;
        const cacheKey = toHoverCacheKey(
          document.uri.toString(),
          document.version,
          position.line,
          position.character,
          lineText,
        );
        const cachedTopic = hoverTopicCache.get(cacheKey);
        if (cachedTopic !== undefined) {
          if (!cachedTopic) {
            return null;
          }

          return new Hover(
            renderHoverMarkdown(cachedTopic),
            toRange(
              position.line,
              cachedTopic.startCharacter,
              cachedTopic.endCharacter,
            ),
          );
        }

        const contextPath = resolveHoverContextPath(
          document,
          position.line,
          position.character,
        );
        const topic = resolveBirdHoverTopic(
          lineText,
          position.character,
          docs,
          {
            contextPath,
          },
        );
        if (!topic) {
          setCachedTopic(cacheKey, null);
          return null;
        }
        setCachedTopic(cacheKey, topic);

        return new Hover(
          renderHoverMarkdown(topic),
          toRange(position.line, topic.startCharacter, topic.endCharacter),
        );
      } catch {
        return null;
      }
    },
  });
