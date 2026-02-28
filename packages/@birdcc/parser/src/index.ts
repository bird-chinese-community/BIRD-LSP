export type TokenKind = "keyword" | "identifier" | "number" | "string" | "symbol" | "comment";

export interface SourceRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface LexToken extends SourceRange {
  kind: TokenKind;
  value: string;
  index: number;
}

export interface PhraseMatch extends SourceRange {
  phrase: string;
  tokens: string[];
}

export interface ParseIssue extends SourceRange {
  code: "parser/unbalanced-brace" | "parser/missing-symbol";
  message: string;
}

interface DeclarationBase extends SourceRange {
  kind: "include" | "define" | "protocol" | "template" | "filter" | "function";
}

export interface IncludeDeclaration extends DeclarationBase {
  kind: "include";
  path: string;
}

export interface DefineDeclaration extends DeclarationBase {
  kind: "define";
  name: string;
}

export interface ProtocolDeclaration extends DeclarationBase {
  kind: "protocol";
  protocolType: string;
  name: string;
  fromTemplate?: string;
  headerTokens: string[];
}

export interface TemplateDeclaration extends DeclarationBase {
  kind: "template";
  templateType: string;
  name: string;
  headerTokens: string[];
}

export interface FilterDeclaration extends DeclarationBase {
  kind: "filter";
  name: string;
}

export interface FunctionDeclaration extends DeclarationBase {
  kind: "function";
  name: string;
}

export type BirdDeclaration =
  | IncludeDeclaration
  | DefineDeclaration
  | ProtocolDeclaration
  | TemplateDeclaration
  | FilterDeclaration
  | FunctionDeclaration;

export interface BirdProgram {
  kind: "program";
  declarations: BirdDeclaration[];
}

export interface ParsedBirdDocument {
  tokens: LexToken[];
  phraseMatches: PhraseMatch[];
  program: BirdProgram;
  issues: ParseIssue[];
}

export const DEFAULT_MULTI_WORD_PHRASES = [
  ["local", "as"],
  ["next", "hop", "self"],
  ["router", "id"],
  ["source", "address"],
  ["import", "all"],
  ["import", "filter"],
  ["export", "all"],
  ["export", "filter"],
] as const;

const KEYWORDS = new Set([
  "protocol",
  "template",
  "filter",
  "function",
  "local",
  "as",
  "next",
  "hop",
  "self",
  "neighbor",
  "import",
  "export",
  "router",
  "id",
  "source",
  "address",
  "from",
  "include",
  "define",
]);

const isWordStart = (char: string): boolean => /[A-Za-z_]/.test(char);
const isWord = (char: string): boolean => /[A-Za-z0-9_-]/.test(char);
const isNumber = (char: string): boolean => /[0-9]/.test(char);

const createRange = (
  line: number,
  column: number,
  endLine: number,
  endColumn: number,
): SourceRange => ({ line, column, endLine, endColumn });

const createTokenRange = (start: LexToken, end: LexToken): SourceRange =>
  createRange(start.line, start.column, end.endLine, end.endColumn);

const isWordLikeToken = (token: LexToken): boolean =>
  token.kind === "keyword" || token.kind === "identifier" || token.kind === "number";

export const tokenizeBird = (input: string): LexToken[] => {
  const tokens: LexToken[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const pushToken = (
    kind: TokenKind,
    value: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
  ): void => {
    tokens.push({
      kind,
      value,
      index: tokens.length,
      ...createRange(startLine, startColumn, endLine, endColumn),
    });
  };

  while (i < input.length) {
    const char = input[i];

    if (char === "\n") {
      i += 1;
      line += 1;
      column = 1;
      continue;
    }

    if (/\s/.test(char)) {
      i += 1;
      column += 1;
      continue;
    }

    if (char === "#") {
      const startLine = line;
      const startColumn = column;
      let value = "";
      while (i < input.length && input[i] !== "\n") {
        value += input[i];
        i += 1;
        column += 1;
      }
      pushToken("comment", value, startLine, startColumn, line, column);
      continue;
    }

    if (char === '"') {
      const startLine = line;
      const startColumn = column;
      let value = char;
      i += 1;
      column += 1;

      while (i < input.length) {
        const current = input[i];
        value += current;
        i += 1;

        if (current === "\n") {
          line += 1;
          column = 1;
          continue;
        }

        column += 1;
        if (current === '"') {
          break;
        }
      }

      pushToken("string", value, startLine, startColumn, line, column);
      continue;
    }

    if (isWordStart(char)) {
      const startLine = line;
      const startColumn = column;
      let value = "";
      while (i < input.length && isWord(input[i])) {
        value += input[i];
        i += 1;
        column += 1;
      }
      const lower = value.toLowerCase();
      const kind: TokenKind = KEYWORDS.has(lower) ? "keyword" : "identifier";
      pushToken(kind, value, startLine, startColumn, line, column);
      continue;
    }

    if (isNumber(char)) {
      const startLine = line;
      const startColumn = column;
      let value = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        value += input[i];
        i += 1;
        column += 1;
      }
      pushToken("number", value, startLine, startColumn, line, column);
      continue;
    }

    const startLine = line;
    const startColumn = column;
    pushToken("symbol", char, startLine, startColumn, line, column + 1);
    i += 1;
    column += 1;
  }

  return tokens;
};

interface WordToken {
  token: LexToken;
  lowerValue: string;
}

export const detectMultiWordPhrases = (
  tokens: LexToken[],
  phrases: ReadonlyArray<ReadonlyArray<string>> = DEFAULT_MULTI_WORD_PHRASES,
): PhraseMatch[] => {
  const words: WordToken[] = tokens
    .filter((token) => token.kind === "keyword" || token.kind === "identifier")
    .map((token) => ({ token, lowerValue: token.value.toLowerCase() }));

  const matches: PhraseMatch[] = [];

  for (let i = 0; i < words.length; i += 1) {
    for (const phraseWords of phrases) {
      if (phraseWords.length === 0 || i + phraseWords.length > words.length) {
        continue;
      }

      const matchedTokens: LexToken[] = [];
      let ok = true;

      for (let j = 0; j < phraseWords.length; j += 1) {
        const current = words[i + j];
        if (current.lowerValue !== phraseWords[j]) {
          ok = false;
          break;
        }

        if (
          matchedTokens.length > 0 &&
          current.token.index !== matchedTokens[matchedTokens.length - 1].index + 1
        ) {
          ok = false;
          break;
        }

        matchedTokens.push(current.token);
      }

      if (!ok || matchedTokens.length === 0) {
        continue;
      }

      const first = matchedTokens[0];
      const last = matchedTokens[matchedTokens.length - 1];
      matches.push({
        phrase: phraseWords.join(" "),
        tokens: matchedTokens.map((token) => token.value),
        ...createRange(first.line, first.column, last.endLine, last.endColumn),
      });
    }
  }

  return matches;
};

const findNextSymbol = (tokens: LexToken[], start: number, symbol: string): number => {
  for (let i = start; i < tokens.length; i += 1) {
    if (tokens[i].kind === "symbol" && tokens[i].value === symbol) {
      return i;
    }
  }

  return -1;
};

const findStatementEnd = (tokens: LexToken[], start: number): number => {
  for (let i = start; i < tokens.length; i += 1) {
    if (tokens[i].kind === "symbol" && tokens[i].value === ";") {
      return i;
    }
  }

  return tokens.length - 1;
};

const findMatchingBrace = (tokens: LexToken[], openBraceIndex: number): number => {
  let depth = 0;
  for (let i = openBraceIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind !== "symbol") {
      continue;
    }

    if (token.value === "{") {
      depth += 1;
    } else if (token.value === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
};

const stripQuotes = (value: string): string => value.replace(/^['"]|['"]$/g, "");

const collectHeaderWords = (tokens: LexToken[], startIndex: number, endIndex: number): string[] =>
  tokens
    .slice(startIndex, endIndex)
    .filter((token) => isWordLikeToken(token))
    .map((token) => token.value);

const parseProgram = (tokens: LexToken[]): { program: BirdProgram; issues: ParseIssue[] } => {
  const declarations: BirdDeclaration[] = [];
  const issues: ParseIssue[] = [];

  let i = 0;
  let depth = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.kind === "symbol") {
      if (token.value === "{") {
        depth += 1;
      } else if (token.value === "}") {
        if (depth === 0) {
          issues.push({
            code: "parser/unbalanced-brace",
            message: "Unexpected '}' at top level",
            ...createTokenRange(token, token),
          });
        } else {
          depth -= 1;
        }
      }
      i += 1;
      continue;
    }

    if (depth !== 0 || token.kind !== "keyword") {
      i += 1;
      continue;
    }

    const keyword = token.value.toLowerCase();

    if (keyword === "include") {
      const endIndex = findStatementEnd(tokens, i);
      const pathToken = tokens.slice(i + 1, endIndex + 1).find((item) => item.kind === "string");
      const endToken = tokens[endIndex];

      declarations.push({
        kind: "include",
        path: pathToken ? stripQuotes(pathToken.value) : "",
        ...createTokenRange(token, endToken),
      });

      i = endIndex + 1;
      continue;
    }

    if (keyword === "define") {
      const endIndex = findStatementEnd(tokens, i);
      const nameToken = tokens.slice(i + 1, endIndex + 1).find((item) => isWordLikeToken(item));
      const endToken = tokens[endIndex];

      declarations.push({
        kind: "define",
        name: nameToken?.value ?? "unknown",
        ...createTokenRange(token, endToken),
      });

      i = endIndex + 1;
      continue;
    }

    if (
      keyword === "protocol" ||
      keyword === "template" ||
      keyword === "filter" ||
      keyword === "function"
    ) {
      const openBraceIndex = findNextSymbol(tokens, i, "{");
      if (openBraceIndex < 0) {
        issues.push({
          code: "parser/missing-symbol",
          message: `Missing '{' for ${keyword} declaration`,
          ...createTokenRange(token, token),
        });
        i += 1;
        continue;
      }

      const closeBraceIndex = findMatchingBrace(tokens, openBraceIndex);
      if (closeBraceIndex < 0) {
        issues.push({
          code: "parser/unbalanced-brace",
          message: `Unbalanced braces in ${keyword} declaration`,
          ...createTokenRange(tokens[openBraceIndex], tokens[openBraceIndex]),
        });
        i = openBraceIndex + 1;
        continue;
      }

      let endIndex = closeBraceIndex;
      const maybeSemicolon = tokens[closeBraceIndex + 1];
      if (maybeSemicolon?.kind === "symbol" && maybeSemicolon.value === ";") {
        endIndex = closeBraceIndex + 1;
      }

      const headerWords = collectHeaderWords(tokens, i + 1, openBraceIndex);

      if (keyword === "protocol") {
        const fromIdx = headerWords.findIndex((word) => word.toLowerCase() === "from");
        const headerBeforeFrom = fromIdx >= 0 ? headerWords.slice(0, fromIdx) : headerWords;

        declarations.push({
          kind: "protocol",
          protocolType: headerBeforeFrom[0] ?? "unknown",
          name: headerBeforeFrom[headerBeforeFrom.length - 1] ?? headerBeforeFrom[0] ?? "unknown",
          fromTemplate: fromIdx >= 0 ? headerWords[fromIdx + 1] : undefined,
          headerTokens: headerWords,
          ...createTokenRange(token, tokens[endIndex]),
        });
      } else if (keyword === "template") {
        declarations.push({
          kind: "template",
          templateType: headerWords[0] ?? "unknown",
          name: headerWords[headerWords.length - 1] ?? headerWords[0] ?? "unknown",
          headerTokens: headerWords,
          ...createTokenRange(token, tokens[endIndex]),
        });
      } else if (keyword === "filter") {
        declarations.push({
          kind: "filter",
          name: headerWords[0] ?? "unknown",
          ...createTokenRange(token, tokens[endIndex]),
        });
      } else if (keyword === "function") {
        declarations.push({
          kind: "function",
          name: headerWords[0] ?? "unknown",
          ...createTokenRange(token, tokens[endIndex]),
        });
      }

      i = endIndex + 1;
      continue;
    }

    i += 1;
  }

  if (depth > 0) {
    const lastToken = tokens[tokens.length - 1];
    if (lastToken) {
      issues.push({
        code: "parser/unbalanced-brace",
        message: "Unclosed block at end of file",
        ...createTokenRange(lastToken, lastToken),
      });
    }
  }

  return {
    program: {
      kind: "program",
      declarations,
    },
    issues,
  };
};

export const parseBirdConfig = (input: string): ParsedBirdDocument => {
  const tokens = tokenizeBird(input);
  const phraseMatches = detectMultiWordPhrases(tokens);
  const { program, issues } = parseProgram(tokens);

  return { tokens, phraseMatches, program, issues };
};
