import { readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export const allowedConfigExtensions = new Set([
  ".conf",
  ".bird",
  ".bird2",
  ".bird3",
  ".bird2.conf",
  ".bird3.conf",
]);

export const allowedConfigBasenames = new Set([
  "bird.conf",
  "bird2.conf",
  "bird3.conf",
]);

export const isBirdConfigFile = (path) => {
  const extension = extname(path);
  if (allowedConfigExtensions.has(extension)) {
    return true;
  }

  return allowedConfigBasenames.has(basename(path));
};

export const discoverFiles = async (root) => {
  const resolvedRoot = await realpath(resolve(root));
  const output = [];
  const stack = [resolvedRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);

      if (entry.isSymbolicLink()) {
        let target;
        try {
          target = await realpath(entryPath);
        } catch {
          continue;
        }
        if (!target.startsWith(resolvedRoot + "/") && target !== resolvedRoot) {
          continue;
        }
      }

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        output.push(entryPath);
      }
    }
  }

  return output;
};

export const collectBirdConfigCandidates = async ({ root, maxBytes }) => {
  const allFiles = await discoverFiles(root);
  const candidates = [];

  for (const path of allFiles) {
    if (!isBirdConfigFile(path)) {
      continue;
    }

    let bytes = 0;
    try {
      bytes = (await stat(path)).size;
    } catch {
      continue;
    }

    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > maxBytes) {
      continue;
    }

    candidates.push({ path, bytes });
  }

  return candidates;
};

export const collectBirdConfigCandidatesFromRoots = async ({
  roots,
  maxBytes,
}) => {
  const allCandidates = await Promise.all(
    roots.map((root) => collectBirdConfigCandidates({ root, maxBytes })),
  );

  return allCandidates.flat();
};
