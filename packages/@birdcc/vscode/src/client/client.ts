import type { OutputChannel } from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  Trace,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node.js";

import {
  CONFIG_SECTION,
  EXTENSION_ID,
  EXTENSION_NAME,
  LANGUAGE_ID,
} from "../constants.js";
import { resolveServerCommand } from "../security/index.js";
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

export const createLanguageClient = (
  configuration: ExtensionConfiguration,
  outputChannel: OutputChannel,
): LanguageClient => {
  const serverCommand = resolveServerCommand(configuration.serverPath);
  if (!serverCommand.ok) {
    throw new Error(`invalid bird2-lsp.serverPath: ${serverCommand.reason}`);
  }

  const serverOptions: ServerOptions = {
    command: serverCommand.value.command,
    args: [...serverCommand.value.args],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: LANGUAGE_ID, scheme: "file" }],
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
