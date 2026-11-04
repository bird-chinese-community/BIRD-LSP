import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PublishDiagnosticsParams } from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";
import { startStdioTestServer } from "./helpers/stdio-server.js";

it("cancels related publication across settings changes and recovers project errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-configuration-order-"));
  const server = startStdioTestServer();
  const { connection } = server;
  const uri = pathToFileURL(join(root, "bird.conf")).toString();
  const includeUri = pathToFileURL(join(root, "base.inc")).toString();
  const configPath = join(root, "bird.config.json");
  const configUri = pathToFileURL(configPath).toString();
  const published: PublishDiagnosticsParams[] = [];
  let enabled = true;
  let relatedRequested = false;
  let releaseRelated: ((settings: { enabled: boolean }) => void) | undefined;
  connection.onNotification(
    "textDocument/publishDiagnostics",
    (params: PublishDiagnosticsParams) => published.push(params),
  );
  connection.onRequest(
    "workspace/configuration",
    async (params: { items: { scopeUri?: string }[] }) =>
      Promise.all(
        params.items.map(async (item) => {
          if (item.scopeUri === includeUri && !relatedRequested) {
            relatedRequested = true;
            return new Promise<{ enabled: boolean }>((resolve) => {
              releaseRelated = resolve;
            });
          }
          return { enabled };
        }),
      ),
  );
  connection.listen();
  try {
    await writeFile(configPath, JSON.stringify({ main: "bird.conf" }));
    const source =
      'router id 192.0.2.1;\ninclude "base.inc";\nprotocol bgp edge from base { neighbor 192.0.2.2 as 65001; }\n';
    await writeFile(join(root, "bird.conf"), source);
    await writeFile(
      join(root, "base.inc"),
      "router id 999.0.2.1;\ntemplate bgp base { local as 65000; }\n",
    );
    await server.request("initialize", () =>
      connection.sendRequest("initialize", {
        processId: process.pid,
        rootUri: pathToFileURL(root).toString(),
        capabilities: { workspace: { configuration: true } },
      }),
    );
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, version: 1, languageId: "bird", text: source },
    });
    await vi.waitFor(() => expect(relatedRequested).toBe(true), {
      timeout: 10000,
    });
    enabled = false;
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: { "bird2-lsp": { enabled: false } },
    });
    await vi.waitFor(
      () =>
        expect(
          published.some(
            (item) =>
              item.uri === uri &&
              item.version === 1 &&
              item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    releaseRelated?.({ enabled: true });
    for (let round = 0; round < 2; round += 1)
      expect(
        await server.request(`documentSymbol ${round}`, () =>
          connection.sendRequest("textDocument/documentSymbol", {
            textDocument: { uri },
          }),
        ),
      ).toEqual([]);
    expect(published.some((item) => item.uri === includeUri)).toBe(false);
    enabled = true;
    await writeFile(configPath, "{ invalid");
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: { "bird2-lsp": { enabled: true } },
    });
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: configUri, type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          published.some(
            (item) =>
              item.uri === configUri &&
              item.diagnostics.some(
                (diagnostic) => diagnostic.code === "config/invalid",
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    published.length = 0;
    await writeFile(
      configPath,
      JSON.stringify({ main: "bird.conf", linter: { enabled: false } }),
    );
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: configUri, type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          published.some(
            (item) => item.uri === configUri && item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await vi.waitFor(
      () =>
        expect(
          published.some(
            (item) =>
              item.uri === uri &&
              item.version === 1 &&
              item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await server.request("shutdown", () => connection.sendRequest("shutdown"));
    await connection.sendNotification("exit");
  } finally {
    releaseRelated?.({ enabled: false });
    await server.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
