import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { OutputChannel } from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  Trace,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node.js";

import {
  BIRD_DOCUMENT_SELECTOR,
  CONFIG_SECTION,
  DEFAULT_SERVER_PATH,
  EXTENSION_ID,
  EXTENSION_NAME,
} from "../constants.js";
import {
  resolveServerCommand,
  type ResolvedCommand,
} from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";

const toTraceLevel = (traceServer: ExtensionConfiguration["traceServer"]) => {
  switch (traceServer) {
    case "messages":
      return Trace.Messages;
    case "verbose":
      return Trace.Verbose;
    default:
      return Trace.Off;
  }
};

const isDefaultServerPath = (
  serverPath: ExtensionConfiguration["serverPath"],
): boolean =>
  Array.isArray(serverPath) &&
  serverPath.length === DEFAULT_SERVER_PATH.length &&
  serverPath.every((token, index) => token === DEFAULT_SERVER_PATH[index]);

const resolveBundledServerEntry = (
  extensionPath?: string,
): string | undefined => {
  if (!extensionPath) {
    return undefined;
  }

  const entryPath = resolve(
    extensionPath,
    "node_modules",
    "@birdcc",
    "lsp",
    "dist",
    "server.js",
  );
  return existsSync(entryPath) ? entryPath : undefined;
};

const resolveLanguageServerCommand = (
  configuration: ExtensionConfiguration,
  outputChannel: OutputChannel,
  extensionPath?: string,
): ResolvedCommand => {
  if (isDefaultServerPath(configuration.serverPath)) {
    const bundledServerEntry = resolveBundledServerEntry(extensionPath);
    if (bundledServerEntry) {
      outputChannel.appendLine(
        `[bird2-lsp] using bundled language server: ${bundledServerEntry}`,
      );
      return {
        command: process.execPath,
        args: [bundledServerEntry],
      };
    }

    outputChannel.appendLine(
      "[bird2-lsp] bundled language server not found, falling back to configured serverPath",
    );
  }

  const serverCommand = resolveServerCommand(configuration.serverPath);
  if (!serverCommand.ok) {
    throw new Error(`invalid bird2-lsp.serverPath: ${serverCommand.reason}`);
  }

  return serverCommand.value;
};

export const createLanguageClient = (
  configuration: ExtensionConfiguration,
  outputChannel: OutputChannel,
  extensionPath?: string,
): LanguageClient => {
  const serverCommand = resolveLanguageServerCommand(
    configuration,
    outputChannel,
    extensionPath,
  );

  const serverOptions: ServerOptions = {
    command: serverCommand.command,
    args: [...serverCommand.args],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [...BIRD_DOCUMENT_SELECTOR],
    outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    synchronize: {
      configurationSection: [CONFIG_SECTION],
    },
  };

  const client = new LanguageClient(
    EXTENSION_ID,
    EXTENSION_NAME,
    serverOptions,
    clientOptions,
  );

  client.setTrace(toTraceLevel(configuration.traceServer));

  return client;
};
