import { join } from "node:path";
import { expect, it } from "vitest";
import { dn42CacheDir } from "../src/dn42-cache.js";

it.each([
  [{ XDG_CACHE_HOME: "/var/cache/me" }, "linux", "/var/cache/me"],
  [{ XDG_CACHE_HOME: "relative/cache" }, "linux", "/home/me/.cache"],
  [
    { LOCALAPPDATA: "/c/Users/me/AppData/Local" },
    "win32",
    "/c/Users/me/AppData/Local",
  ],
  [{ LOCALAPPDATA: "/c/Users/me/AppData/Local" }, "linux", "/home/me/.cache"],
  [{}, "win32", "/home/me/.cache"],
  [{}, "darwin", "/home/me/.cache"],
] as const)("selects the cache base for %j on %s", (env, platform, base) => {
  expect(dn42CacheDir(env, platform, "/home/me")).toBe(
    join(base, "birdcc", "dn42-ipdb"),
  );
});
