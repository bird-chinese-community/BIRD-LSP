import { access } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadBirdProjectConfigForFile,
  selectAutoDetectedEntry,
  sniffProjectEntrypoints,
  type BirdProjectConfig,
  resolveAnalysisBudget,
  type DetectionResult,
} from "@birdcc/core";

const DEFAULT_WORKSPACE_ENTRY_FILE = "bird.conf";

export interface ProjectAnalysisDefaults {
  maxDepth: number;
  maxFiles: number;
}

export interface ProjectAnalysisOptions {
  maxDocumentBytes: number;
  maxTotalBytes: number;
  entryUri: string;
  workspaceRootUri?: string;
  includeSearchPathUris: string[];
  maxDepth: number;
  maxFiles: number;
  allowIncludeOutsideWorkspace: boolean;
  crossFileEnabled: boolean;
  mode: "document" | "main" | "workspace";
  configPath?: string;
  config?: BirdProjectConfig;
}

export interface ResolveProjectAnalysisOptionsInput {
  documentUri: string;
  workspaceRootUris: readonly string[];
  defaults: ProjectAnalysisDefaults;
  discoveryCache?: Map<string, Promise<DetectionResult>>;
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
      ...resolveAnalysisBudget(),
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
  const loaded = await loadBirdProjectConfigForFile(documentPathResolved);
  const nearestConfigPath = loaded.path;
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
      let detectionTask = input.discoveryCache?.get(workspaceRootPath);
      if (!detectionTask) {
        const pending = sniffProjectEntrypoints(workspaceRootPath, {
          maxDepth: 8,
          maxFiles: 20_000,
          maxEntries: 20_000,
          maxDirectories: 2_048,
        });
        const tracked: Promise<DetectionResult> = pending.catch(
          (error: unknown) => {
            if (input.discoveryCache?.get(workspaceRootPath) === tracked)
              input.discoveryCache?.delete(workspaceRootPath);
            throw error;
          },
        );
        detectionTask = tracked;
        input.discoveryCache?.set(workspaceRootPath, detectionTask);
      }
      const detection = await detectionTask;
      const selectedEntry = selectAutoDetectedEntry(detection);
      if (selectedEntry) {
        const entryPath = resolve(workspaceRootPath, selectedEntry.path);
        return {
          ...resolveAnalysisBudget(),
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
      ...resolveAnalysisBudget(),
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

  const config = loaded.config;
  const configDir = dirname(nearestConfigPath);
  const includePaths = (config?.includePaths ?? []).map((pathValue) =>
    toFileUri(resolve(configDir, pathValue)),
  );
  const crossFileEnabled = config?.crossFile?.enabled !== false;
  const maxDepth = config.crossFile?.maxDepth ?? input.defaults.maxDepth;
  const maxFiles = config.crossFile?.maxFiles ?? input.defaults.maxFiles;
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
      config,
      ...resolveAnalysisBudget(config.crossFile),
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
      config,
      ...resolveAnalysisBudget(config.crossFile),
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
    config,
    ...resolveAnalysisBudget(config.crossFile),
  };
};

export const createProjectAnalysisResolver = () => {
  const discoveryCache = new Map<string, Promise<DetectionResult>>();
  return {
    resolve: (
      input: ResolveProjectAnalysisOptionsInput,
    ): Promise<ProjectAnalysisOptions> =>
      resolveProjectAnalysisOptions({ ...input, discoveryCache }),
    invalidate: (changedUri?: string): void => {
      if (!changedUri) {
        discoveryCache.clear();
        return;
      }
      const changedPath = toFilePath(changedUri);
      if (!changedPath) return;
      for (const root of discoveryCache.keys()) {
        const path = relative(root, changedPath);
        if (
          path === "" ||
          (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
        )
          discoveryCache.delete(root);
      }
    },
  };
};
