/**
 * LSP workspace initialization — uses sniffProjectEntrypoints() to auto-detect
 * project entry points when no bird.config.json is present.
 *
 * The LSP server calls this during initialization to provide a smooth
 * zero-config experience. Detection results can trigger:
 * - Auto-selection of entry point (high confidence)
 * - Information message with suggestion (medium confidence)
 * - Warning message requesting user action (low confidence / ambiguous)
 */

import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sniffProjectEntrypoints, type DetectionResult } from "@birdcc/core";
import type { Connection } from "vscode-languageserver/node.js";
import { showInfo, showWarning } from "../utils.js";

export interface WorkspaceInitResult {
  detectionResult: DetectionResult;
  /** Suggested entry URI (file:// scheme) if detection was confident enough */
  suggestedEntryUri: string | null;
  /** Whether the user should be prompted for confirmation */
  needsConfirmation: boolean;
}

/**
 * Run project entry-point detection for a workspace root.
 *
 * @param workspaceRootUri - file:// URI of the workspace root
 * @param connection - LSP connection for sending notifications
 * @returns Detection result with suggested entry URI
 */
export const detectWorkspaceEntry = async (
  workspaceRootUri: string,
  connection: Connection,
): Promise<WorkspaceInitResult> => {
  const rootPath = fileURLToPath(workspaceRootUri);
  const toSuggestedEntryUri = (relativePath: string): string =>
    pathToFileURL(resolve(rootPath, relativePath)).toString();

  const result = await sniffProjectEntrypoints(rootPath, {
    maxDepth: 8,
    maxFiles: 20_000,
  });

  // Log detection result
  connection.console.log(
    `[init] Project detection: kind=${result.kind}, confidence=${result.confidence}%, candidates=${result.candidates.length}`,
  );

  for (const warning of result.warnings) {
    connection.console.log(
      `[init] Warning: [${warning.code}] ${warning.message}`,
    );
  }

  // Determine suggested entry and whether confirmation is needed
  let suggestedEntryUri: string | null = null;
  let needsConfirmation = false;

  switch (result.kind) {
    case "single": {
      if (result.primary) {
        suggestedEntryUri = toSuggestedEntryUri(result.primary.path);
        connection.console.log(
          `[init] Auto-detected entry: ${result.primary.path} (confidence: ${result.confidence}%)`,
        );
        showInfo(
          connection,
          `Auto-detected BIRD entry: ${result.primary.path} (${result.confidence}% confidence).`,
        );
      }
      break;
    }

    case "single-ambiguous": {
      if (result.primary) {
        suggestedEntryUri = toSuggestedEntryUri(result.primary.path);
        needsConfirmation = true;
        showWarning(
          connection,
          `BIRD project entry detected with low confidence: ${result.primary.path}. Consider creating bird.config.json with \`birdcc init\`.`,
        );
      }
      break;
    }

    case "monorepo-multi-entry": {
      showInfo(
        connection,
        `Multiple BIRD project entries detected. Run \`birdcc init --write\` to generate workspace configuration.`,
      );
      break;
    }

    case "monorepo-multi-role": {
      if (result.primary) {
        suggestedEntryUri = toSuggestedEntryUri(result.primary.path);
        showInfo(
          connection,
          `BIRD project with multiple roles detected. Entry: ${result.primary.path}. Run \`birdcc init --write\` for full configuration.`,
        );
      }
      break;
    }

    case "not-found": {
      // No message for not-found — the project may not be a BIRD project
      break;
    }
  }

  return { detectionResult: result, suggestedEntryUri, needsConfirmation };
};
