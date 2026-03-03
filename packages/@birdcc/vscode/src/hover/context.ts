import { resolveHoverContextPath as resolveHoverContextPathFromLsp } from "@birdcc/lsp";
import type { TextDocument } from "vscode";

export const resolveHoverContextPath = (
  document: TextDocument,
  targetLine: number,
  targetCharacter: number,
): readonly string[] =>
  resolveHoverContextPathFromLsp(document, targetLine, targetCharacter);
