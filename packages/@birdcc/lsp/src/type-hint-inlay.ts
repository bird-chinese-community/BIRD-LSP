import type { InlayHint, Range } from "vscode-languageserver/node.js";
import { InlayHintKind } from "vscode-languageserver/node.js";
import type { FunctionReturnHint } from "@birdcc/core";

const isRangeOverlapping = (
  hint: FunctionReturnHint,
  range: Range,
): boolean => {
  const hintLine = hint.declaration.line - 1; // convert 1-based to 0-based
  return hintLine >= range.start.line && hintLine <= range.end.line;
};

export const createTypeHintInlayHints = (
  hints: readonly FunctionReturnHint[],
  range: Range,
): InlayHint[] =>
  hints
    .filter((hint) => {
      const returnType = hint.declaredReturnType ?? hint.inferredReturnType;
      return returnType !== "unknown";
    })
    .filter((hint) => isRangeOverlapping(hint, range))
    .map((hint) => {
      const returnType = hint.declaredReturnType ?? hint.inferredReturnType;
      return {
        position: {
          line: hint.declaration.nameRange.endLine - 1,
          character: Math.max(hint.declaration.nameRange.endColumn - 1, 0),
        },
        label: `: ${returnType}`,
        kind: InlayHintKind.Type,
        paddingLeft: true,
        tooltip: hint.declaredReturnType
          ? `Declared return type: ${hint.declaredReturnType}`
          : "Inferred return type (POC)",
      } satisfies InlayHint;
    });
