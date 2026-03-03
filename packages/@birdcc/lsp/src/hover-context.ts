import { TextDocument } from "vscode-languageserver-textdocument";

interface BlockFrame {
  readonly segments: readonly string[];
}

interface CachedContextIndex {
  readonly version: number;
  readonly fingerprint: string;
  readonly lineFrames: readonly (readonly BlockFrame[])[];
}

const WORD_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;
const CONTEXT_CACHE_LIMIT = 16;
const contextIndexCache = new Map<string, CachedContextIndex>();

const getLineText = (document: TextDocument, line: number): string => {
  const start = { line, character: 0 };
  const end =
    line + 1 < document.lineCount
      ? { line: line + 1, character: 0 }
      : { line, character: Number.MAX_SAFE_INTEGER };

  return document.getText({ start, end }).replace(/\r?\n$/, "");
};

const stripLineComment = (line: string): string => {
  const commentIndex = line.indexOf("#");
  if (commentIndex === -1) {
    return line;
  }

  return line.slice(0, commentIndex);
};

const extractWords = (text: string): readonly string[] =>
  Array.from(text.matchAll(WORD_PATTERN), (match) => match[0].toLowerCase());

const parseBlockSegments = (header: string): readonly string[] => {
  const words = extractWords(header);
  if (words.length === 0) {
    return [];
  }

  if (words[0] === "protocol" && words[1]) {
    return ["protocol", words[1]];
  }
  if (words[0] === "template" && words[1]) {
    return ["protocol", words[1]];
  }
  if (words[0] === "area") {
    return ["area"];
  }
  if (words[0] === "interface") {
    return ["interface"];
  }
  if (words[0] === "ipv4" || words[0] === "ipv6") {
    return ["channel", words[0]];
  }
  if (words[0] === "channel") {
    return ["channel"];
  }
  if (words[0] === "external") {
    return ["external"];
  }
  if (words[0] === "authentication") {
    return ["authentication"];
  }
  if (words[0] === "password") {
    return ["password"];
  }
  if (words[0] === "virtual" && words[1] === "link") {
    return ["virtual-link"];
  }

  return [];
};

const processLineIntoStack = (
  line: string,
  stack: BlockFrame[],
  maxCharacter: number,
): void => {
  const text = stripLineComment(line.slice(0, Math.max(0, maxCharacter)));
  let headerStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "}") {
      if (stack.length > 0) {
        stack.pop();
      }
      headerStart = index + 1;
      continue;
    }

    if (char === "{") {
      const header = text.slice(headerStart, index).trim();
      stack.push({
        segments: parseBlockSegments(header),
      });
      headerStart = index + 1;
    }
  }
};

const cloneFrames = (frames: readonly BlockFrame[]): BlockFrame[] =>
  frames.map((frame) => ({
    segments: frame.segments,
  }));

const buildContextIndex = (document: TextDocument): CachedContextIndex => {
  const stack: BlockFrame[] = [];
  const lineFrames: BlockFrame[][] = [];

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    lineFrames.push(cloneFrames(stack));
    processLineIntoStack(
      getLineText(document, lineIndex),
      stack,
      Number.MAX_SAFE_INTEGER,
    );
  }

  return {
    version: document.version,
    fingerprint: toDocumentFingerprint(document),
    lineFrames,
  };
};

const toDocumentFingerprint = (document: TextDocument): string => {
  if (document.lineCount === 0) {
    return "0::";
  }

  const firstLine = getLineText(document, 0);
  const lastLine = getLineText(document, document.lineCount - 1);
  return `${String(document.lineCount)}:${firstLine}:${lastLine}`;
};

const getCachedContextIndex = (document: TextDocument): CachedContextIndex => {
  const cacheKey = document.uri;
  const cached = contextIndexCache.get(cacheKey);
  const fingerprint = toDocumentFingerprint(document);
  if (
    cached &&
    cached.version === document.version &&
    cached.fingerprint === fingerprint
  ) {
    return cached;
  }

  const rebuilt = buildContextIndex(document);
  contextIndexCache.set(cacheKey, rebuilt);
  if (contextIndexCache.size > CONTEXT_CACHE_LIMIT) {
    const oldestKey = contextIndexCache.keys().next().value;
    if (oldestKey) {
      contextIndexCache.delete(oldestKey);
    }
  }

  return rebuilt;
};

export const resolveHoverContextPath = (
  document: TextDocument,
  targetLine: number,
  targetCharacter: number,
): readonly string[] => {
  const index = getCachedContextIndex(document);
  const baseFrames =
    index.lineFrames[targetLine] ??
    index.lineFrames[index.lineFrames.length - 1] ??
    [];
  const stack = cloneFrames(baseFrames);
  const lineText = getLineText(document, targetLine);
  const maxCharacter = Math.min(targetCharacter + 1, lineText.length);
  processLineIntoStack(lineText, stack, maxCharacter);

  return stack.flatMap((frame) => frame.segments);
};
