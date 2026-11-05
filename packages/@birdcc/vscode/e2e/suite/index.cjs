const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");

const manifest = require("../../package.json");

assert.ok(manifest.publisher, "manifest.publisher is required");
assert.ok(manifest.name, "manifest.name is required");

const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`;
const COMMAND_IDS = [
  "bird2-lsp.restartLanguageServer",
  "bird2-lsp.enableLanguageServer",
  "bird2-lsp.disableLanguageServer",
  "bird2-lsp.validateActiveDocument",
  "bird2-lsp.formatActiveDocument",
  "bird2-lsp.openSettings",
  "bird2-lsp.showOutputChannel",
  "bird2-lsp.showDocumentation",
  "bird2-lsp.reloadConfiguration",
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForValue = async (
  readValue,
  expected,
  errorMessage,
  attempts = 20,
  intervalMs = 100,
) => {
  for (let index = 0; index < attempts; index += 1) {
    if (readValue() === expected) {
      return;
    }
    await wait(intervalMs);
  }

  assert.equal(readValue(), expected, errorMessage);
};

const resolveConfigurationTarget = (vscode) =>
  vscode.workspace.workspaceFolders &&
  vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

const openTempBirdDocument = async (
  vscode,
  content,
  fileName = "e2e.bird2.conf",
) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bird2-lsp-e2e-"));
  const filePath = path.join(tempDir, fileName);
  await writeFile(filePath, content, "utf8");

  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(filePath),
  );
  const editor = await vscode.window.showTextDocument(document);

  return {
    document,
    editor,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
};

const ensureWorkspaceFolder = async (vscode) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bird2-lsp-workspace-"));
  const insertionIndex = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders.length
    : 0;
  const added = vscode.workspace.updateWorkspaceFolders(insertionIndex, 0, {
    uri: vscode.Uri.file(tempDir),
    name: "bird2-lsp-e2e-workspace",
  });

  assert.equal(
    added,
    true,
    "workspace folder should be added for configuration tests",
  );
  await wait(200);

  return {
    uri: vscode.Uri.file(tempDir),
    cleanup: async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const removeIndex = folders.findIndex(
        (folder) => folder.uri.fsPath === tempDir,
      );

      if (removeIndex >= 0) {
        vscode.workspace.updateWorkspaceFolders(removeIndex, 1);
        await wait(100);
      }

      await rm(tempDir, { recursive: true, force: true });
    },
  };
};

const testCommandRegistration = async (vscode) => {
  const availableCommands = await vscode.commands.getCommands(true);

  for (const commandId of COMMAND_IDS) {
    assert.ok(
      availableCommands.includes(commandId),
      `Command ${commandId} should be registered`,
    );
  }
};

const testStartupTimeoutRecovery = async (vscode) => {
  const { createBirdClientLifecycle } =
    await import("../../dist/client/lifecycle.js");
  const { defaultExtensionConfiguration } = await import("../../dist/types.js");
  const output = vscode.window.createOutputChannel("BIRD2 lifecycle E2E");
  const lifecycle = createBirdClientLifecycle(output, {
    extensionPath: path.resolve(__dirname, "../.."),
  });
  try {
    await assert.rejects(
      lifecycle.start({
        ...defaultExtensionConfiguration,
        serverPath: [process.execPath, "-e", "process.stdin.resume()"],
        lspStartupTimeoutMs: 1_000,
      }),
      /startup timed out/,
    );
    assert.equal(lifecycle.state, "error");
    await lifecycle.restart(defaultExtensionConfiguration);
    assert.equal(
      lifecycle.state,
      "running",
      "Restart should recover after initialize never responds",
    );
  } finally {
    await lifecycle.dispose();
  }
};

const testConnectionStateRecovery = async (vscode) => {
  const { createBirdClientLifecycle } =
    await import("../../dist/client/lifecycle.js");
  const { defaultExtensionConfiguration } = await import("../../dist/types.js");
  const fixtureRequire = createRequire(
    path.resolve(__dirname, "../../node_modules/@birdcc/lsp/package.json"),
  );
  const serverLibrary = fixtureRequire.resolve("vscode-languageserver/node.js");
  const recordDir = await mkdtemp(
    path.join(os.tmpdir(), "bird2-lsp-restarts-"),
  );
  const recordPath = path.join(recordDir, "starts.json");
  await writeFile(recordPath, "[]");
  const startedProcesses = () => JSON.parse(readFileSync(recordPath, "utf8"));
  const script = [
    "const fs = require('node:fs');",
    `const record = ${JSON.stringify(recordPath)};`,
    "const starts = JSON.parse(fs.readFileSync(record, 'utf8'));",
    "starts.push(process.pid); fs.writeFileSync(record, JSON.stringify(starts));",
    `const {createConnection} = require(${JSON.stringify(serverLibrary)});`,
    "const connection = createConnection(process.stdin, process.stdout);",
    "connection.onInitialize(() => ({capabilities: {textDocumentSync: 1}}));",
    "connection.onInitialized(() => setTimeout(() => process.exit(1), 60));",
    "connection.listen();",
  ].join("\n");
  const serverPath = path.join(recordDir, "server.cjs");
  await writeFile(serverPath, script);
  const states = [];
  const lifecycle = createBirdClientLifecycle(
    vscode.window.createOutputChannel("BIRD2 connection E2E"),
    {
      onStateChange: (state) => states.push(state),
    },
  );
  try {
    await lifecycle.start({
      ...defaultExtensionConfiguration,
      serverPath: [process.execPath, serverPath],
    });
    assert.equal(lifecycle.state, "running");
    await waitForValue(
      () => startedProcesses().length,
      5,
      "SDK must exhaust its four automatic restarts",
      100,
      100,
    );
    const isLastProcessAlive = () => {
      try {
        process.kill(startedProcesses().at(-1), 0);
        return true;
      } catch (error) {
        if (error.code === "ESRCH") return false;
        throw error;
      }
    };
    await waitForValue(
      isLastProcessAlive,
      false,
      "The final server process must exit",
      100,
      100,
    );
    await waitForValue(
      () => lifecycle.state,
      "error",
      "Repeated server exits must update the lifecycle state",
      100,
      100,
    );
    assert.ok(states.includes("starting"));
    assert.ok(states.includes("running"));
    assert.ok(states.includes("error"));
    await wait(500);
    assert.equal(
      startedProcesses().length,
      5,
      "SDK must not launch another process after its final stop",
    );
    assert.equal(
      lifecycle.state,
      "error",
      "The final stopped state must remain visible",
    );
  } finally {
    await lifecycle.dispose();
    await rm(recordDir, { recursive: true, force: true });
  }
};

const testLanguageAndFormatting = async (vscode) => {
  const sample = [
    "router id 192.0.2.1;",
    "protocol bgp edge {",
    "local as 65001;",
    "neighbor 192.0.2.2 as 65002;",
    "}",
    "",
  ].join("\n");

  const { document, cleanup } = await openTempBirdDocument(
    vscode,
    sample,
    "bird.conf",
  );
  const config = vscode.workspace.getConfiguration("bird2-lsp");
  const target = resolveConfigurationTarget(vscode);
  const originalFormatterEngine = config.get("formatter.engine");

  try {
    await config.update("formatter.engine", "builtin", target);
    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await wait(200);

    assert.equal(
      document.languageId,
      "bird2",
      "document language should be bird2",
    );

    const edits = await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      {
        insertSpaces: true,
        tabSize: 2,
      },
    );
    assert.ok(
      Array.isArray(edits),
      "format provider should return an edit list",
    );
    assert.ok(
      edits.length > 0,
      "format provider should return at least one edit",
    );

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await vscode.workspace.applyEdit(workspaceEdit);
    await wait(200);

    const formatted = document.getText();
    const protocolStartIndex = formatted.indexOf("protocol bgp edge {");
    const localAsIndex = formatted.indexOf("local as 65001;");
    const neighborIndex = formatted.indexOf("neighbor 192.0.2.2 as 65002;");

    assert.notEqual(
      formatted.trim(),
      sample.trim(),
      "format command should mutate unformatted input",
    );
    assert.ok(
      protocolStartIndex >= 0,
      "formatter output should include protocol block",
    );
    assert.ok(
      localAsIndex > protocolStartIndex,
      "formatter output should keep local as inside protocol block",
    );
    assert.ok(
      neighborIndex > localAsIndex,
      "formatter output should keep neighbor after local as",
    );
  } finally {
    await config.update("formatter.engine", originalFormatterEngine, target);
    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await cleanup();
  }
};

const testForeignConfigurationGuard = async (vscode) => {
  for (const [fileName, content] of [
    ["nginx.conf", "events {}\nhttp { server { listen 80; } }\n"],
    [
      "apache.conf",
      "<VirtualHost *:80>\nServerName example.test\n</VirtualHost>\n",
    ],
  ]) {
    const { document, cleanup } = await openTempBirdDocument(
      vscode,
      content,
      fileName,
    );
    try {
      assert.equal(
        document.languageId,
        "bird2",
        `${fileName} should keep the existing .conf language association`,
      );
      const edits = await vscode.commands.executeCommand(
        "vscode.executeFormatDocumentProvider",
        document.uri,
        { insertSpaces: true, tabSize: 2 },
      );
      assert.ok(
        edits === undefined || Array.isArray(edits),
        "format provider should return no result or an edit list",
      );
      assert.equal(
        edits?.length ?? 0,
        0,
        `${fileName} must not be formatted as BIRD`,
      );

      await wait(500);
      assert.equal(
        vscode.languages.getDiagnostics(document.uri).length,
        0,
        `${fileName} must not receive BIRD diagnostics`,
      );
    } finally {
      await cleanup();
    }
  }
};

const testResourceFormatting = async (vscode) => {
  const roots = vscode.workspace.workspaceFolders;
  assert.ok(roots?.length >= 2, "resource tests require two workspace folders");
  const { createConfigurationManager } =
    await import("../../dist/config/configuration.js");
  const { createBirdFormattingProvider } =
    await import("../../dist/formatter/provider.js");
  const { createBirdDocumentEligibilityGate } =
    await import("../../dist/eligibility/gate.js");
  const configs = roots
    .slice(0, 2)
    .map((folder) =>
      vscode.workspace.getConfiguration("bird2-lsp", folder.uri),
    );
  const target = vscode.ConfigurationTarget.WorkspaceFolder;
  const manager = createConfigurationManager();
  const gate = createBirdDocumentEligibilityGate();
  const output = vscode.window.createOutputChannel("BIRD2 resource E2E");
  let eligibilityCalls = 0;
  const provider = createBirdFormattingProvider(
    (document) => manager.getForResource(document.uri),
    output,
    async (document) => {
      eligibilityCalls += 1;
      return gate.isEligible(document);
    },
  );
  const firstPath = path.join(roots[0].uri.fsPath, "bird.conf");
  const secondPath = path.join(roots[1].uri.fsPath, "bird.conf");
  const sample = "protocol device {\nscan time 10;\n}\n";
  const padding = "# padding\n".repeat(7_000);
  const cancellation = new vscode.CancellationTokenSource();
  try {
    for (const config of configs)
      await config.update("formatter.engine", "builtin", target);
    await configs[0].update("enabled", false, target);
    await configs[0].update("validation.enabled", false, target);
    await configs[1].update("enabled", true, target);
    await configs[0].update("performance.maxFileSizeBytes", 65_536, target);
    await configs[1].update("performance.maxFileSizeBytes", 1_048_576, target);
    await writeFile(firstPath, sample);
    await writeFile(secondPath, padding + sample);
    const first = await vscode.workspace.openTextDocument(
      vscode.Uri.file(firstPath),
    );
    const second = await vscode.workspace.openTextDocument(
      vscode.Uri.file(secondPath),
    );
    assert.equal(manager.getForResource(first.uri).enabled, false);
    assert.equal(manager.getForResource(second.uri).enabled, true);
    const dirtyEdit = new vscode.WorkspaceEdit();
    dirtyEdit.insert(first.uri, new vscode.Position(0, 0), padding);
    await vscode.workspace.applyEdit(dirtyEdit);
    assert.equal(first.isDirty, true);
    const options = { insertSpaces: true, tabSize: 4 };
    assert.deepEqual(
      await provider.provideDocumentFormattingEdits(
        first,
        options,
        cancellation.token,
      ),
      [],
    );
    assert.equal(
      eligibilityCalls,
      0,
      "size guard must precede eligibility parsing",
    );
    const edits = await provider.provideDocumentFormattingEdits(
      second,
      options,
      cancellation.token,
    );
    assert.ok(edits.length > 0);
    assert.ok(
      edits.every((edit) => edit.range.start.line >= 7_000),
      "unchanged comments must be outside formatting edits",
    );
    const apply = async (changes) => {
      const edit = new vscode.WorkspaceEdit();
      edit.set(second.uri, changes);
      assert.equal(await vscode.workspace.applyEdit(edit), true);
    };
    await apply(edits);
    assert.ok(second.getText().includes("\n    scan time 10;\n"));
    await apply(
      await provider.provideDocumentFormattingEdits(
        second,
        { insertSpaces: false, tabSize: 4 },
        cancellation.token,
      ),
    );
    assert.ok(second.getText().includes("\n\tscan time 10;\n"));
    await writeFile(
      path.join(roots[1].uri.fsPath, "bird.config.json"),
      JSON.stringify({
        formatter: { engine: "builtin", indentSize: 6, useTabs: false },
      }),
    );
    await apply(
      await provider.provideDocumentFormattingEdits(
        second,
        { insertSpaces: false, tabSize: 2 },
        cancellation.token,
      ),
    );
    assert.ok(
      second.getText().includes("\n      scan time 10;\n"),
      "project indentation must override editor formatting options",
    );
    cancellation.cancel();
    assert.deepEqual(
      await provider.provideDocumentFormattingEdits(
        second,
        options,
        cancellation.token,
      ),
      [],
    );
  } finally {
    cancellation.dispose();
    manager.dispose();
    gate.dispose();
    output.dispose();
    await rm(path.join(roots[1].uri.fsPath, "bird.config.json"), {
      force: true,
    });
    for (const config of configs) {
      for (const key of [
        "formatter.engine",
        "enabled",
        "validation.enabled",
        "performance.maxFileSizeBytes",
      ])
        await config.update(key, undefined, target);
    }
  }
};

const testConfigurationCommands = async (vscode) => {
  const workspaceFolder = await ensureWorkspaceFolder(vscode);
  const resource = vscode.window.activeTextEditor?.document.uri;
  const config = vscode.workspace.getConfiguration("bird2-lsp", resource);
  const target =
    resource && vscode.workspace.getWorkspaceFolder(resource)
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : resolveConfigurationTarget(vscode);
  const readEnabled = () =>
    vscode.workspace.getConfiguration("bird2-lsp", resource).get("enabled");
  const originalEnabled = readEnabled();

  try {
    await vscode.commands.executeCommand("bird2-lsp.disableLanguageServer");
    await waitForValue(
      readEnabled,
      false,
      "disable command should set enabled=false",
    );

    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await wait(200);

    await vscode.commands.executeCommand("bird2-lsp.enableLanguageServer");
    await waitForValue(
      readEnabled,
      true,
      "enable command should set enabled=true",
    );
  } finally {
    await config.update("enabled", originalEnabled, target);
    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await workspaceFolder.cleanup();
  }
};

const testResourceValidationHandoff = async (vscode) => {
  const roots = vscode.workspace.workspaceFolders;
  assert.ok(roots?.length >= 2);
  const configurationEvents = [];
  const configurationSubscription = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      configurationEvents.push({
        global: event.affectsConfiguration("bird2-lsp"),
        folders: roots
          .slice(0, 2)
          .map((folder) => event.affectsConfiguration("bird2-lsp", folder.uri)),
        enabled: roots
          .slice(0, 2)
          .map((folder) =>
            vscode.workspace
              .getConfiguration("bird2-lsp", folder.uri)
              .get("enabled"),
          ),
      });
      if (configurationEvents.length > 20) configurationEvents.shift();
    },
  );
  const configs = roots
    .slice(0, 2)
    .map((folder) =>
      vscode.workspace.getConfiguration("bird2-lsp", folder.uri),
    );
  const target = vscode.ConfigurationTarget.WorkspaceFolder;
  const firstPath = path.join(roots[0].uri.fsPath, "bird2.conf");
  const secondPath = path.join(roots[1].uri.fsPath, "bird3.conf");
  const firstText =
    "router id 192.0.2.1;\nprotocol device first_device { scan time 10; }\ninvalid token;\nprotocol bgp missing_neighbor { local as 65001; }\n";
  const secondText =
    "router id 192.0.2.2;\nprotocol device second_device { scan time 10; }\n";
  const symbols = (document) =>
    vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri,
    );
  const waitForSymbols = async (document, expected) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (((await symbols(document))?.length ?? 0) > 0 === expected) return;
      await wait(50);
    }
    assert.equal(
      ((await symbols(document))?.length ?? 0) > 0,
      expected,
      `LSP symbols must follow the resource enabled setting: ${JSON.stringify(configurationEvents)}`,
    );
  };
  const nativeError = (document) =>
    vscode.languages
      .getDiagnostics(document.uri)
      .some(
        (diagnostic) =>
          diagnostic.source === "bird -p" &&
          /syntax error/i.test(diagnostic.message),
      );
  try {
    for (const config of configs) {
      await config.update("validation.enabled", true, target);
      await config.update("validation.onSave", true, target);
    }
    await configs[0].update("enabled", false, target);
    await configs[1].update("enabled", true, target);
    await writeFile(firstPath, firstText);
    await writeFile(secondPath, secondText);
    const first = await vscode.workspace.openTextDocument(
      vscode.Uri.file(firstPath),
    );
    const second = await vscode.workspace.openTextDocument(
      vscode.Uri.file(secondPath),
    );
    await vscode.window.showTextDocument(first);
    await waitForSymbols(second, true);
    await waitForSymbols(first, false);
    await waitForValue(
      () => nativeError(first),
      true,
      "Disabled resource must receive a real bird -p syntax error",
      200,
      50,
    );
    await vscode.window.showTextDocument(second);
    await configs[0].update("enabled", true, target);
    await configs[1].update("enabled", false, target);
    await waitForValue(
      () =>
        vscode.languages
          .getDiagnostics(first.uri)
          .some((diagnostic) => diagnostic.source === "bird -p"),
      false,
      "Native fallback diagnostics must clear after LSP enablement",
      200,
      50,
    );
    for (const [document, enabled] of [
      [first, true],
      [second, false],
    ]) {
      await waitForValue(
        () =>
          vscode.workspace
            .getConfiguration("bird2-lsp", document.uri)
            .get("enabled"),
        enabled,
        "Resource settings must update before requesting the new document version",
      );
    }
    const previousDocuments = [first, second].map((document) => ({
      document,
      version: document.version,
      text: document.getText(),
    }));
    const comment = "# resource settings refreshed\n";
    const versionEdit = new vscode.WorkspaceEdit();
    for (const { document, text } of previousDocuments) {
      versionEdit.insert(
        document.uri,
        document.positionAt(text.length),
        comment,
      );
    }
    assert.equal(await vscode.workspace.applyEdit(versionEdit), true);
    for (const { document, version, text } of previousDocuments) {
      assert.ok(
        document.version > version,
        "A real text edit must advance the document version before refreshing symbols",
      );
      assert.equal(document.getText(), text + comment);
      assert.equal(document.isDirty, true);
    }
    await waitForSymbols(first, true);
    await waitForSymbols(second, false);
    await waitForValue(
      () =>
        vscode.languages
          .getDiagnostics(first.uri)
          .some(
            (diagnostic) =>
              diagnostic.source !== "bird -p" &&
              diagnostic.code === "bgp/missing-neighbor",
          ),
      true,
      "Enabled resource must receive bgp/missing-neighbor from LSP",
      200,
      50,
    );
    await vscode.window.showTextDocument(second);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      second.uri,
      second.positionAt(second.getText().length),
      "invalid token;\n",
    );
    await vscode.workspace.applyEdit(edit);
    assert.equal(await second.save(), true);
    await waitForValue(
      () => nativeError(second),
      true,
      "Native validation must take over the newly disabled resource",
      200,
      50,
    );
    assert.equal(
      vscode.languages
        .getDiagnostics(second.uri)
        .some((diagnostic) => diagnostic.source !== "bird -p"),
      false,
      "Disabled resource must not retain LSP diagnostics",
    );
    await vscode.commands.executeCommand("bird2-lsp.validateActiveDocument");
    await vscode.window.showTextDocument(first);
    const firstEdit = new vscode.WorkspaceEdit();
    firstEdit.insert(
      first.uri,
      first.positionAt(first.getText().length),
      "# saved in the LSP-enabled root\n",
    );
    assert.equal(await vscode.workspace.applyEdit(firstEdit), true);
    assert.equal(await first.save(), true);
    await wait(1_200);
    assert.equal(
      nativeError(first),
      false,
      "Manual validation in a disabled root must keep other roots on LSP validation",
    );
  } finally {
    configurationSubscription.dispose();
    for (const config of configs) {
      for (const key of ["enabled", "validation.enabled", "validation.onSave"])
        await config.update(key, undefined, target);
    }
  }
};

async function run() {
  const vscode = require("vscode");

  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);

  await extension.activate();
  assert.equal(extension.isActive, true, "Extension should be active");

  await testCommandRegistration(vscode);
  await testStartupTimeoutRecovery(vscode);
  await testConnectionStateRecovery(vscode);
  await testLanguageAndFormatting(vscode);
  await testResourceFormatting(vscode);
  await testForeignConfigurationGuard(vscode);
  await testResourceValidationHandoff(vscode);
  await testConfigurationCommands(vscode);
}

module.exports = {
  run,
};
