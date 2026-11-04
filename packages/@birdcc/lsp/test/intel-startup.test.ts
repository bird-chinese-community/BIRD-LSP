import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  createMessageConnection,
  ExitNotification,
  InitializeRequest,
  LogMessageNotification,
  MessageType,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
  type LogMessageParams,
} from "vscode-languageserver/node.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ASN database startup diagnostics", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "birdcc-intel-startup-"));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each(["missing", "decode", "disabled"] as const)(
    "initializes the real server with a %s database",
    async (mode) => {
      const dbPath = join(directory, "asn-db.bin.gz");
      if (mode === "decode") {
        await writeFile(dbPath, gzipSync(Buffer.from("invalid MessagePack")));
      }
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("./fixtures/intel-server.mjs", import.meta.url),
          ),
          dbPath,
          mode,
          "--stdio",
        ],
        { stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 },
      );
      const exited = once(child, "exit");
      const client = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin),
      );
      const logs: LogMessageParams[] = [];
      client.onNotification(LogMessageNotification.type, (message) => {
        logs.push(message);
      });
      client.onClose(() => client.dispose());
      client.listen();
      try {
        await client.sendRequest(InitializeRequest.type, {
          processId: null,
          rootUri: null,
          capabilities: {},
          workspaceFolders: [],
        });
        const diagnostic = logs.find((log) =>
          log.message.startsWith("[intel] ASN database unavailable: "),
        );
        if (mode === "disabled") {
          expect(diagnostic).toBeUndefined();
        } else {
          expect(diagnostic?.type).toBe(MessageType.Warning);
          const failure = JSON.parse(
            diagnostic!.message.slice(
              "[intel] ASN database unavailable: ".length,
            ),
          );
          expect(failure).toMatchObject({
            code: mode,
            dbPath,
            version: { packageVersion: expect.any(String) },
          });
          if (mode === "decode") {
            expect(failure.version.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
          }
        }
        await client.sendRequest(ShutdownRequest.type);
        await client.sendNotification(ExitNotification.type);
        expect(await exited).toEqual([0, null]);
      } finally {
        client.dispose();
        if (child.exitCode === null) child.kill();
        await exited;
      }
    },
    15_000,
  );
});
