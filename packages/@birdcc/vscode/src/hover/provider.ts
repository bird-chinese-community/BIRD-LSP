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

const toRange = (
  line: number,
  startCharacter: number,
  endCharacter: number,
): Range =>
  new Range(
    new Position(line, startCharacter),
    new Position(line, endCharacter),
  );

const renderDiffLabel = (diff: string): string => {
  const normalized = diff.trim().toLowerCase();
  if (normalized === "added") {
    return "Added";
  }
  if (normalized === "modified") {
    return "Changed";
  }
  if (normalized === "same") {
    return "Stable";
  }

  return diff;
};

const renderHoverMarkdown = (topic: ResolvedHoverTopic): MarkdownString => {
  const markdown = new MarkdownString("", false);
  markdown.appendMarkdown(`**${topic.doc.title}**\n\n`);
  markdown.appendText(`${topic.doc.summary}\n`);

  if (topic.doc.usage) {
    markdown.appendMarkdown("\n**Usage**\n");
    markdown.appendCodeblock(topic.doc.usage, "bird");
  }

  if (topic.doc.details && topic.doc.details.length > 0) {
    markdown.appendMarkdown("\n**Details**\n");
    for (const detail of topic.doc.details) {
      markdown.appendText(`- ${detail}\n`);
    }
  }

  if (topic.doc.parameters && topic.doc.parameters.length > 0) {
    markdown.appendMarkdown("\n**Parameters**\n");
    for (const parameter of topic.doc.parameters) {
      const requiredLabel = parameter.required ? " (required)" : "";
      markdown.appendText(
        `- ${parameter.name}${requiredLabel}: ${parameter.description}\n`,
      );
    }
  }

  if (topic.doc.path) {
    const paths = Array.isArray(topic.doc.path)
      ? topic.doc.path
      : [topic.doc.path];
    if (paths.length > 0) {
      markdown.appendMarkdown("\n**Context**\n");
      for (const path of paths) {
        markdown.appendMarkdown(`- \`${path}\`\n`);
      }
    }
  }

  if (topic.doc.related && topic.doc.related.length > 0) {
    markdown.appendMarkdown("\n**Related**\n");
    for (const relatedKeyword of topic.doc.related) {
      markdown.appendMarkdown(`- \`${relatedKeyword}\`\n`);
    }
  }

  const metadata: string[] = [];
  if (topic.doc.version) {
    metadata.push(`Version: ${topic.doc.version}`);
  }
  if (topic.doc.diff) {
    metadata.push(`Status: ${renderDiffLabel(topic.doc.diff)}`);
  }
  if (metadata.length > 0) {
    markdown.appendMarkdown("\n**Metadata**\n");
    for (const line of metadata) {
      markdown.appendText(`- ${line}\n`);
    }
  }

  if (topic.doc.notes) {
    const noteEntries = Object.entries(topic.doc.notes);
    if (noteEntries.length > 0) {
      markdown.appendMarkdown("\n**Version Notes**\n");
      for (const [versionKey, note] of noteEntries) {
        markdown.appendText(`- ${versionKey.toUpperCase()}: ${note}\n`);
      }
    }
  }

  if (topic.doc.links && topic.doc.links.length > 0) {
    markdown.appendMarkdown("\n**References**\n");
    for (const link of topic.doc.links) {
      markdown.appendMarkdown(`- [${link.label}](${link.url})\n`);
    }
  }

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

export const registerBirdKeywordHoverProvider = (): Disposable =>
  languages.registerHoverProvider([...BIRD_DOCUMENT_SELECTOR], {
    provideHover: async (document, position) => {
      if (document.languageId !== LANGUAGE_ID) {
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
