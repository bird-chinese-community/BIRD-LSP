export interface ValidationDocument {
  uri: string;
  version: number;
  getText(): string;
}

export interface ValidationPublishPayload<TDiagnostic> {
  uri: string;
  version?: number;
  diagnostics: TDiagnostic[];
}

export interface ValidationSchedulerOptions<TDocument extends ValidationDocument, TDiagnostic> {
  debounceMs: number;
  validate(document: TDocument): Promise<TDiagnostic[]>;
  publish(payload: ValidationPublishPayload<TDiagnostic>): void;
}

export interface ValidationScheduler<TDocument extends ValidationDocument> {
  schedule(document: TDocument): void;
  close(uri: string): void;
}

export const createValidationScheduler = <TDocument extends ValidationDocument, TDiagnostic>(
  options: ValidationSchedulerOptions<TDocument, TDiagnostic>,
): ValidationScheduler<TDocument> => {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const latestTicketByUri = new Map<string, number>();
  const latestVersionByUri = new Map<string, number>();
  let nextTicket = 0;

  const clearPending = (uri: string): void => {
    const pendingTimer = pendingTimers.get(uri);
    if (!pendingTimer) {
      return;
    }

    clearTimeout(pendingTimer);
    pendingTimers.delete(uri);
  };

  const runValidation = async (document: TDocument): Promise<void> => {
    const uri = document.uri;
    const ticket = ++nextTicket;
    latestTicketByUri.set(uri, ticket);
    latestVersionByUri.set(uri, document.version);

    const diagnostics = await options.validate(document);
    if (latestTicketByUri.get(uri) !== ticket) {
      return;
    }

    options.publish({ uri, version: document.version, diagnostics });
  };

  return {
    schedule: (document: TDocument): void => {
      clearPending(document.uri);

      const timer = setTimeout(() => {
        pendingTimers.delete(document.uri);
        void runValidation(document);
      }, options.debounceMs);

      pendingTimers.set(document.uri, timer);
    },
    close: (uri: string): void => {
      clearPending(uri);
      latestTicketByUri.delete(uri);
      const version = latestVersionByUri.get(uri);
      latestVersionByUri.delete(uri);
      options.publish({
        uri,
        version,
        diagnostics: [],
      });
    },
  };
};
