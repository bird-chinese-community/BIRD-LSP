import { describe, expect, it } from "vitest";
import { configureRequestErrorReporting } from "../src/client/errors.js";

describe("resource request error reporting", () => {
  it("uses the failed request URI and preserves the original failure", async () => {
    const failure = new Error("definition request failed");
    const notifications: boolean[] = [];
    const resources: Array<string | undefined> = [];
    const client = {
      sendRequest: async () => {
        throw failure;
      },
      handleFailedRequest: (
        _type: object,
        _token: object | undefined,
        error: Error,
        _default: object,
        notify: boolean,
      ) => {
        notifications.push(notify);
        throw error;
      },
    } as never as Parameters<typeof configureRequestErrorReporting>[0];
    configureRequestErrorReporting(client, (uri) => {
      resources.push(uri);
      return uri === "file:///one/bird.conf" ? ["textDocument/definition"] : [];
    });
    await expect(
      client.sendRequest("textDocument/definition", {
        textDocument: { uri: "file:///one/bird.conf" },
      }),
    ).rejects.toBe(failure);
    expect(() =>
      client.handleFailedRequest(
        { method: "textDocument/definition" } as never,
        undefined,
        failure,
        [],
      ),
    ).toThrow(failure);
    expect(resources).toEqual(["file:///one/bird.conf"]);
    expect(notifications).toEqual([false]);
  });

  it("retains notifications for other resources and honors explicit suppression", async () => {
    const failure = new Error("request failed");
    const notifications: boolean[] = [];
    const client = {
      sendRequest: async () => {
        throw failure;
      },
      handleFailedRequest: (
        _type: object,
        _token: object | undefined,
        _error: Error,
        value: object,
        notify: boolean,
      ) => {
        notifications.push(notify);
        return value;
      },
    } as never as Parameters<typeof configureRequestErrorReporting>[0];
    configureRequestErrorReporting(client, () => []);
    await expect(
      client.sendRequest("textDocument/references", {
        textDocument: { uri: "file:///two/bird.conf" },
      }),
    ).rejects.toBe(failure);
    const signature = { method: "textDocument/references" } as never;
    expect(
      client.handleFailedRequest(signature, undefined, failure, []),
    ).toEqual([]);
    client.handleFailedRequest(signature, undefined, failure, [], false);
    expect(notifications).toEqual([true, false]);
  });
});
