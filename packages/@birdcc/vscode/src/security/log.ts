import { resolve } from "node:path";

import { workspace } from "vscode";

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

export const sanitizeLogMessage = (message: string): string => {
  let sanitized = message;

  const workspaceRoots =
    workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  workspaceRoots
    .filter((root) => root.length > 0)
    .sort((left, right) => right.length - left.length)
    .forEach((workspaceRoot) => {
      sanitized = sanitizeKnownPath(sanitized, workspaceRoot, "<workspace>");
    });

  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && home.length > 0) {
    sanitized = sanitizeKnownPath(sanitized, home, "~");
  }

  return sanitized;
};

export const toSanitizedErrorDetails = (error: unknown): string =>
  sanitizeLogMessage(
    error instanceof Error ? (error.stack ?? String(error)) : String(error),
  );
