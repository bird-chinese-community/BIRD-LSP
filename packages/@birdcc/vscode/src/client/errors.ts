import type { LanguageClient } from "vscode-languageclient/node.js";

export const shouldSuppressLspMethod = (
  method: string,
  hiddenErrors: readonly string[],
): boolean => hiddenErrors.includes(method);

export const configureRequestErrorReporting = (
  client: Pick<LanguageClient, "sendRequest" | "handleFailedRequest">,
  getHiddenErrors: (uri?: string) => readonly string[],
): void => {
  const failureResources = new WeakMap<Error, string>();
  client.sendRequest = new Proxy(client.sendRequest, {
    apply: (target, receiver, args) => {
      const params = args[1] as { textDocument?: { uri?: string } } | undefined;
      const uri = params?.textDocument?.uri;
      return Reflect.apply(target, receiver, args).catch((error: unknown) => {
        if (uri && error instanceof Error) failureResources.set(error, uri);
        throw error;
      });
    },
  });
  const handleFailedRequest = client.handleFailedRequest.bind(client);
  client.handleFailedRequest = (
    type,
    token,
    error,
    defaultValue,
    showNotification,
  ) =>
    handleFailedRequest(
      type,
      token,
      error,
      defaultValue,
      showNotification !== false &&
        !shouldSuppressLspMethod(
          type.method,
          getHiddenErrors(
            error instanceof Error ? failureResources.get(error) : undefined,
          ),
        ),
    );
};
