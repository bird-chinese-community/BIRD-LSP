import { basename, resolve } from "node:path";

import type { ExtensionConfiguration } from "../types.js";

export interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export type CommandResolution =
  | { readonly ok: true; readonly value: ResolvedCommand }
  | { readonly ok: false; readonly reason: string };

const shellExecutables = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);

const shellExecutionFlags = new Set([
  "-c",
  "/c",
  "-command",
  "-encodedcommand",
]);
const disallowedShellMetacharacterPattern = /[;&|`$<>]/u;

const commandTokenPattern = /"[^"]*"|'[^']*'|\S+/g;
const validationPlaceholder = "__BIRD2_LSP_FILE_PATH__";

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code === 0 || code === 10 || code === 13;
  });

const tokenizeCommandLine = (commandLine: string): readonly string[] => {
  const tokens = commandLine.match(commandTokenPattern) ?? [];
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, "").trim());
};

const normalizeTokens = (tokens: readonly string[]): readonly string[] =>
  tokens.map((token) => token.trim()).filter((token) => token.length > 0);

const hasDisallowedShellMetacharacter = (value: string): boolean =>
  disallowedShellMetacharacterPattern.test(value);

const isShellWrapper = (command: string, args: readonly string[]): boolean => {
  const executable = basename(command).toLowerCase();
  if (!shellExecutables.has(executable)) {
    return false;
  }

  return args.some((arg) => shellExecutionFlags.has(arg.toLowerCase()));
};

const toCommandResolution = (tokens: readonly string[]): CommandResolution => {
  const normalized = normalizeTokens(tokens);
  if (normalized.length === 0) {
    return {
      ok: false,
      reason: "command is empty",
    };
  }

  if (normalized.some((token) => hasControlCharacter(token))) {
    return {
      ok: false,
      reason: "command contains control characters",
    };
  }

  const [command, ...args] = normalized;
  if (shellExecutables.has(basename(command).toLowerCase())) {
    return {
      ok: false,
      reason:
        "direct shell executable invocation is blocked (for example: bash, sh, cmd, powershell)",
    };
  }

  if (isShellWrapper(command, args)) {
    return {
      ok: false,
      reason:
        "shell-wrapper execution is blocked (for example: bash -c, sh -c, cmd /c, powershell -command)",
    };
  }

  return {
    ok: true,
    value: {
      command,
      args,
    },
  };
};

const parseCommandTokens = (
  command: ExtensionConfiguration["serverPath"],
): CommandResolution => {
  if (Array.isArray(command)) {
    return toCommandResolution(command);
  }

  if (hasDisallowedShellMetacharacter(command)) {
    return {
      ok: false,
      reason:
        "command string contains potentially dangerous shell metacharacters",
    };
  }

  return toCommandResolution(tokenizeCommandLine(command));
};

export const resolveServerCommand = (
  serverPath: ExtensionConfiguration["serverPath"],
): CommandResolution => parseCommandTokens(serverPath);

export const resolveValidationCommandTemplate = (
  commandTemplate: string,
  filePath: string,
): CommandResolution => {
  if (!commandTemplate.includes("{file}")) {
    return {
      ok: false,
      reason: "validation command template must include the {file} placeholder",
    };
  }

  if (hasDisallowedShellMetacharacter(commandTemplate)) {
    return {
      ok: false,
      reason:
        "validation command template contains potentially dangerous shell metacharacters",
    };
  }

  const placeholderRenderedTemplate = commandTemplate.replaceAll(
    "{file}",
    validationPlaceholder,
  );

  const tokens = tokenizeCommandLine(placeholderRenderedTemplate);
  if (!tokens.some((token) => token.includes(validationPlaceholder))) {
    return {
      ok: false,
      reason:
        "validation command template must place {file} in a tokenized argument",
    };
  }

  const normalizedFilePath = resolve(filePath);
  const resolvedTokens = tokens.map((token) =>
    token.replaceAll(validationPlaceholder, normalizedFilePath),
  );

  return toCommandResolution(resolvedTokens);
};
