import { afterEach, describe, expect, it, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createValidationScheduler,
  type ValidationDocument,
  type ValidationPublishPayload,
} from "../src/validation.js";

interface MockDiagnostic {
  code: string;
}

interface MockDocument extends ValidationDocument {
  text: string;
}

const createDocument = (
  uri: string,
  text: string,
  version = 1,
): MockDocument => ({
  uri,
  version,
  text,
  getText(): string {
    return this.text;
  },
});

describe("@birdcc/lsp validation scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates an in-flight result as soon as a mutable document is scheduled", async () => {
    vi.useFakeTimers();
    const document = TextDocument.create("file:///bird.conf", "bird", 1, "old");
    const published: ValidationPublishPayload<string>[] = [];
    let finish: (diagnostics: string[]) => void = () => {};
    const scheduler = createValidationScheduler<TextDocument, string>({
      debounceMs: 100,
      validate: async (input) => {
        const text = input.getText();
        await new Promise<string[]>((resolve) => {
          finish = resolve;
        });
        return [text];
      },
      publish: (payload) => published.push(payload),
    });
    scheduler.schedule(document);
    await vi.advanceTimersByTimeAsync(100);
    TextDocument.update(document, [{ text: "new" }], 2);
    scheduler.schedule(document);
    finish([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(published).toEqual([]);
    scheduler.close(document.uri);
    expect(published).toEqual([
      { uri: document.uri, version: 2, diagnostics: [] },
    ]);
  });

  it("keeps published diagnostics when validation is superseded", async () => {
    vi.useFakeTimers();
    const published: ValidationPublishPayload<string>[] = [];
    const scheduler = createValidationScheduler<TextDocument, string>({
      debounceMs: 1,
      validate: async () => undefined,
      publish: (payload) => published.push(payload),
    });
    scheduler.schedule(
      TextDocument.create(
        "file:///bird.conf",
        "bird",
        1,
        "router id 192.0.2.1;",
      ),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([]);
  });

  it("debounces rapid document changes and validates only latest text", async () => {
    vi.useFakeTimers();
    const validate = vi.fn(
      async (document: MockDocument): Promise<MockDiagnostic[]> => {
        return [{ code: document.getText() }];
      },
    );
    const publish =
      vi.fn<(payload: ValidationPublishPayload<MockDiagnostic>) => void>();
    const scheduler = createValidationScheduler<MockDocument, MockDiagnostic>({
      debounceMs: 100,
      validate,
      publish,
    });

    const docV1 = createDocument("file:///bird.conf", "v1");
    const docV2 = createDocument("file:///bird.conf", "v2");

    scheduler.schedule(docV1);
    scheduler.schedule(docV2);

    await vi.advanceTimersByTimeAsync(100);

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith(docV2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      uri: "file:///bird.conf",
      version: 1,
      diagnostics: [{ code: "v2" }],
    });
  });

  it("drops stale validation result after close", async () => {
    vi.useFakeTimers();

    let resolveValidation: ((value: MockDiagnostic[]) => void) | null = null;
    const validate = vi.fn(
      (document: MockDocument): Promise<MockDiagnostic[]> =>
        new Promise((resolve) => {
          resolveValidation = resolve;
          void document;
        }),
    );
    const publish =
      vi.fn<(payload: ValidationPublishPayload<MockDiagnostic>) => void>();
    const scheduler = createValidationScheduler<MockDocument, MockDiagnostic>({
      debounceMs: 1,
      validate,
      publish,
    });

    const uri = "file:///bird.conf";
    scheduler.schedule(createDocument(uri, "v1"));
    await vi.advanceTimersByTimeAsync(1);
    scheduler.close(uri);

    resolveValidation?.([{ code: "stale-result" }]);
    await vi.waitUntil(() => publish.mock.calls.length === 1);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      uri,
      version: 1,
      diagnostics: [],
    });
  });

  it("publishes reopened document diagnostics after close while dropping older in-flight results", async () => {
    vi.useFakeTimers();

    let resolveFirstValidation: ((value: MockDiagnostic[]) => void) | null =
      null;
    const validate = vi.fn(
      (document: MockDocument): Promise<MockDiagnostic[]> => {
        if (document.version === 1) {
          return new Promise((resolve) => {
            resolveFirstValidation = resolve;
          });
        }

        return Promise.resolve([{ code: `v${document.version}` }]);
      },
    );
    const publish =
      vi.fn<(payload: ValidationPublishPayload<MockDiagnostic>) => void>();
    const scheduler = createValidationScheduler<MockDocument, MockDiagnostic>({
      debounceMs: 1,
      validate,
      publish,
    });

    const uri = "file:///bird.conf";
    scheduler.schedule(createDocument(uri, "v1", 1));
    await vi.advanceTimersByTimeAsync(1);
    scheduler.close(uri);

    scheduler.schedule(createDocument(uri, "v2", 2));
    await vi.advanceTimersByTimeAsync(1);

    resolveFirstValidation?.([{ code: "stale-v1" }]);
    await vi.waitUntil(() => publish.mock.calls.length === 2);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[0]).toEqual({
      uri,
      version: 1,
      diagnostics: [],
    });
    expect(publish.mock.calls[1]?.[0]).toEqual({
      uri,
      version: 2,
      diagnostics: [{ code: "v2" }],
    });
  });

  it("drops older in-flight diagnostics when a newer validation for same uri completes", async () => {
    vi.useFakeTimers();

    let resolveFirstValidation: ((value: MockDiagnostic[]) => void) | null =
      null;
    const validate = vi.fn(
      (document: MockDocument): Promise<MockDiagnostic[]> => {
        if (document.version === 1) {
          return new Promise((resolve) => {
            resolveFirstValidation = resolve;
          });
        }

        return Promise.resolve([{ code: "fresh-v2" }]);
      },
    );
    const publish =
      vi.fn<(payload: ValidationPublishPayload<MockDiagnostic>) => void>();
    const scheduler = createValidationScheduler<MockDocument, MockDiagnostic>({
      debounceMs: 1,
      validate,
      publish,
    });

    const uri = "file:///bird.conf";
    scheduler.schedule(createDocument(uri, "v1", 1));
    await vi.advanceTimersByTimeAsync(1);

    scheduler.schedule(createDocument(uri, "v2", 2));
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitUntil(() => publish.mock.calls.length === 1);

    resolveFirstValidation?.([{ code: "stale-v1" }]);
    await vi.waitUntil(() => publish.mock.calls.length === 1);

    expect(publish.mock.calls[0]?.[0]).toEqual({
      uri,
      version: 2,
      diagnostics: [{ code: "fresh-v2" }],
    });
  });

  it("publishes empty diagnostics when closing unknown uri", () => {
    const validate = vi.fn(async () => []);
    const publish =
      vi.fn<(payload: ValidationPublishPayload<MockDiagnostic>) => void>();
    const scheduler = createValidationScheduler<MockDocument, MockDiagnostic>({
      debounceMs: 1,
      validate,
      publish,
    });

    scheduler.close("file:///missing.conf");

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      uri: "file:///missing.conf",
      version: undefined,
      diagnostics: [],
    });
    expect(validate).not.toHaveBeenCalled();
  });
});
