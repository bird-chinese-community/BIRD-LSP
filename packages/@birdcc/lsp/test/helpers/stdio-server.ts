import { spawn } from "node:child_process";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver/node.js";

const STDERR_LIMIT_BYTES = 16 * 1024;

export const startStdioTestServer = () => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {startLspServer} from "./dist/lsp-server.js";startLspServer({disableAsnIntel:true});',
      "--",
      "birdcc-test",
      "--stdio",
    ],
    { cwd: new URL("../..", import.meta.url), stdio: ["pipe", "pipe", "pipe"] },
  );
  const connection = createProtocolConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  const pending = new Map<
    number,
    { phase: string; reject: (error: Error) => void }
  >();
  let nextRequest = 0;
  let lastPhase = "startup";
  let stderr: Buffer = Buffer.alloc(0);
  let failure: Error | undefined;
  let stopping = false;
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );

  const fail = (reason: string, cause?: Error): void => {
    if (failure || stopping) return;
    const phases = [...pending.values()].map((item) => item.phase).join(", ");
    failure = new Error(
      `LSP stdio ${reason}; pending=${phases || "none"}; last=${lastPhase}; ` +
        `exitCode=${child.exitCode ?? "none"}; signal=${child.signalCode ?? "none"}; ` +
        `stderr=${stderr.toString("utf8").trim() || "(empty)"}`,
      { cause },
    );
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    connection.dispose();
  };

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = Buffer.concat([
      stderr,
      chunk.subarray(-STDERR_LIMIT_BYTES),
    ]).subarray(-STDERR_LIMIT_BYTES);
  });
  child.on("error", (error) => fail("child error", error));
  child.on("exit", () => fail("child exited"));
  connection.onError(([error]) => fail("protocol error", error));
  connection.onClose(() => fail("connection closed"));

  const request = <T>(
    phase: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    if (failure) return Promise.reject(failure);
    lastPhase = phase;
    const id = ++nextRequest;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { phase, reject });
      void Promise.resolve()
        .then(operation)
        .then(
          (result) => {
            pending.delete(id);
            resolve(result);
          },
          (error: Error) => {
            pending.delete(id);
            reject(error);
          },
        );
    });
  };

  const dispose = async (): Promise<void> => {
    if (pending.size > 0) fail("test cleanup with pending requests");
    stopping = true;
    connection.dispose();
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    await closed;
  };

  return { child, connection, request, dispose };
};
