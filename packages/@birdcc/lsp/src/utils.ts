import {
  MessageType,
  type Connection,
  type Diagnostic,
  type Position,
  type Range,
} from "vscode-languageserver/node.js";

/**
 * Minimal 1-based source range interface accepted by shared LSP utilities.
 * Structurally compatible with `SourceRange` from `@birdcc/parser` and
 * `SymbolDefinition`/`SymbolReference` from `@birdcc/core`.
 */
export interface SourceRangeLike {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Document-like object accepted by {@link getLineText}.
 * Supports both `lineAt` (VS Code vscode.TextDocument) and `getText`
 * (vscode-languageserver-textdocument TextDocument) interfaces.
 */
export interface GetLineTextDocument {
  readonly lineCount: number;
  lineAt?: (line: number) => { readonly text: string };
  getText?: (range?: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  }) => string;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/** Normalize a keyword or phrase into a canonical lowercase single-space key. */
export const toCanonicalKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// Range / position utilities
// ---------------------------------------------------------------------------

/** Convert a 1-based {@link SourceRangeLike} into a 0-based LSP {@link Range}. */
export const toLspRange = (range: SourceRangeLike): Range => ({
  start: {
    line: Math.max(range.line - 1, 0),
    character: Math.max(range.column - 1, 0),
  },
  end: {
    line: Math.max(range.endLine - 1, 0),
    character: Math.max(range.endColumn - 1, 0),
  },
});

/** Check whether a 0-based LSP {@link Position} falls inside a 1-based {@link SourceRangeLike}. */
export const isPositionInRange = (
  position: Position,
  range: SourceRangeLike,
): boolean => {
  const line = position.line + 1;
  const character = position.character + 1;

  if (line < range.line || line > range.endLine) {
    return false;
  }

  if (line === range.line && character < range.column) {
    return false;
  }

  if (line === range.endLine && character > range.endColumn) {
    return false;
  }

  return true;
};

// ---------------------------------------------------------------------------
// Document text helpers
// ---------------------------------------------------------------------------

/** Extract the text content of a single line from a document-like object. */
export const getLineText = (
  document: GetLineTextDocument,
  line: number,
): string => {
  if (document.lineAt && typeof document.lineAt === "function") {
    return document.lineAt(line).text;
  }

  if (document.getText && typeof document.getText === "function") {
    const start = { line, character: 0 };
    const end =
      line + 1 < document.lineCount
        ? { line: line + 1, character: 0 }
        : { line, character: Number.MAX_SAFE_INTEGER };

    return document.getText({ start, end }).replace(/\r?\n$/, "");
  }

  return "";
};

// ---------------------------------------------------------------------------
// LSP notification helpers
// ---------------------------------------------------------------------------

/** Send a typed `window/showMessage` notification. */
export const showMessage = (
  connection: Connection,
  type: MessageType,
  message: string,
): void => {
  connection.sendNotification("window/showMessage", { type, message });
};

/** Send an Info-level `window/showMessage` notification. */
export const showInfo = (connection: Connection, message: string): void =>
  showMessage(connection, MessageType.Info, message);

/** Send a Warning-level `window/showMessage` notification. */
export const showWarning = (connection: Connection, message: string): void =>
  showMessage(connection, MessageType.Warning, message);

/** Send an Info-level notification only once per `key`. */
export const showInfoOnce = (
  connection: Connection,
  seen: Set<string>,
  key: string,
  message: string,
): void => {
  if (seen.has(key)) return;
  seen.add(key);
  showInfo(connection, message);
};

// ---------------------------------------------------------------------------
// Diagnostics helpers
// ---------------------------------------------------------------------------

/** Publish diagnostics for a single URI. */
export const publishDiagnostics = (
  connection: Connection,
  uri: string,
  diagnostics: Diagnostic[],
  version?: number,
): void => {
  connection.sendDiagnostics({ uri, version, diagnostics });
};

/** Clear diagnostics for a single URI. */
export const clearDiagnostics = (connection: Connection, uri: string): void => {
  connection.sendDiagnostics({ uri, diagnostics: [] });
};

/** Clear diagnostics for multiple URIs at once. */
export const clearDiagnosticsMany = (
  connection: Connection,
  uris: Iterable<string>,
): void => {
  for (const uri of uris) clearDiagnostics(connection, uri);
};

// ---------------------------------------------------------------------------
// Handler guard helpers
// ---------------------------------------------------------------------------

/** Minimal document store interface accepted by {@link withDocument}. */
export interface DocumentStore<TDocument> {
  get(uri: string): TDocument | undefined;
}

/**
 * Guard helper that looks up a document by URI and runs `fn` only when found.
 * Returns `fallback` when the document is not in the store.
 */
export const withDocument = async <TDocument, TResult>(
  store: DocumentStore<TDocument>,
  uri: string,
  fallback: TResult,
  fn: (doc: TDocument) => Promise<TResult> | TResult,
): Promise<TResult> => {
  const doc = store.get(uri);
  if (!doc) return fallback;
  return await fn(doc);
};
