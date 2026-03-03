import {
  Hover,
  MarkdownString,
  Position,
  Range,
  languages,
  type Disposable,
} from "vscode";

import { BIRD_DOCUMENT_SELECTOR, LANGUAGE_ID } from "../constants.js";
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

const renderHoverMarkdown = (topic: ResolvedHoverTopic): MarkdownString => {
  const markdown = new MarkdownString("", false);
  markdown.appendMarkdown(`**${topic.doc.title}**\n\n`);
  markdown.appendText(`${topic.doc.summary}\n`);

  if (topic.doc.details && topic.doc.details.length > 0) {
    markdown.appendText("\n");
    for (const detail of topic.doc.details) {
      markdown.appendText(`- ${detail}\n`);
    }
  }

  markdown.isTrusted = false;
  return markdown;
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
        const topic = resolveBirdHoverTopic(lineText, position.character, docs);
        if (!topic) {
          return null;
        }

        return new Hover(
          renderHoverMarkdown(topic),
          toRange(position.line, topic.startCharacter, topic.endCharacter),
        );
      } catch {
        return null;
      }
    },
  });
