const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

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

const openTempBirdDocument = async (vscode, content) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bird2-lsp-e2e-"));
  const filePath = path.join(tempDir, "e2e.bird2.conf");
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

const testLanguageAndFormatting = async (vscode) => {
  const sample = [
    "router id 192.0.2.1;",
    "protocol bgp edge {",
    "local as 65001;",
    "neighbor 192.0.2.2 as 65002;",
    "}",
    "",
  ].join("\n");

  const { document, cleanup } = await openTempBirdDocument(vscode, sample);
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

const testConfigurationCommands = async (vscode) => {
  const workspaceFolder = await ensureWorkspaceFolder(vscode);
  const config = vscode.workspace.getConfiguration("bird2-lsp");
  const scopedConfig = vscode.workspace.getConfiguration(
    "bird2-lsp",
    workspaceFolder.uri,
  );
  const target = resolveConfigurationTarget(vscode);
  const originalEnabled = scopedConfig.get("enabled");

  try {
    await vscode.commands.executeCommand("bird2-lsp.disableLanguageServer");
    await waitForValue(
      () => scopedConfig.get("enabled"),
      false,
      "disable command should set enabled=false",
    );

    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await wait(200);

    await vscode.commands.executeCommand("bird2-lsp.enableLanguageServer");
    await waitForValue(
      () => scopedConfig.get("enabled"),
      true,
      "enable command should set enabled=true",
    );
  } finally {
    await config.update("enabled", originalEnabled, target);
    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await workspaceFolder.cleanup();
  }
};

async function run() {
  const vscode = require("vscode");

  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);

  await extension.activate();
  assert.equal(extension.isActive, true, "Extension should be active");

  await testCommandRegistration(vscode);
  await testLanguageAndFormatting(vscode);
  await testConfigurationCommands(vscode);
}

module.exports = {
  run,
};
