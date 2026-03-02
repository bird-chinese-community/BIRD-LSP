import { resolve } from "node:path";

export interface LogSanitizationContext {
  readonly workspaceRoots: readonly string[];
  readonly homePath?: string;
  readonly caseInsensitivePathMatch?: boolean;
}

const caseInsensitivePlatforms = new Set(["win32", "darwin"]);

const shouldUseCaseInsensitivePathMatch = (): boolean =>
  caseInsensitivePlatforms.has(process.platform);

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const replacePathVariant = (
  value: string,
  searchValue: string,
  replaceValue: string,
  caseInsensitive: boolean,
): string => {
  if (searchValue.length === 0) {
    return value;
  }

  if (!caseInsensitive) {
    return value.replaceAll(searchValue, replaceValue);
  }

  return value.replace(
    new RegExp(escapeRegex(searchValue), "gi"),
    replaceValue,
  );
};

const getPathVariants = (path: string): readonly string[] => {
  const resolved = resolve(path);
  const slashPath = resolved.replaceAll("\\", "/");
  const backslashPath = resolved.replaceAll("/", "\\");

  return [...new Set([resolved, slashPath, backslashPath])];
};

const sanitizeKnownPath = (
  value: string,
  path: string,
  replacement: string,
  caseInsensitivePathMatch: boolean,
): string => {
  let output = value;
  for (const variant of getPathVariants(path)) {
    output = replacePathVariant(
      output,
      variant,
      replacement,
      caseInsensitivePathMatch,
    );
  }
  return output;
};

export const sanitizeLogMessageWithContext = (
  message: string,
  context: LogSanitizationContext,
): string => {
  let sanitized = message;
  const caseInsensitivePathMatch =
    context.caseInsensitivePathMatch ?? shouldUseCaseInsensitivePathMatch();

  context.workspaceRoots
    .filter((root) => root.length > 0)
    .sort((left, right) => right.length - left.length)
    .forEach((workspaceRoot) => {
      sanitized = sanitizeKnownPath(
        sanitized,
        workspaceRoot,
        "<workspace>",
        caseInsensitivePathMatch,
      );
    });

  if (context.homePath && context.homePath.length > 0) {
    sanitized = sanitizeKnownPath(
      sanitized,
      context.homePath,
      "~",
      caseInsensitivePathMatch,
    );
  }

  return sanitized;
};
