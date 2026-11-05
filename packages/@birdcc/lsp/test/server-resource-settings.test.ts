import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type DocumentSymbol,
  type PublishDiagnosticsParams,
  type InlayHint,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("uses resource-scoped enabled settings and refreshes them on configuration changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-resource-settings-"));
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
  const uriA = pathToFileURL(join(root, "a.conf")).toString();
  const uriB = pathToFileURL(join(root, "b.conf")).toString();
  const enabled = new Map([
    [uriA, true],
    [uriB, false],
  ]);
  let typeHintsEnabled = true;
  const diagnostics: PublishDiagnosticsParams[] = [];
  connection.onNotification(
    "textDocument/publishDiagnostics",
    (params: PublishDiagnosticsParams) => diagnostics.push(params),
  );
  connection.onRequest(
    "workspace/configuration",
    (params: { items: { scopeUri?: string; section?: string }[] }) =>
      params.items.map((item) => {
        expect(item.section).toBe("bird2-lsp");
        return {
          enabled: enabled.get(item.scopeUri ?? "") ?? true,
          typeHints: {
            enabled: typeHintsEnabled,
            inlay: { enabled: typeHintsEnabled },
          },
        };
      }),
  );
  connection.listen();
  try {
    await writeFile(
      join(root, "bird.config.json"),
      JSON.stringify({ crossFile: { enabled: false } }),
    );
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).toString(),
      capabilities: { workspace: { configuration: true } },
      initializationOptions: { birdcc: { enabled: true } },
    });
    await connection.sendNotification("initialized", {});
    for (const uri of [uriA, uriB])
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "bird",
          version: 1,
          text: "router id 999.0.2.1;\nprotocol device dev {}\nfunction answer() { return 1; }\n",
        },
      });
    const symbols = (uri: string) =>
      connection.sendRequest<DocumentSymbol[]>("textDocument/documentSymbol", {
        textDocument: { uri },
      });
    expect((await symbols(uriA)).length).toBeGreaterThan(0);
    expect(await symbols(uriB)).toEqual([]);
    const hints = (uri: string) =>
      connection.sendRequest<InlayHint[]>("textDocument/inlayHint", {
        textDocument: { uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 4, character: 0 },
        },
      });
    expect((await hints(uriA)).length).toBeGreaterThan(0);
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) => item.uri === uriA && item.diagnostics.length > 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    enabled.set(uriA, false);
    enabled.set(uriB, true);
    typeHintsEnabled = false;
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {},
    });
    expect(await symbols(uriA)).toEqual([]);
    expect((await symbols(uriB)).length).toBeGreaterThan(0);
    expect(await hints(uriB)).toEqual([]);
    typeHintsEnabled = true;
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {},
    });
    expect((await hints(uriB)).length).toBeGreaterThan(0);
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) => item.uri === uriA && item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  } finally {
    connection.dispose();
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
