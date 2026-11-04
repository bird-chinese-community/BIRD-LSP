import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type PublishDiagnosticsParams,
  type RegistrationParams,
  type DidChangeWatchedFilesRegistrationOptions,
  type GlobPattern,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("refreshes disk includes and wildcard members through real stdio", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-state-"));
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { startLspServer } from "./dist/lsp-server.js"; startLspServer({disableAsnIntel:true});',
      "--",
      "birdcc-lsp-test",
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
    (payload: PublishDiagnosticsParams) => diagnostics.push(payload),
  );
  const patterns: GlobPattern[] = [];
  connection.onRequest(
    "client/registerCapability",
    (params: RegistrationParams) => {
      for (const registration of params.registrations)
        patterns.push(
          ...(
            registration.registerOptions as DidChangeWatchedFilesRegistrationOptions
          ).watchers.map((watcher) => watcher.globPattern),
        );
      return null;
    },
  );
  connection.listen();
  const uri = pathToFileURL(join(root, "bird.conf")).toString();
  const source =
    'router id 192.0.2.1;\ninclude "parts/*.inc";\nprotocol bgp edge from shared { neighbor 192.0.2.2 as 65001; }\n';
  try {
    await mkdir(join(root, "parts"));
    await writeFile(
      join(root, "bird.config.json"),
      JSON.stringify({ main: "bird.conf" }),
    );
    await writeFile(join(root, "bird.conf"), source);
    const includePath = join(root, "parts", "base.inc");
    await writeFile(includePath, "template bgp shared { local as 65000; }\n");
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).toString(),
      capabilities: {
        workspace: {
          didChangeWatchedFiles: {
            dynamicRegistration: true,
            relativePatternSupport: true,
          },
        },
      },
    });
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: "bird", version: 1, text: source },
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some((item) => item.uri === uri && item.version === 1),
        ).toBe(true),
      { timeout: 10000 },
    );
    await vi.waitFor(() => expect(patterns.length).toBeGreaterThan(4), {
      timeout: 10000,
    });
    expect(patterns.every((pattern) => typeof pattern !== "string")).toBe(true);
    diagnostics.length = 0;
    await writeFile(includePath, "template bgp renamed { local as 65000; }\n");
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(includePath).toString(), type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("shared"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
    const newPath = join(root, "parts", "added.inc");
    await writeFile(newPath, "template bgp shared { local as 65000; }\n");
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(newPath).toString(), type: 1 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              !item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("shared"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
    await rm(newPath);
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(newPath).toString(), type: 3 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("shared"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
    await rm(join(root, "parts"), { recursive: true });
    diagnostics.length = 0;
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [
        { uri: pathToFileURL(join(root, "parts")).toString(), type: 3 },
      ],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("Included file not found"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await mkdir(join(root, "parts"));
    await writeFile(includePath, "template bgp renamed { local as 65000; }\n");
    diagnostics.length = 0;
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [
        { uri: pathToFileURL(join(root, "parts")).toString(), type: 1 },
      ],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              !item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("Included file not found"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri, version: 2 },
      contentChanges: [
        { text: source.replace("from shared", "from obsolete") },
      ],
    });
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri, version: 3 },
      contentChanges: [{ text: source.replace("from shared", "from renamed") }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 3 &&
              !item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("obsolete"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await connection.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
    diagnostics.length = 0;
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "bird",
        version: 1,
        text: source.replace("from shared", "from reopened"),
      },
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 1 &&
              item.diagnostics.some((diagnostic) =>
                diagnostic.message.includes("reopened"),
              ),
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
