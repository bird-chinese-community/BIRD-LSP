const HIGH_RISK_KEYWORDS = ["if", "then", "else", "return"] as const;
const HIGH_RISK_OPERATORS = ["~", "&", "|", "?", ":", "(", "[", "]"] as const;

const isCommentLine = (line: string): boolean =>
  line.trimStart().startsWith("#");

const isWordCharacter = (value: string): boolean => /[A-Za-z0-9_]/.test(value);

const containsKeywordAsWord = (text: string, keyword: string): boolean => {
  let startIndex = 0;
  while (startIndex <= text.length) {
    const foundIndex = text.indexOf(keyword, startIndex);
    if (foundIndex === -1) {
      return false;
    }

    const endIndex = foundIndex + keyword.length;
    const leftChar = foundIndex === 0 ? "" : (text[foundIndex - 1] ?? "");
    const rightChar = endIndex >= text.length ? "" : (text[endIndex] ?? "");
    const leftOk = leftChar === "" || !isWordCharacter(leftChar);
    const rightOk = rightChar === "" || !isWordCharacter(rightChar);

    if (leftOk && rightOk) {
      return true;
    }

    startIndex = endIndex;
  }

  return false;
};

export const isHighRiskExpressionLine = (line: string): boolean => {
  const normalized = line.trim();
  if (normalized.length === 0 || isCommentLine(normalized)) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  const keywordRisk = HIGH_RISK_KEYWORDS.some((keyword) =>
    containsKeywordAsWord(lowered, keyword),
  );
  const operatorRisk = HIGH_RISK_OPERATORS.some((operator) =>
    normalized.includes(operator),
  );
  return keywordRisk || operatorRisk;
};

export const normalizeNonRiskLine = (line: string): string => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || isCommentLine(trimmed)) {
    return trimmed;
  }

  if (trimmed === "}" || trimmed === "};") {
    return trimmed;
  }

  if (trimmed.endsWith("{")) {
    return `${trimmed.slice(0, -1).trimEnd()} {`;
  }

  if (trimmed.endsWith(";")) {
    return `${trimmed.slice(0, -1).trimEnd()};`;
  }

  return trimmed;
};
