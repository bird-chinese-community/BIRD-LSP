import {
  resolveKeywordHoverOnLine,
  type KeywordHoverResolutionOptions,
} from "@birdcc/lsp";

export interface HoverDocsCollection {
  readonly source: "lsp";
}

export interface ResolvedHoverTopic {
  readonly key: string;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly markdown: string;
}

export interface HoverResolutionOptions {
  readonly contextPath?: readonly string[];
}

let hoverDocsPromise: Promise<HoverDocsCollection> | undefined;

export const loadBirdHoverDocs = async (): Promise<HoverDocsCollection> => {
  hoverDocsPromise ??= Promise.resolve({
    source: "lsp",
  } as const);

  return hoverDocsPromise;
};

export const resolveBirdHoverTopic = (
  lineText: string,
  character: number,
  _docs: HoverDocsCollection,
  options?: HoverResolutionOptions,
): ResolvedHoverTopic | undefined => {
  const resolved = resolveKeywordHoverOnLine(lineText, character, {
    contextPath: options?.contextPath,
  } satisfies KeywordHoverResolutionOptions);
  if (!resolved) {
    return undefined;
  }

  return {
    key: resolved.key,
    startCharacter: resolved.startCharacter,
    endCharacter: resolved.endCharacter,
    markdown: resolved.markdown,
  };
};
