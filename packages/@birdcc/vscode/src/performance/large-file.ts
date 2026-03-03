import {
  window,
  workspace,
  type OutputChannel,
  type TextDocument,
} from "vscode";

import { CONFIG_SECTION } from "../constants.js";
import { showGuidedErrorMessage } from "../support/faq.js";
import type { ExtensionConfiguration } from "../types.js";

const ONE_KIB = 1024;
const ONE_MIB = 1024 * ONE_KIB;

const toHumanReadableBytes = (bytes: number): string => {
  if (bytes >= ONE_MIB) {
    return `${(bytes / ONE_MIB).toFixed(1)} MiB`;
  }

  if (bytes >= ONE_KIB) {
    return `${Math.round(bytes / ONE_KIB)} KiB`;
  }

  return `${bytes} B`;
};

const getDocumentSizeBytes = async (
  document: TextDocument,
): Promise<number> => {
  if (document.uri.scheme === "file") {
    try {
      return (await workspace.fs.stat(document.uri)).size;
    } catch {
      // Fall back to text length when fs stat is unavailable.
    }
  }

  return Buffer.byteLength(document.getText(), "utf8");
};

export interface LargeFileGuardInput {
  readonly document: TextDocument;
  readonly configuration: ExtensionConfiguration;
  readonly outputChannel: OutputChannel;
  readonly featureName: string;
  readonly warningCache: Set<string>;
}

export interface LargeFileGuardResult {
  readonly skipped: boolean;
  readonly bytes: number;
  readonly maxBytes: number;
}

const largeFileAlertCache = new Set<string>();

const createWarningMessage = (
  featureName: string,
  bytes: number,
  maxBytes: number,
): string =>
  [
    `BIRD2: skipped ${featureName} for large file`,
    `(${toHumanReadableBytes(bytes)} > ${toHumanReadableBytes(maxBytes)}).`,
    `Adjust ${CONFIG_SECTION}.performance.maxFileSizeBytes to change this limit.`,
  ].join(" ");

export const enforceLargeFileGuard = async ({
  document,
  configuration,
  outputChannel,
  featureName,
  warningCache,
}: LargeFileGuardInput): Promise<LargeFileGuardResult> => {
  const maxBytes = configuration.performanceMaxFileSizeBytes;
  const bytes = await getDocumentSizeBytes(document);

  if (bytes <= maxBytes) {
    return {
      skipped: false,
      bytes,
      maxBytes,
    };
  }

  const warningKey = `${featureName}:${document.uri.toString()}`;
  if (!warningCache.has(warningKey)) {
    warningCache.add(warningKey);
    const message = createWarningMessage(featureName, bytes, maxBytes);
    outputChannel.appendLine(`[bird2-lsp] ${message}`);
    void window.setStatusBarMessage(message, 8_000);
    void showGuidedErrorMessage({
      message,
      faqId: "file-too-large",
      dedupeKey: `${document.uri.toString()}:${maxBytes}`,
      dedupeCache: largeFileAlertCache,
    });
  }

  return {
    skipped: true,
    bytes,
    maxBytes,
  };
};
