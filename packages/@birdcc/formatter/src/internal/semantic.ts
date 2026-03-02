import {
  parseBirdConfig,
  type BirdDeclaration,
  type ParseIssue,
} from "@birdcc/parser";

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

type ObjectLikeValue = Record<string, unknown> | unknown[];

const isObjectLikeValue = (value: unknown): value is ObjectLikeValue =>
  typeof value === "object" && value !== null;

const shouldStripRangeKey = (key: string): boolean =>
  key === "line" ||
  key === "column" ||
  key === "endLine" ||
  key === "endColumn" ||
  key.endsWith("Range");

const createContainer = (value: ObjectLikeValue): ObjectLikeValue =>
  Array.isArray(value) ? [] : {};

const assignContainerValue = (
  container: ObjectLikeValue,
  key: string,
  value: unknown,
): void => {
  (container as Record<string, unknown>)[key] = value;
};

export const stripRangeKeys = (value: unknown): unknown => {
  if (!isObjectLikeValue(value)) {
    if (typeof value === "string") {
      return normalizeWhitespace(value);
    }
    return value;
  }

  const rootOutput = createContainer(value);
  const visited = new WeakMap<object, ObjectLikeValue>();
  visited.set(value as object, rootOutput);

  const stack: Array<{ source: ObjectLikeValue; target: ObjectLikeValue }> = [
    { source: value, target: rootOutput },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }

    const { source, target } = frame;
    for (const [key, nestedValue] of Object.entries(source)) {
      if (shouldStripRangeKey(key)) {
        continue;
      }

      if (!isObjectLikeValue(nestedValue)) {
        assignContainerValue(
          target,
          key,
          typeof nestedValue === "string"
            ? normalizeWhitespace(nestedValue)
            : nestedValue,
        );
        continue;
      }

      const cachedValue = visited.get(nestedValue as object);
      if (cachedValue) {
        assignContainerValue(target, key, cachedValue);
        continue;
      }

      const nestedOutput = createContainer(nestedValue);
      visited.set(nestedValue as object, nestedOutput);
      assignContainerValue(target, key, nestedOutput);
      stack.push({ source: nestedValue, target: nestedOutput });
    }
  }

  return rootOutput;
};

const normalizeIssue = (issue: ParseIssue): unknown => ({
  code: issue.code,
  message: normalizeWhitespace(issue.message),
});

const normalizeDeclaration = (declaration: BirdDeclaration): unknown =>
  stripRangeKeys(declaration);

export const createSemanticFingerprintFromParsed = (
  parsed: Awaited<ReturnType<typeof parseBirdConfig>>,
): string => {
  const hasRuntimeIssue = parsed.issues.some(
    (issue) => issue.code === "parser/runtime-error",
  );

  if (hasRuntimeIssue) {
    throw new Error(
      "Parser runtime unavailable while evaluating formatter safe mode",
    );
  }

  const normalizedProgram = parsed.program.declarations.map((declaration) =>
    normalizeDeclaration(declaration),
  );
  const normalizedIssues = parsed.issues.map((issue) => normalizeIssue(issue));

  return JSON.stringify({
    declarations: normalizedProgram,
    issues: normalizedIssues,
  });
};

export const createSemanticFingerprint = async (
  text: string,
): Promise<string> => {
  const parsed = await parseBirdConfig(text);
  return createSemanticFingerprintFromParsed(parsed);
};

export const assertSafeModeSemanticEquivalence = async (
  before: string,
  after: string,
  beforeFingerprint?: string,
): Promise<void> => {
  const [resolvedBeforeFingerprint, afterFingerprint] = await Promise.all([
    beforeFingerprint
      ? Promise.resolve(beforeFingerprint)
      : createSemanticFingerprint(before),
    createSemanticFingerprint(after),
  ]);

  if (resolvedBeforeFingerprint !== afterFingerprint) {
    throw new Error(
      "Formatter safe mode rejected output because semantic fingerprint changed",
    );
  }
};
