import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sniffProjectEntrypoints } from "@birdcc/core";

const CONFIG_FILE_NAMES = ["bird.config.json", "birdcc.config.json"] as const;
const DEFAULT_WORKSPACE_ENTRY_FILE = "bird.conf";

interface LspProjectConfig {
  main?: string;
  workspaces?: string[];
  includePaths?: string[];
  crossFile?: {
    enabled?: boolean;
    maxDepth?: number;
    maxFiles?: number;
    externalIncludes?: boolean;
  };
}

export interface ProjectAnalysisDefaults {
  maxDepth: number;
  maxFiles: number;
}

export interface ProjectAnalysisOptions {
  entryUri: string;
  workspaceRootUri?: string;
  includeSearchPathUris: string[];
  maxDepth: number;
  maxFiles: number;
  allowIncludeOutsideWorkspace: boolean;
  crossFileEnabled: boolean;
  mode: "document" | "main" | "workspace";
  configPath?: string;
}

export interface ResolveProjectAnalysisOptionsInput {
  documentUri: string;
  workspaceRootUris: readonly string[];
  defaults: ProjectAnalysisDefaults;
}

const isFileUri = (uri: string): boolean => uri.startsWith("file://");

const toFilePath = (uri: string): string | null => {
  if (!isFileUri(uri)) {
    return null;
  }

  return fileURLToPath(uri);
};

const toFileUri = (path: string): string => pathToFileURL(path).toString();

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
};

const findNearestConfigPath = async (
  documentPath: string,
): Promise<string | undefined> => {
  let current = resolve(dirname(documentPath));

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const candidate = join(current, fileName);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const parseProjectConfig = async (
  configPath: string,
): Promise<LspProjectConfig | undefined> => {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const data = parsed as Record<string, unknown>;
    const config: LspProjectConfig = {};

    if (typeof data.main === "string" && data.main.trim().length > 0) {
      config.main = data.main;
    }
    if (Array.isArray(data.workspaces)) {
      config.workspaces = data.workspaces.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      );
    }
    if (Array.isArray(data.includePaths)) {
      config.includePaths = data.includePaths.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      );
    }
    if (data.crossFile && typeof data.crossFile === "object") {
      const crossFileRaw = data.crossFile as Record<string, unknown>;
      config.crossFile = {
        enabled:
          typeof crossFileRaw.enabled === "boolean"
            ? crossFileRaw.enabled
            : undefined,
        maxDepth:
          typeof crossFileRaw.maxDepth === "number"
            ? crossFileRaw.maxDepth
            : undefined,
        maxFiles:
          typeof crossFileRaw.maxFiles === "number"
            ? crossFileRaw.maxFiles
            : undefined,
        externalIncludes:
          typeof crossFileRaw.externalIncludes === "boolean"
            ? crossFileRaw.externalIncludes
            : undefined,
      };
    }

    return config;
  } catch {
    return undefined;
  }
};

const clampPositiveInteger = (
  value: number | undefined,
): number | undefined => {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return undefined;
  }

  return value;
};

const normalizePosixPath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");

const globToRegExp = (glob: string): RegExp => {
  const normalized = normalizePosixPath(glob);
  if (normalized.length === 0) {
    return /^$/;
  }

  let output = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === "*" && nextChar === "*") {
      output += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      output += "[^/]*";
      continue;
    }
    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  return new RegExp(`^${output}$`);
};

const matchesWorkspacePatterns = (
  relativeDir: string,
  patterns: readonly string[],
): boolean => {
  const candidate = normalizePosixPath(relativeDir);
  let included = false;

  for (const rawPattern of patterns) {
    const trimmed = rawPattern.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const isNegated = trimmed.startsWith("!");
    const pattern = isNegated ? trimmed.slice(1) : trimmed;
    if (pattern.length === 0) {
      continue;
    }

    if (!globToRegExp(pattern).test(candidate)) {
      continue;
    }

    included = !isNegated;
  }

  return included;
};

const resolveWorkspaceDirFromPatterns = (
  configDir: string,
  documentDir: string,
  patterns: readonly string[],
): string | undefined => {
  const relativeDir = normalizePosixPath(relative(configDir, documentDir));
  if (
    relativeDir.length === 0 ||
    relativeDir === "." ||
    relativeDir.startsWith("..")
  ) {
    return undefined;
  }

  const segments = relativeDir.split("/").filter(Boolean);
  let matched: string | undefined;
  for (let index = 1; index <= segments.length; index += 1) {
    const candidate = segments.slice(0, index).join("/");
    if (matchesWorkspacePatterns(candidate, patterns)) {
      matched = candidate;
    }
  }

  return matched ? resolve(configDir, matched) : undefined;
};

const resolveContainingWorkspaceRootUri = (
  documentPath: string,
  workspaceRootUris: readonly string[],
): string | undefined => {
  const roots = workspaceRootUris
    .map((uri) => toFilePath(uri))
    .filter((path): path is string => path !== null)
    .map((path) => resolve(path));

  let selectedRoot: string | undefined;
  for (const root of roots) {
    const relPath = relative(root, documentPath);
    const withinRoot =
      relPath.length === 0 ||
      (!relPath.startsWith("..") && !isAbsolute(relPath));
    if (!withinRoot) {
      continue;
    }

    if (!selectedRoot || root.length > selectedRoot.length) {
      selectedRoot = root;
    }
  }

  return selectedRoot ? toFileUri(selectedRoot) : undefined;
};

const dedupeUris = (uris: readonly string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const uri of uris) {
    if (seen.has(uri)) {
      continue;
    }
    seen.add(uri);
    output.push(uri);
  }

  return output;
};

export const resolveProjectAnalysisOptions = async (
  input: ResolveProjectAnalysisOptionsInput,
): Promise<ProjectAnalysisOptions> => {
  const documentPath = toFilePath(input.documentUri);
  if (!documentPath) {
    return {
      entryUri: input.documentUri,
      workspaceRootUri: undefined,
      includeSearchPathUris: [],
      maxDepth: input.defaults.maxDepth,
      maxFiles: input.defaults.maxFiles,
      allowIncludeOutsideWorkspace: false,
      crossFileEnabled: true,
      mode: "document",
    };
  }

  const documentPathResolved = resolve(documentPath);
  const nearestConfigPath = await findNearestConfigPath(documentPathResolved);
  if (!nearestConfigPath) {
    const workspaceRootUri = resolveContainingWorkspaceRootUri(
      documentPathResolved,
      input.workspaceRootUris,
    );
    const workspaceRootPath =
      workspaceRootUri && isFileUri(workspaceRootUri)
        ? toFilePath(workspaceRootUri)
        : null;

    if (workspaceRootPath) {
      const resolvedWorkspaceRootUri = toFileUri(workspaceRootPath);
      const detection = await sniffProjectEntrypoints(workspaceRootPath, {
        maxDepth: 8,
        maxFiles: 20_000,
      });
      if (detection.primary) {
        const entryPath = resolve(workspaceRootPath, detection.primary.path);
        return {
          entryUri: toFileUri(entryPath),
          workspaceRootUri: resolvedWorkspaceRootUri,
          includeSearchPathUris: dedupeUris([
            resolvedWorkspaceRootUri,
            toFileUri(dirname(entryPath)),
          ]),
          maxDepth: input.defaults.maxDepth,
          maxFiles: input.defaults.maxFiles,
          allowIncludeOutsideWorkspace: false,
          crossFileEnabled: true,
          mode: entryPath === documentPathResolved ? "document" : "workspace",
        };
      }
    }

    return {
      entryUri: input.documentUri,
      workspaceRootUri,
      includeSearchPathUris: [],
      maxDepth: input.defaults.maxDepth,
      maxFiles: input.defaults.maxFiles,
      allowIncludeOutsideWorkspace: false,
      crossFileEnabled: true,
      mode: "document",
    };
  }

  const config = await parseProjectConfig(nearestConfigPath);
  const configDir = dirname(nearestConfigPath);
  const includePaths = (config?.includePaths ?? []).map((pathValue) =>
    toFileUri(resolve(configDir, pathValue)),
  );
  const crossFileEnabled = config?.crossFile?.enabled !== false;
  const maxDepth =
    clampPositiveInteger(config?.crossFile?.maxDepth) ??
    input.defaults.maxDepth;
  const maxFiles =
    clampPositiveInteger(config?.crossFile?.maxFiles) ??
    input.defaults.maxFiles;
  const allowIncludeOutsideWorkspace =
    config?.crossFile?.externalIncludes ?? false;

  const workspacePatterns = config?.workspaces ?? [];
  if (workspacePatterns.length > 0) {
    const workspaceDir =
      resolveWorkspaceDirFromPatterns(
        configDir,
        dirname(documentPathResolved),
        workspacePatterns,
      ) ?? dirname(documentPathResolved);

    const workspaceEntry = resolve(workspaceDir, DEFAULT_WORKSPACE_ENTRY_FILE);
    const entryUri = (await pathExists(workspaceEntry))
      ? toFileUri(workspaceEntry)
      : input.documentUri;

    return {
      entryUri,
      workspaceRootUri: toFileUri(workspaceDir),
      includeSearchPathUris: dedupeUris([
        toFileUri(configDir),
        ...includePaths,
      ]),
      maxDepth,
      maxFiles,
      allowIncludeOutsideWorkspace,
      crossFileEnabled,
      mode: "workspace",
      configPath: nearestConfigPath,
    };
  }

  const configuredMain = config?.main;
  if (configuredMain) {
    const resolvedMain = isAbsolute(configuredMain)
      ? configuredMain
      : resolve(configDir, configuredMain);
    const entryUri = (await pathExists(resolvedMain))
      ? toFileUri(resolvedMain)
      : input.documentUri;

    return {
      entryUri,
      workspaceRootUri: toFileUri(configDir),
      includeSearchPathUris: dedupeUris([
        toFileUri(configDir),
        ...includePaths,
      ]),
      maxDepth,
      maxFiles,
      allowIncludeOutsideWorkspace,
      crossFileEnabled,
      mode: "main",
      configPath: nearestConfigPath,
    };
  }

  return {
    entryUri: input.documentUri,
    workspaceRootUri: toFileUri(configDir),
    includeSearchPathUris: dedupeUris([toFileUri(configDir), ...includePaths]),
    maxDepth,
    maxFiles,
    allowIncludeOutsideWorkspace,
    crossFileEnabled,
    mode: "document",
    configPath: nearestConfigPath,
  };
};
