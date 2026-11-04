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
  type TextEdit,
  type Location,
  type InlayHint,
  type Hover,
  type CompletionItem,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("applies project rules, format precedence, reference context, and editor settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-server-config-"));
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {startLspServer} from "./dist/lsp-server.js"; startLspServer();',
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
  const configPath = join(root, "bird.config.json");
  const uri = pathToFileURL(join(root, "bird.conf")).toString();
  const source =
    "router id 192.0.2.1;\ntemplate bgp base {\n local as 13335;\n}\nprotocol bgp edge from base {\n neighbor 192.0.2.2 as 174;\n}\n";
  const formatParams = {
    textDocument: { uri },
    options: { tabSize: 6, insertSpaces: true },
  };
  const inlayParams = {
    textDocument: { uri },
    range: { start: { line: 0, character: 0 }, end: { line: 7, character: 0 } },
  };
  const config = {
    main: "bird.conf",
    formatter: { engine: "builtin", indentSize: 3, safeMode: true },
    linter: { enabled: false },
  };
  try {
    await writeFile(configPath, JSON.stringify(config));
    await writeFile(join(root, "bird.conf"), source);
    await connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).toString(),
      capabilities: {},
      initializationOptions: {
        birdcc: {
          intel: { enabled: false },
          formatter: { engine: "builtin", indentSize: 4 },
        },
      },
    });
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, version: 1, languageId: "bird", text: source },
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 1 &&
              item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    const edits = await connection.sendRequest<TextEdit[]>(
      "textDocument/formatting",
      formatParams,
    );
    expect(edits[0].newText).toContain("\n   local as 13335;");
    const tabEdits = await connection.sendRequest<TextEdit[]>(
      "textDocument/formatting",
      {
        ...formatParams,
        options: { tabSize: 6, insertSpaces: false },
      },
    );
    expect(tabEdits[0].newText).toContain("\n\tlocal as 13335;");
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        formatter: { ...config.formatter, useTabs: false },
      }),
    );
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    const projectSpaceEdits = await connection.sendRequest<TextEdit[]>(
      "textDocument/formatting",
      { ...formatParams, options: { tabSize: 6, insertSpaces: false } },
    );
    expect(projectSpaceEdits[0].newText).toContain("\n   local as 13335;");
    await writeFile(configPath, JSON.stringify(config));
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    const referenceParams = {
      textDocument: { uri },
      position: { line: 4, character: 24 },
      context: { includeDeclaration: false },
    };
    const uses = await connection.sendRequest<Location[]>(
      "textDocument/references",
      referenceParams,
    );
    const all = await connection.sendRequest<Location[]>(
      "textDocument/references",
      { ...referenceParams, context: { includeDeclaration: true } },
    );
    expect(uses).toHaveLength(1);
    expect(all).toHaveLength(2);
    expect(uses.every((item) => item.range.start.line === 4)).toBe(true);
    expect(
      await connection.sendRequest<InlayHint[]>(
        "textDocument/inlayHint",
        inlayParams,
      ),
    ).toEqual([]);
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {
        "bird2-lsp": {
          intel: {
            enabled: true,
            inlayHints: true,
            hover: true,
            completion: true,
          },
        },
      },
    });
    expect(
      (
        await connection.sendRequest<InlayHint[]>(
          "textDocument/inlayHint",
          inlayParams,
        )
      ).length,
    ).toBeGreaterThan(0);
    const hoverParams = {
      textDocument: { uri },
      position: { line: 2, character: 12 },
    };
    const completionParams = {
      textDocument: { uri },
      position: { line: 2, character: 15 },
    };
    const asnHover = await connection.sendRequest<Hover>(
      "textDocument/hover",
      hoverParams,
    );
    expect(asnHover).not.toBeNull();
    expect(
      (
        await connection.sendRequest<CompletionItem[]>(
          "textDocument/completion",
          completionParams,
        )
      ).some((item) => item.label === "13335"),
    ).toBe(true);
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {
        "bird2-lsp": {
          intel: {
            enabled: true,
            inlayHints: false,
            hover: false,
            completion: false,
          },
        },
      },
    });
    expect(
      await connection.sendRequest("textDocument/hover", hoverParams),
    ).not.toEqual(asnHover);
    expect(
      (
        await connection.sendRequest<CompletionItem[]>(
          "textDocument/completion",
          completionParams,
        )
      ).some((item) => item.label === "13335"),
    ).toBe(false);
    expect(
      await connection.sendRequest<InlayHint[]>(
        "textDocument/inlayHint",
        inlayParams,
      ),
    ).toEqual([]);
    diagnostics.length = 0;
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        crossFile: { enabled: false },
        linter: { rules: { "cfg/*": "info", "bgp/*": "off" } },
      }),
    );
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: source.replace("192.0.2.1", "999.0.2.1") }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 2 &&
              item.diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "cfg/incompatible-type" &&
                  diagnostic.severity === 3,
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    expect(
      diagnostics
        .filter((item) => item.uri === uri)
        .at(-1)
        ?.diagnostics.some((item) => String(item.code).startsWith("bgp/")),
    ).toBe(false);
    diagnostics.length = 0;
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        linter: { rules: { "cfg/*": "info", "bgp/*": "off" } },
      }),
    );
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === uri &&
              item.version === 2 &&
              item.diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "cfg/incompatible-type" &&
                  diagnostic.severity === 3,
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
    await writeFile(configPath, '{"crossFile":{"maxFiles":1025}}');
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === pathToFileURL(configPath).toString() &&
              item.diagnostics.some(
                (diagnostic) =>
                  diagnostic.code === "config/invalid" &&
                  diagnostic.message.includes("maxFiles"),
              ),
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    diagnostics.length = 0;
    await writeFile(configPath, JSON.stringify(config));
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(configPath).toString(), type: 2 }],
    });
    await vi.waitFor(
      () =>
        expect(
          diagnostics.some(
            (item) =>
              item.uri === pathToFileURL(configPath).toString() &&
              item.diagnostics.length === 0,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    await connection.sendNotification("workspace/didChangeConfiguration", {
      settings: { "bird2-lsp": { enabled: false } },
    });
    expect(
      await connection.sendRequest<Location[]>(
        "textDocument/references",
        referenceParams,
      ),
    ).toEqual([]);
    await connection.sendRequest("shutdown");
    await connection.sendNotification("exit");
  } finally {
    connection.dispose();
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
