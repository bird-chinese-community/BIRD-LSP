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
  type Location,
  type RegistrationParams,
  type DidChangeWatchedFilesRegistrationOptions,
  type GlobPattern,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("preserves another project's graph and diagnostics while editing", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-lsp-isolation-"));
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
  const projectA = join(root, "a");
  const projectB = join(root, "b");
  const uriA = pathToFileURL(join(projectA, "bird.conf")).toString();
  const uriB = pathToFileURL(join(projectB, "bird.conf")).toString();
  const sourceA = "router id 192.0.2.1;\nprotocol device {}\n";
  const sourceB =
    'router id 192.0.2.2;\ninclude "base.conf";\nprotocol bgp edge from shared_b { neighbor 192.0.2.3 as 65001; }\n';
  try {
    for (const project of [projectA, projectB]) {
      await mkdir(project);
      await writeFile(
        join(project, "bird.config.json"),
        JSON.stringify({ main: "bird.conf" }),
      );
    }
    await writeFile(join(projectA, "bird.conf"), sourceA);
    await writeFile(join(projectB, "bird.conf"), sourceB);
    await writeFile(
      join(projectB, "base.conf"),
      "template bgp shared_b { local as 65000; }\n",
    );
    await connection.sendRequest("initialize", {
      processId: process.pid,
      workspaceFolders: [
        { uri: pathToFileURL(projectA).toString(), name: "a" },
        { uri: pathToFileURL(projectB).toString(), name: "b" },
      ],
      capabilities: {
        workspace: { didChangeWatchedFiles: { dynamicRegistration: true } },
      },
    });
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: uriA,
        languageId: "bird",
        version: 1,
        text: sourceA,
      },
    });
    await vi.waitFor(
      () => expect(diagnostics.some((item) => item.uri === uriA)).toBe(true),
      { timeout: 10000 },
    );
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: uriB,
        languageId: "bird",
        version: 1,
        text: sourceB,
      },
    });
    await vi.waitFor(
      () => expect(diagnostics.some((item) => item.uri === uriB)).toBe(true),
      { timeout: 10000 },
    );
    const beforeB = diagnostics.filter((item) => item.uri === uriB).length;
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every((pattern) => typeof pattern === "string")).toBe(true);
    // A disk edit without a B watcher event lets navigation verify B's cached graph.
    await writeFile(
      join(projectB, "base.conf"),
      "template bgp changed_on_disk { local as 65000; }\n",
    );
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri: uriA, version: 2 },
      contentChanges: [{ text: sourceA.replace("192.0.2.1", "192.0.2.9") }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some((item) => item.uri === uriA && item.version === 2),
        ).toBe(true),
      { timeout: 10000 },
    );
    const definition = await connection.sendRequest<Location[]>(
      "textDocument/definition",
      { textDocument: { uri: uriB }, position: { line: 2, character: 26 } },
    );
    expect(definition).toHaveLength(1);
    expect(definition[0].uri).toBe(
      pathToFileURL(join(projectB, "base.conf")).toString(),
    );
    expect(diagnostics.filter((item) => item.uri === uriB)).toHaveLength(
      beforeB,
    );
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  } finally {
    connection.dispose();
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
