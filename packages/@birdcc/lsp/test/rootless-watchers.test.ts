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
  options: {
    workspaceRoot?: string;
    relativePatterns?: boolean;
    dynamicRegistration?: boolean;
  } = {},
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
              dynamicRegistration: options.dynamicRegistration ?? true,
              relativePatternSupport: options.relativePatterns ?? true,
            },
          },
        },
      });
      await connection.sendNotification("initialized", {});
      if (options.dynamicRegistration !== false)
        await vi.waitFor(
          () => expect(watchers.length).toBeGreaterThanOrEqual(4),
          { timeout: 10000 },
        );
    },
    async open(path: string | URL, text: string) {
      const uri =
        typeof path === "string"
          ? pathToFileURL(path).toString()
          : path.toString();
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: "bird", version: 1, text },
      });
      return uri;
    },
    async close(uri: string) {
      await connection.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });
    },
    hasDiagnostic(uri: string, code: string) {
      return (
        diagnostics
          .filter((item) => item.uri === uri)
          .at(-1)
          ?.diagnostics.some((diagnostic) => diagnostic.code === code) ?? false
      );
    },
    dispose() {
      connection.dispose();
      child.kill();
    },
  };
};

it("analyzes an untitled document without native file registrations", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-untitled-"));
  const session = startSession(root);
  try {
    await session.initialize();
    const uri = await session.open(
      new URL("untitled:birdcc-config"),
      "router id 192.0.2.1;\nprotocol bgp untitled_peer { local as 65000; }\n",
    );
    await vi.waitFor(
      () =>
        expect(session.hasDiagnostic(uri, "bgp/missing-neighbor")).toBe(true),
      { timeout: 10000 },
    );
    expect(session.hasDiagnostic(uri, "lsp/internal-error")).toBe(false);
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it.each([false, true])(
  "observes a closed include immediately after diagnostics (dynamic registration %s)",
  async (dynamicRegistration) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-native-include-"));
    const session = startSession(root, { dynamicRegistration });
    try {
      await writeFile(join(root, "bird.conf"), source);
      await writeFile(join(root, "other.conf"), source);
      const include = join(root, "base.inc");
      await writeFile(include, shared);
      await session.initialize();
      const firstUri = await session.open(join(root, "bird.conf"), source);
      await session.waitForDiagnostics(firstUri, false);
      const secondUri = await session.open(join(root, "other.conf"), source);
      await session.waitForDiagnostics(secondUri, false);
      await session.close(firstUri);
      await vi.waitFor(
        () =>
          expect(
            session.diagnostics.filter((item) => item.uri === firstUri).at(-1)
              ?.diagnostics,
          ).toEqual([]),
        { timeout: 10000 },
      );
      let after = session.diagnostics.length;
      await writeFile(include, renamed);
      await session.waitForDiagnostics(secondUri, true, after);
      after = session.diagnostics.length;
      await writeFile(include, shared);
      await session.waitForDiagnostics(secondUri, false, after);
      expect(
        session.diagnostics.filter((item) => item.uri === firstUri).at(-1)
          ?.diagnostics,
      ).toEqual([]);
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  60000,
);

it("observes wildcard member deletion and creation without client file events", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-native-wildcard-"));
  const session = startSession(root);
  const text = source.replace('"base.inc"', '"parts/*.inc"');
  try {
    const parts = join(root, "parts");
    await mkdir(parts);
    const member = join(parts, "base.inc");
    await writeFile(member, shared);
    await writeFile(join(root, "bird.conf"), text);
    await session.initialize();
    const uri = await session.open(join(root, "bird.conf"), text);
    await session.waitForDiagnostics(uri, false);
    let after = session.diagnostics.length;
    await rm(member);
    await session.waitForDiagnostics(uri, true, after);
    after = session.diagnostics.length;
    await writeFile(join(parts, "replacement.inc"), shared);
    await session.waitForDiagnostics(uri, false, after);
    expect(session.hasDiagnostic(uri, "lsp/internal-error")).toBe(false);
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 60000);

it.each([false, true])(
  "observes immediate config writes after another project closes (dynamic registration %s)",
  async (dynamicRegistration) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-native-config-"));
    const session = startSession(root, { dynamicRegistration });
    try {
      const first = join(root, "first");
      const second = join(root, "second");
      for (const directory of [first, second]) {
        await mkdir(directory);
        await writeFile(join(directory, "bird.conf"), source);
        await writeFile(join(directory, "base.inc"), shared);
        await writeFile(
          join(directory, "bird.config.json"),
          JSON.stringify({ main: "bird.conf", crossFile: { enabled: false } }),
        );
      }
      await session.initialize();
      const firstUri = await session.open(join(first, "bird.conf"), source);
      await session.waitForDiagnostics(firstUri, true);
      const secondUri = await session.open(join(second, "bird.conf"), source);
      await session.waitForDiagnostics(secondUri, true);
      await session.close(firstUri);
      await vi.waitFor(
        () =>
          expect(
            session.diagnostics.filter((item) => item.uri === firstUri).at(-1)
              ?.diagnostics,
          ).toEqual([]),
        { timeout: 10000 },
      );
      const after = session.diagnostics.length;
      await writeFile(
        join(second, "bird.config.json"),
        JSON.stringify({ main: "bird.conf", crossFile: { enabled: true } }),
      );
      await session.waitForDiagnostics(secondUri, false, after);
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  60000,
);

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
      const childUri = pathToFileURL(join(documentDir, "base.inc")).toString();
      await writeFile(
        join(documentDir, "base.inc"),
        `${shared}protocol bgp child_with_error { local as 65002; }\n`,
      );
      await session.initialize();
      const uri = await session.open(join(documentDir, "bird.conf"), source);
      await session.waitForDiagnostics(uri, false);
      expect(session.hasDiagnostic(childUri, "bgp/missing-neighbor")).toBe(
        true,
      );
      const configPath = join(root, configName);
      let after = await session.changeFile(
        configPath,
        FileChangeType.Created,
        JSON.stringify({ crossFile: { enabled: false } }),
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      expect(session.hasDiagnostic(childUri, "bgp/missing-neighbor")).toBe(
        false,
      );
      after = await session.changeFile(
        configPath,
        FileChangeType.Changed,
        JSON.stringify({ crossFile: { enabled: true } }),
        true,
      );
      await session.waitForDiagnostics(uri, false, after);
      expect(session.hasDiagnostic(childUri, "bgp/missing-neighbor")).toBe(
        true,
      );
      after = await session.changeFile(
        join(documentDir, "base.inc"),
        FileChangeType.Changed,
        renamed,
        true,
      );
      await session.waitForDiagnostics(uri, true, after);
      expect(session.hasDiagnostic(childUri, "bgp/missing-neighbor")).toBe(
        false,
      );
    } finally {
      session.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("retains shared include diagnostics for other entries and open documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-shared-diagnostics-"));
  const session = startSession(root);
  const code = "bgp/missing-neighbor";
  try {
    const left = join(root, "left");
    const right = join(root, "right");
    await mkdir(left);
    await mkdir(right);
    const includeUri = pathToFileURL(join(root, "shared.inc")).toString();
    await writeFile(
      join(root, "shared.inc"),
      "protocol bgp shared_error { local as 65003; }\n",
    );
    for (const directory of [left, right]) {
      await writeFile(
        join(directory, "bird.config.json"),
        JSON.stringify({
          main: "bird.conf",
          crossFile: { enabled: true, externalIncludes: true },
        }),
      );
    }
    const entryText = (name: string) =>
      `router id 192.0.2.1;\ninclude "../shared.inc";\nprotocol bgp ${name} { local as 65001; }\n`;
    const leftText = entryText("left_main");
    const rightText = entryText("right_main");
    await writeFile(join(left, "bird.conf"), leftText);
    await writeFile(join(right, "bird.conf"), rightText);
    await session.initialize();
    const leftUri = await session.open(join(left, "bird.conf"), leftText);
    await session.waitForDiagnostics(leftUri, false);
    const rightUri = await session.open(join(right, "bird.conf"), rightText);
    await session.waitForDiagnostics(rightUri, false);
    expect(session.hasDiagnostic(includeUri, code)).toBe(true);
    const after = await session.changeFile(
      join(left, "bird.config.json"),
      FileChangeType.Changed,
      JSON.stringify({ main: "bird.conf", crossFile: { enabled: false } }),
      true,
    );
    await session.waitForDiagnostics(leftUri, false, after);
    expect(session.hasDiagnostic(leftUri, code)).toBe(true);
    expect(session.hasDiagnostic(rightUri, code)).toBe(true);
    expect(session.hasDiagnostic(includeUri, code)).toBe(true);
    expect(
      session.diagnostics.slice(after).some((item) => item.uri === rightUri),
    ).toBe(false);
    await session.close(rightUri);
    await vi.waitFor(
      () => expect(session.hasDiagnostic(includeUri, code)).toBe(false),
      {
        timeout: 10000,
      },
    );
    expect(session.hasDiagnostic(leftUri, code)).toBe(true);
    await session.open(
      join(root, "shared.inc"),
      "protocol bgp shared_error { local as 65003; }\n",
    );
    await vi.waitFor(
      () => expect(session.hasDiagnostic(includeUri, code)).toBe(true),
      {
        timeout: 10000,
      },
    );
    let next = await session.changeFile(
      join(left, "bird.config.json"),
      FileChangeType.Changed,
      JSON.stringify({
        main: "bird.conf",
        crossFile: { enabled: true, externalIncludes: true },
      }),
      true,
    );
    await session.waitForDiagnostics(leftUri, false, next);
    next = await session.changeFile(
      join(left, "bird.config.json"),
      FileChangeType.Changed,
      JSON.stringify({ main: "bird.conf", crossFile: { enabled: false } }),
      true,
    );
    await session.waitForDiagnostics(leftUri, false, next);
    expect(session.hasDiagnostic(includeUri, code)).toBe(true);
    expect(
      session.diagnostics
        .slice(next)
        .some(
          (item) => item.uri === includeUri && item.diagnostics.length === 0,
        ),
    ).toBe(false);
    await session.close(includeUri);
    await vi.waitFor(
      () => expect(session.hasDiagnostic(includeUri, code)).toBe(false),
      {
        timeout: 10000,
      },
    );
    expect(session.hasDiagnostic(leftUri, code)).toBe(true);
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

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
