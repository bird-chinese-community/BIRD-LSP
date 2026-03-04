import { Uri, env, window } from "vscode";

const FAQ_BASE_URL =
  "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/faq.md";
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
  if (!faqId) {
    return ISSUE_CHOOSE_URL;
  }

  // Pre-fill the bug report template title with error context
  // Note: URLSearchParams automatically encodes special characters
  const params = new URLSearchParams({
    template: "bug-report.yml",
    title: `[bug] ${faqId}`,
  });

  return `${ISSUE_CHOOSE_URL}?${params.toString()}`;
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
