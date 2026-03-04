import { Uri, env, window } from "vscode";

const FAQ_BASE_URL =
  "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/faq.md";
const BUG_REPORT_URL =
  "https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml";
const ISSUE_CHOOSE_URL =
  "https://github.com/bird-chinese-community/BIRD-LSP/issues/new/choose";

const OPEN_FAQ_ACTION = "Open FAQ";
const REPORT_ISSUE_ACTION = "Report Issue";

const FAQ_ANCHOR_BY_ID = {
  "file-too-large": "#faq-file-too-large",
  "type-hints-runtime-failed": "#faq-type-hints-runtime-failed",
  "validation-command-failed": "#faq-validation-command-failed",
  "extension-command-failed": "#faq-extension-command-failed",
} as const;

export type FaqId = keyof typeof FAQ_ANCHOR_BY_ID;

const resolveFaqUrl = (faqId?: FaqId): string => {
  if (!faqId) {
    return FAQ_BASE_URL;
  }

  return `${FAQ_BASE_URL}${FAQ_ANCHOR_BY_ID[faqId]}`;
};

const resolveIssueUrl = (faqId?: FaqId): string => {
  const baseUrl = faqId ? BUG_REPORT_URL : ISSUE_CHOOSE_URL;

  if (!faqId) {
    return baseUrl;
  }

  // Pre-fill the bug report template with context from the error
  const prefilledDescription = encodeURIComponent(
    [
      `### Error Context`,
      `faqId: \`${faqId}\``,
      "",
      `### Environment`,
      `- Extension version: `,
      `- VS Code version: `,
      `- OS: `,
      "",
      `### Steps to Reproduce`,
      `1. `,
      `2. `,
      `3. `,
      "",
      `### Expected Behavior`,
      "",
      `### Actual Behavior`,
      "",
      `### Additional Context`,
      `<!-- Add any other context, logs, or screenshots about the problem here. -->`,
    ].join("\n"),
  );

  return `${baseUrl}&description=${prefilledDescription}`;
};

export interface GuidedErrorOptions {
  readonly message: string;
  readonly faqId?: FaqId;
  readonly dedupeKey?: string;
  readonly dedupeCache?: Set<string>;
}

export const showGuidedErrorMessage = async ({
  message,
  faqId,
  dedupeKey,
  dedupeCache,
}: GuidedErrorOptions): Promise<void> => {
  if (dedupeKey && dedupeCache?.has(dedupeKey)) {
    return;
  }
  if (dedupeKey && dedupeCache) {
    dedupeCache.add(dedupeKey);
  }

  const selection = await window.showErrorMessage(
    message,
    OPEN_FAQ_ACTION,
    REPORT_ISSUE_ACTION,
  );

  if (selection === OPEN_FAQ_ACTION) {
    await env.openExternal(Uri.parse(resolveFaqUrl(faqId)));
    return;
  }

  if (selection === REPORT_ISSUE_ACTION) {
    await env.openExternal(Uri.parse(resolveIssueUrl(faqId)));
  }
};
