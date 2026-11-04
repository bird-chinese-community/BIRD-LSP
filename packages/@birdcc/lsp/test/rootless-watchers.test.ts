import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "tinyglobby";
import {
  createProtocolConnection,
  FileChangeType,
  StreamMessageReader,
  StreamMessageWriter,
  WatchKind,
  type DidChangeWatchedFilesRegistrationOptions,
  type FileSystemWatcher,
  type PublishDiagnosticsParams,
  type RegistrationParams,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

const source =
  'router id 192.0.2.1;\ninclude "base.inc";\nprotocol bgp edge from shared { neighbor 192.0.2.2 as 65001; }\n';
const shared = "template bgp shared { local as 65000; }\n";
const renamed = "template bgp renamed { local as 65000; }\n";

const startSession = (
  root: string,
  options: { workspaceRoot?: string; relativePatterns?: boolean } = {},
) => {
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
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const connection = createProtocolConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  const diagnostics: PublishDiagnosticsParams[] = [];
  const watchers: FileSystemWatcher[] = [];
  connection.onNotification(
    "textDocument/publishDiagnostics",
    (payload: PublishDiagnosticsParams) => diagnostics.push(payload),
  );
  connection.onRequest(
    "client/registerCapability",
    (params: RegistrationParams) => {
      for (const registration of params.registrations) {
        if (registration.method === "workspace/didChangeWatchedFiles") {
          watchers.push(
            ...(
              registration.registerOptions as DidChangeWatchedFilesRegistrationOptions
            ).watchers,
          );
        }
      }
      return null;
    },
  );
  connection.listen();

  const watches = async (
    path: string,
    type: FileChangeType,
    anchored = false,
  ) => {
    const kind =
      type === FileChangeType.Created
        ? WatchKind.Create
        : type === FileChangeType.Changed
          ? WatchKind.Change
          : WatchKind.Delete;
    for (const watcher of watchers) {
      if (((watcher.kind ?? 7) & kind) === 0) continue;
      const pattern = watcher.globPattern;
      if (anchored && typeof pattern === "string" && !isAbsolute(pattern))
        continue;
      const cwd =
        typeof pattern === "string"
          ? root
          : fileURLToPath(
              typeof pattern.baseUri === "string"
                ? pattern.baseUri
                : pattern.baseUri.uri,
            );
      const matches = await glob(
        typeof pattern === "string" ? pattern : pattern.pattern,
        {
          cwd,
          absolute: true,
          dot: true,
        },
      );
      if (matches.some((match) => resolve(match) === resolve(path)))
        return true;
    }
    return false;
  };
  const waitForDiagnostics = async (
    uri: string,
    missingShared: boolean,
    after = 0,
  ) => {
    await vi.waitFor(
      () => {
        expect(child.exitCode, stderr).toBeNull();
        expect(
          diagnostics
            .slice(after)
            .some(
              (item) =>
                item.uri === uri &&
                item.version === 1 &&
                item.diagnostics.some((diagnostic) =>
                  diagnostic.message.includes("shared"),
                ) === missingShared,
            ),
        ).toBe(true);
      },
      { timeout: 10000 },
    );
  };
  const changeFile = async (
    path: string,
    type: FileChangeType,
    contents = "",
    anchored = false,
  ) => {
    const after = diagnostics.length;
    if (type === FileChangeType.Deleted) {
      expect(await watches(path, type, anchored)).toBe(true);
      await rm(path);
    } else {
      await writeFile(path, contents);
      await vi.waitFor(
        async () => expect(await watches(path, type, anchored)).toBe(true),
        {
          timeout: 10000,
        },
      );
    }
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(path).toString(), type }],
    });
    return after;
  };
  return {
    diagnostics,
    watches,
    changeFile,
    waitForDiagnostics,
    async initialize() {
      await connection.sendRequest("initialize", {
        processId: process.pid,
        rootUri: options.workspaceRoot
          ? pathToFileURL(options.workspaceRoot).toString()
          : null,
        workspaceFolders: null,
        capabilities: {
          workspace: {
            didChangeWatchedFiles: {
              dynamicRegistration: true,
              relativePatternSupport: options.relativePatterns ?? true,
            },
          },
        },
      });
      await connection.sendNotification("initialized", {});
      await vi.waitFor(
        () => expect(watchers.length).toBeGreaterThanOrEqual(4),
        { timeout: 10000 },
      );
    },
    async open(path: string, text: string) {
      const uri = pathToFileURL(path).toString();
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: "bird", version: 1, text },
      });
      return uri;
    },
    dispose() {
      connection.dispose();
      child.kill();
    },
  };
};

it.each(["bird.config.json", "birdcc.config.json"])(
  "reloads a newly created %s without document edits or workspace roots",
  async (configName) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-rootless-config-"));
    const session = startSession(root, {
      relativePatterns: configName === "birdcc.config.json",
    });
    try {
      const documentDir =
        configName === "birdcc.config.json" ? join(root, "nested") : root;
      if (documentDir !== root) await mkdir(documentDir);
      await writeFile(join(documentDir, "bird.conf"), source);
      await writeFile(join(documentDir, "base.inc"), shared);
      await session.initialize();
      const uri = await session.open(join(documentDir, "bird.conf"), source);
      await session.waitForDiagnostics(uri, false);
      const configPath = join(root, configName);
      let after = await session.changeFile(
        configPath,
        FileChangeType.Created,
        JSON.stringify({ crossFile: { enabled: false } }),
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      after = await session.changeFile(
        configPath,
        FileChangeType.Changed,
        JSON.stringify({ crossFile: { enabled: true } }),
        true,
      );
      await session.waitForDiagnostics(uri, false, after);
      after = await session.changeFile(
        join(documentDir, "base.inc"),
        FileChangeType.Changed,
        renamed,
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("registers configuration changes while rootless cross-file analysis is disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-rootless-disabled-"));
  const session = startSession(root);
  try {
    const configPath = join(root, "bird.config.json");
    await writeFile(
      configPath,
      JSON.stringify({ crossFile: { enabled: false } }),
    );
    await writeFile(join(root, "bird.conf"), source);
    await writeFile(join(root, "base.inc"), shared);
    await session.initialize();
    const uri = await session.open(join(root, "bird.conf"), source);
    await session.waitForDiagnostics(uri, true);
    let after = await session.changeFile(
      configPath,
      FileChangeType.Changed,
      JSON.stringify({ crossFile: { enabled: true } }),
      true,
    );
    await session.waitForDiagnostics(uri, false, after);
    after = await session.changeFile(
      join(root, "base.inc"),
      FileChangeType.Changed,
      renamed,
      true,
    );
    await session.waitForDiagnostics(uri, true, after);
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it.each([true, false])(
  "refreshes rootless arbitrary include files and wildcard members with relative patterns %s",
  async (relativePatterns) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-rootless-includes-"));
    const session = startSession(root, { relativePatterns });
    try {
      await mkdir(join(root, "parts"));
      const text = source.replace(
        'include "base.inc";',
        'include "base.inc";\ninclude "parts/*.inc";',
      );
      const basePath = join(root, "base.inc");
      const addedPath = join(root, "parts", "added.inc");
      await writeFile(
        join(root, "parts", "other.inc"),
        "define unrelated = 1;\n",
      );
      await writeFile(basePath, shared);
      await writeFile(join(root, "bird.conf"), text);
      await session.initialize();
      const uri = await session.open(join(root, "bird.conf"), text);
      await session.waitForDiagnostics(uri, false);
      let after = await session.changeFile(
        basePath,
        FileChangeType.Changed,
        renamed,
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      after = await session.changeFile(
        addedPath,
        FileChangeType.Created,
        shared,
        true,
      );
      await session.waitForDiagnostics(uri, false, after);
      after = await session.changeFile(
        addedPath,
        FileChangeType.Deleted,
        "",
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      after = await session.changeFile(
        basePath,
        FileChangeType.Changed,
        shared,
        true,
      );
      await session.waitForDiagnostics(uri, false, after);
      after = await session.changeFile(
        basePath,
        FileChangeType.Deleted,
        "",
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      after = await session.changeFile(
        basePath,
        FileChangeType.Created,
        shared,
        true,
      );
      await session.waitForDiagnostics(uri, false, after);
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each([false, true])(
  "respects rooted external include watching policy %s",
  async (externalIncludes) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-rooted-includes-"));
    const project = join(root, "project");
    const session = startSession(root, { workspaceRoot: project });
    try {
      await mkdir(project);
      await mkdir(join(root, "external"));
      const includePath = join(root, "external", "base.inc");
      const text = source.replace('"base.inc"', '"../external/base.inc"');
      await writeFile(
        join(project, "bird.config.json"),
        JSON.stringify({ crossFile: { externalIncludes } }),
      );
      await writeFile(join(project, "bird.conf"), text);
      await writeFile(includePath, shared);
      await session.initialize();
      const uri = await session.open(join(project, "bird.conf"), text);
      await session.waitForDiagnostics(uri, !externalIncludes);
      if (externalIncludes) {
        const after = await session.changeFile(
          includePath,
          FileChangeType.Changed,
          renamed,
          true,
        );
        await session.waitForDiagnostics(uri, true, after);
      } else {
        expect(
          await session.watches(includePath, FileChangeType.Changed, true),
        ).toBe(false);
      }
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
