import { parseBirdConfig } from "@birdcc/parser";

import type {
  BirdFormatResult,
  BuiltinFormatOutput,
  ResolvedFormatOptions,
} from "../types.js";
import {
  assertSafeModeSemanticEquivalence,
  createSemanticFingerprintFromParsed,
} from "./semantic.js";
import { collectParserProtectedLinesFromParsed } from "./parser-protection.js";
import { normalizeTextWithBuiltin } from "./builtin-formatter.js";
import { getOrCreateDprintContext } from "./dprint-context.js";

export const formatWithEmbeddedDprint = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BirdFormatResult> => {
  const context = getOrCreateDprintContext(options);
  const formattedText = context.formatText({
    filePath: "bird.conf",
    fileText: text,
  });

  if (options.safeMode && formattedText !== text) {
    await assertSafeModeSemanticEquivalence(text, formattedText);
  }

  return {
    text: formattedText,
    changed: formattedText !== text,
    engine: "dprint",
  };
};

export const formatWithBuiltin = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BirdFormatResult> => {
  const parsed = await parseBirdConfig(text);
  const beforeFingerprint = options.safeMode
    ? createSemanticFingerprintFromParsed(parsed)
    : undefined;
  const parserProtectedLines = collectParserProtectedLinesFromParsed(parsed);

  const builtinOutput = await normalizeTextWithBuiltin(
    text,
    options,
    parserProtectedLines,
  );
  if (options.safeMode && builtinOutput.text !== text) {
    await assertSafeModeSemanticEquivalence(
      text,
      builtinOutput.text,
      beforeFingerprint,
    );
  }

  return {
    text: builtinOutput.text,
    changed: builtinOutput.text !== text,
    engine: "builtin",
  };
};

export const formatBuiltinForTest = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BuiltinFormatOutput> => {
  const parsed = await parseBirdConfig(text);
  const parserProtectedLines = collectParserProtectedLinesFromParsed(parsed);
  return normalizeTextWithBuiltin(text, options, parserProtectedLines);
};
