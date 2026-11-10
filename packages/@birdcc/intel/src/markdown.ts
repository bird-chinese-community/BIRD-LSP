const collapse = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Escapes untrusted text for inline Markdown, including table cells. The
 * result stays inert when a client renders Markdown with HTML enabled.
 */
export const escapeMarkdown = (value: string): string =>
  collapse(value)
    .replace(/[\\`*_{}[\]()<>#!|~&:@]/g, "\\$&")
    .replace(/(www)\./gi, "$1\\.")
    .replace(/^(\d+)([.)])/, "$1\\$2")
    .replace(/^[-+=]/, "\\$&");

/**
 * Wraps untrusted text in an inline code span. The fence is longer than any
 * backtick run in the value, so the value cannot end the span.
 */
export const markdownCode = (value: string): string => {
  const content = collapse(value);
  const longest = Math.max(
    0,
    ...(content.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  return /^`|`$/.test(content)
    ? `${fence} ${content} ${fence}`
    : `${fence}${content}${fence}`;
};
