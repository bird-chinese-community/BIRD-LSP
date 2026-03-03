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
    "protocol bgp edge { local as 65001; neighbor 192.0.2.2 as 65002; }",
    "",
  ].join("\n");

  const { document, cleanup } = await openTempBirdDocument(vscode, sample);

  try {
    assert.equal(
      document.languageId,
      "bird2",
      "document language should be bird2",
    );

    await vscode.commands.executeCommand("bird2-lsp.formatActiveDocument");
    await wait(400);

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
    await cleanup();
  }
};

const testConfigurationCommands = async (vscode) => {
  const config = vscode.workspace.getConfiguration("bird2-lsp");
  const target = resolveConfigurationTarget(vscode);
  const originalEnabled = config.get("enabled");

  try {
    await vscode.commands.executeCommand("bird2-lsp.disableLanguageServer");
    await wait(200);
    assert.equal(
      config.get("enabled"),
      false,
      "disable command should set enabled=false",
    );

    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
    await wait(200);

    await vscode.commands.executeCommand("bird2-lsp.enableLanguageServer");
    await wait(200);
    assert.equal(
      config.get("enabled"),
      true,
      "enable command should set enabled=true",
    );
  } finally {
    await config.update("enabled", originalEnabled, target);
    await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
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
