import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * Returns the DN42 IPDB cache directory: an absolute `$XDG_CACHE_HOME`, else
 * `%LOCALAPPDATA%` on Windows, else `~/.cache`.
 */
export const dn42CacheDir = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string =>
  join(
    env.XDG_CACHE_HOME && isAbsolute(env.XDG_CACHE_HOME)
      ? env.XDG_CACHE_HOME
      : platform === "win32" && env.LOCALAPPDATA
        ? env.LOCALAPPDATA
        : join(home, ".cache"),
    "birdcc",
    "dn42-ipdb",
  );
