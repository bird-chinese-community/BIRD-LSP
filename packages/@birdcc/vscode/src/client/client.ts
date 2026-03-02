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
import type { ExtensionConfiguration } from "../types.js";

const toServerCommand = (serverPath: ExtensionConfiguration["serverPath"]) => {
  if (Array.isArray(serverPath)) {
    const [command, ...args] = serverPath;
    return { command, args };
  }

  return { command: serverPath, args: [] as string[] };
};

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
  const serverCommand = toServerCommand(configuration.serverPath);
  const serverOptions: ServerOptions = {
    command: serverCommand.command,
    args: serverCommand.args,
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
