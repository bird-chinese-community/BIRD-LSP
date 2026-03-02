import { workspace } from "vscode";

import { sanitizeLogMessageWithContext } from "./log-core.js";

export const sanitizeLogMessage = (message: string): string =>
  sanitizeLogMessageWithContext(message, {
    workspaceRoots:
      workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    homePath: process.env.HOME ?? process.env.USERPROFILE,
  });

export const toSanitizedErrorDetails = (error: unknown): string =>
  sanitizeLogMessage(
    error instanceof Error ? (error.stack ?? String(error)) : String(error),
  );
