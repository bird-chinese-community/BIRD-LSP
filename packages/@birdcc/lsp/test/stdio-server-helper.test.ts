import { ErrorCodes, ResponseError } from "vscode-languageserver/node.js";
import { expect, it } from "vitest";
import { startStdioTestServer } from "./helpers/stdio-server.js";

it("rejects pending initialization when the real child terminates", async () => {
  const server = startStdioTestServer();
  const { child, connection } = server;
  connection.listen();
  child.stdout.pause();
  let onReadable: (() => void) | undefined;
  try {
    const initialized = server.request("initialize", () =>
      connection.sendRequest("initialize", {
        processId: process.pid,
        capabilities: {},
      }),
    );
    const rejected = expect(initialized).rejects.toThrow(
      /LSP stdio (child exited|connection closed|protocol error).*pending=initialize.*exitCode=.*signal=.*stderr=/u,
    );
    await server.request(
      "initialize response buffered",
      () =>
        new Promise<void>((resolve) => {
          onReadable = () => {
            if (child.stdout.readableLength > 0) resolve();
          };
          child.stdout.on("readable", onReadable);
          onReadable();
        }),
    );
    expect(child.stdout.isPaused()).toBe(true);
    expect(child.kill("SIGTERM")).toBe(true);
    await rejected;
  } finally {
    await server.dispose();
    if (onReadable) child.stdout.off("readable", onReadable);
  }
});

it("preserves normal server ResponseError codes", async () => {
  const server = startStdioTestServer();
  const { connection } = server;
  connection.listen();
  try {
    await server.request("initialize", () =>
      connection.sendRequest("initialize", {
        processId: process.pid,
        capabilities: {},
      }),
    );
    const response = server.request("unsupported request", () =>
      connection.sendRequest("birdcc/test-unsupported-request"),
    );
    await expect(response).rejects.toBeInstanceOf(ResponseError);
    await expect(response).rejects.toMatchObject({
      code: ErrorCodes.MethodNotFound,
    });
    await server.request("shutdown", () => connection.sendRequest("shutdown"));
    await connection.sendNotification("exit");
  } finally {
    await server.dispose();
  }
});
