import { resolve } from "node:path";

export interface LogSanitizationContext {
  readonly workspaceRoots: readonly string[];
  readonly homePath?: string;
}

const replaceAllLiteral = (
  value: string,
  searchValue: string,
  replaceValue: string,
): string => {
  if (searchValue.length === 0) {
    return value;
  }

  return value.split(searchValue).join(replaceValue);
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
): string => {
  let output = value;
  for (const variant of getPathVariants(path)) {
    output = replaceAllLiteral(output, variant, replacement);
  }
  return output;
};

export const sanitizeLogMessageWithContext = (
  message: string,
  context: LogSanitizationContext,
): string => {
  let sanitized = message;

  context.workspaceRoots
    .filter((root) => root.length > 0)
    .sort((left, right) => right.length - left.length)
    .forEach((workspaceRoot) => {
      sanitized = sanitizeKnownPath(sanitized, workspaceRoot, "<workspace>");
    });

  if (context.homePath && context.homePath.length > 0) {
    sanitized = sanitizeKnownPath(sanitized, context.homePath, "~");
  }

  return sanitized;
};
