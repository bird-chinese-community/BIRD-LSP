import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type PublishDiagnosticsParams,
  type DocumentSymbol,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("reports an analysis limit before parsing an oversized open buffer", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-buffer-limit-"));
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
    { cwd: new URL("..", import.meta.url), stdio: ["pipe", "pipe", "pipe"] },
  );
  const connection = createProtocolConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  const diagnostics: PublishDiagnosticsParams[] = [];
  connection.onNotification(
    "textDocument/publishDiagnostics",
    (params: PublishDiagnosticsParams) => diagnostics.push(params),
  );
  connection.listen();
  const uri = pathToFileURL(join(root, "bird.conf")).toString();
  const configPath = join(root, "bird.config.json");
  const config = { crossFile: { maxDocumentBytes: 64, maxTotalBytes: 1024 } };
  const updateProject = async (
    maxDocumentBytes: number,
    maxTotalBytes = 1024,
  ): Promise<void> => {
    await writeFile(
      configPath,
      JSON.stringify({ crossFile: { maxDocumentBytes, maxTotalBytes } }),
    );
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
  };
  const expectLimit = async (limit: number): Promise<void> => {
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "analysis/size-limit" &&
                  diagnostic.message.includes(`(${limit} bytes)`),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
  };
  const expectAccepted = async (): Promise<void> => {
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 1 &&
              !item.diagnostics.some(
                (diagnostic) => diagnostic.code === "analysis/size-limit",
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
  };
  try {
    await writeFile(configPath, JSON.stringify(config));
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).toString(),
      capabilities: {},
      initializationOptions: {
        birdcc: { performance: { maxFileSizeBytes: 96 } },
      },
    });
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "bird",
        version: 1,
        text: `router id 192.0.2.1;\nprotocol device dev {}\n#${"x".repeat(100)}\n`,
      },
    });
    await expectLimit(64);
    expect(
      await connection.sendRequest("textDocument/documentSymbol", {
        textDocument: { uri },
      }),
    ).toEqual([]);
    await updateProject(512);
    await expectLimit(96);
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: { "bird2-lsp": { performance: { maxFileSizeBytes: 256 } } },
    });
    await expectAccepted();
    expect(
      (
        await connection.sendRequest<DocumentSymbol[]>(
          "textDocument/documentSymbol",
          { textDocument: { uri } },
        )
      ).length,
    ).toBeGreaterThan(0);
    await updateProject(512, 64);
    await expectLimit(64);
    await updateProject(512, 1024);
    await expectAccepted();
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  } finally {
    connection.dispose();
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
