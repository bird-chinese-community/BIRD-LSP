import {
  formatBuiltinForTest,
  formatWithBuiltin,
  formatWithEmbeddedDprint,
} from "./internal/engines.js";
import { resetDprintContextState } from "./internal/dprint-context.js";
import { stripRangeKeys } from "./internal/semantic.js";
import { resolveOptions } from "./options.js";
import type {
  BirdFormatCheckResult,
  BirdFormatResult,
  BuiltinFormatOutput,
  FormatBirdConfigOptions,
} from "./types.js";

export type {
  BirdFormatCheckResult,
  BirdFormatResult,
  BuiltinFormatOutput,
  BuiltinFormatStats,
  FormatBirdConfigOptions,
  FormatterEngine,
} from "./types.js";

export const formatBirdConfig = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BirdFormatResult> => {
  const resolved = resolveOptions(options);
  const explicitEngine = options.engine;

  if (resolved.engine === "dprint") {
    try {
      return await formatWithEmbeddedDprint(text, resolved);
    } catch (error) {
      if (explicitEngine === "dprint") {
        throw new Error(
          `Formatting with 'dprint' failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return formatWithBuiltin(text, resolved);
};

export const checkBirdConfigFormat = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BirdFormatCheckResult> => ({
  changed: (await formatBirdConfig(text, options)).changed,
});

/** Internal-only helper for regression tests. */
export const __formatBirdConfigBuiltinForTest = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BuiltinFormatOutput> =>
  formatBuiltinForTest(text, resolveOptions(options));

/** Internal-only helper for deterministic unit tests. */
export const __stripRangeKeysForTest = (value: unknown): unknown =>
  stripRangeKeys(value);

/** Internal-only helper for deterministic unit tests. */
export const __resetFormatterStateForTest = (): void => {
  resetDprintContextState();
};
