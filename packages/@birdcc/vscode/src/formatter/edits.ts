import { diffChars, type Change } from "diff";

export interface FormattingChange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export const createFormattingChanges = async (
  original: string,
  formatted: string,
): Promise<FormattingChange[]> => {
  const changes = await new Promise<Change[] | undefined>((resolve) => {
    diffChars(original, formatted, { timeout: 500, callback: resolve });
  });
  if (!changes)
    throw new Error("formatting edit generation exceeded its time budget");
  const edits: FormattingChange[] = [];
  let offset = 0;
  let start: number | undefined;
  let replacement = "";
  const flush = (): void => {
    if (start === undefined) return;
    let end = offset;
    if (original[start - 1] === "\r" && original[start] === "\n") {
      start -= 1;
      replacement = `\r${replacement}`;
    }
    if (original[end - 1] === "\r" && original[end] === "\n") {
      end += 1;
      replacement += "\n";
    }
    edits.push({ start, end, text: replacement });
    start = undefined;
    replacement = "";
  };
  for (const change of changes) {
    if (!change.added && !change.removed) {
      flush();
      offset += change.value.length;
    } else {
      start ??= offset;
      if (change.added) replacement += change.value;
      else offset += change.value.length;
    }
  }
  flush();
  return edits;
};
