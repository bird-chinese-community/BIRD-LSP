/**
 * Escapes untrusted text for inline Markdown, including table cells. The
 * result stays inert when a client renders Markdown with HTML enabled.
 */
export const escapeMarkdown = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_{}[\]()<>#!|~&:@]/g, "\\$&")
    .replace(/(www)\./gi, "$1\\.")
    .replace(/^(\d+)([.)])/, "$1\\$2")
    .replace(/^[-+=]/, "\\$&");
