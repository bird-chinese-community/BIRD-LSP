import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { workspace, type OutputChannel } from "vscode";
import {
  LanguageClient,
  CloseAction,
  RevealOutputChannelOn,
  Trace,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node.js";

import {
  BIRD_DOCUMENT_SELECTOR,
  CONFIG_SECTION,
  DEFAULT_SERVER_PATH,
  EXTENSION_NAME,
} from "../constants.js";
import {
  resolveServerCommand,
  toSanitizedErrorDetails,
  type ResolvedCommand,
} from "../security/index.js";
import type { ExtensionConfiguration } from "../types.js";
import { createServerProcess } from "./server-process.js";
import { configureRequestErrorReporting } from "./errors.js";

export type BirdLanguageClient = LanguageClient & {
  terminate: () => Promise<void>;
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

export const resolveLanguageServerCommand = (
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
        args: [bundledServerEntry, "--stdio"],
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
  getConfigurationForResource: (uri?: string) => ExtensionConfiguration = () =>
    configuration,
): BirdLanguageClient => {
  const serverCommand = resolveLanguageServerCommand(
    configuration,
    outputChannel,
    extensionPath,
  );

  const serverProcess = createServerProcess(
    serverCommand.command,
    serverCommand.args,
  );
  const serverOptions: ServerOptions = serverProcess.start;

  const clientOptions: LanguageClientOptions = {
    documentSelector: [...BIRD_DOCUMENT_SELECTOR],
    outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationOptions: {
      birdcc: {
        enabled: configuration.enabled,
        performance: {
          maxFileSizeBytes: configuration.performanceMaxFileSizeBytes,
        },
        typeHints: {
          enabled: configuration.typeHintsEnabled,
          inlay: { enabled: configuration.typeHintsInlayEnabled },
        },
        intel: {
          enabled: configuration.intelEnabled,
          inlayHints: configuration.intelInlayHints,
          completion: configuration.intelCompletion,
          hover: configuration.intelHover,
          dn42: { enabled: configuration.intelDn42Enabled },
        },
        formatter: {
          engine: configuration.formatterEngine,
          safeMode: configuration.formatterSafeMode,
        },
      },
    },
    synchronize: {
      configurationSection: [CONFIG_SECTION],
    },
    middleware: {
      workspace: {
        configuration: async (params, token, next) => {
          const values = await next(params, token);
          if (!Array.isArray(values)) return values;
          return params.items.map((item, index) =>
            item.section === "bird2-lsp.intel.dn42.enabled"
              ? workspace
                  .getConfiguration(CONFIG_SECTION)
                  .inspect<boolean>("intel.dn42.enabled")?.globalValue === true
              : values[index],
          );
        },
      },
    },
  };

  const client = new LanguageClient(
    CONFIG_SECTION,
    EXTENSION_NAME,
    serverOptions,
    clientOptions,
  );

  client.setTrace(toTraceLevel(configuration.traceServer));
  configureRequestErrorReporting(
    client,
    (uri) => getConfigurationForResource(uri).hiddenErrors,
  );

  let terminating = false;
  const errorHandler = client.createDefaultErrorHandler();
  client.clientOptions.errorHandler = {
    error: (...args) => errorHandler.error(...args),
    closed: () =>
      terminating
        ? { action: CloseAction.DoNotRestart, handled: true }
        : errorHandler.closed(),
  };
  const terminate = async (): Promise<void> => {
    terminating = true;
    await serverProcess.terminate();
    try {
      await client.dispose();
    } catch (error) {
      outputChannel.appendLine(
        `[bird2-lsp] client disposal after termination: ${toSanitizedErrorDetails(error)}`,
      );
    }
  };
  return Object.assign(client, { terminate });
};
