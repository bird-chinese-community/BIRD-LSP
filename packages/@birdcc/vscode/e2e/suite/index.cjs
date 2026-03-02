const assert = require("node:assert/strict");

const EXTENSION_ID = "birdcc.bird2-lsp";

async function run() {
  const vscode = require("vscode");

  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);

  await extension.activate();
  assert.equal(extension.isActive, true, "Extension should be active");

  const document = await vscode.workspace.openTextDocument({
    language: "bird2",
    content: [
      "router id 192.0.2.1;",
      "protocol bgp edge {",
      "  local as 65001;",
      "  neighbor 192.0.2.2 as 65002;",
      "}",
      "",
    ].join("\n"),
  });
  await vscode.window.showTextDocument(document);

  await vscode.commands.executeCommand("bird2-lsp.validateActiveDocument");
  await vscode.commands.executeCommand("bird2-lsp.formatActiveDocument");
  await vscode.commands.executeCommand("bird2-lsp.reloadConfiguration");
}

module.exports = {
  run,
};
