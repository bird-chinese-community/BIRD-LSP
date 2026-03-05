import { access } from "node:fs/promises";
import { join } from "node:path";
import { type OutputChannel, workspace } from "vscode";

const PROJECT_CONFIG_FILES = [
  "bird.config.json",
  "birdcc.config.json",
] as const;

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
};

export const announceProjectConfigGuidance = async (
  outputChannel: OutputChannel,
): Promise<void> => {
  const workspaceFolders = workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return;
  }

  const detectedConfigPaths: string[] = [];
  for (const folder of workspaceFolders) {
    for (const configFileName of PROJECT_CONFIG_FILES) {
      const candidate = join(folder.uri.fsPath, configFileName);
      // eslint-disable-next-line no-await-in-loop
      if (!(await pathExists(candidate))) {
        continue;
      }

      detectedConfigPaths.push(candidate);
      break;
    }
  }

  if (detectedConfigPaths.length > 0) {
    outputChannel.appendLine(
      `[bird2-lsp] detected project config: ${detectedConfigPaths.join(", ")}`,
    );
    outputChannel.appendLine(
      "[bird2-lsp] tip: use bird.config.json main/workspaces/includePaths to improve entry selection and monorepo cross-file analysis",
    );
    return;
  }

  if (workspaceFolders.length > 1) {
    outputChannel.appendLine(
      "[bird2-lsp] tip: monorepo detected without bird.config.json; add workspaces/includePaths for more accurate LSP diagnostics",
    );
  }
};
