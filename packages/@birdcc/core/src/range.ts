import type { BirdRange } from "./types.js";

export const createRange = (
  line: number,
  column: number,
  nameLength = 1,
): BirdRange => ({
  line,
  column,
  endLine: line,
  endColumn: column + Math.max(nameLength, 1),
});
