import { posix, win32 } from "node:path";
import { expect, it } from "vitest";
import { isPathWithinRoot } from "../src/paths.js";

it("distinguishes roots, children, siblings, and parent paths on POSIX and Windows", () => {
  for (const path of [posix, win32]) {
    const root = path.resolve(
      path === win32 ? "C:\\workspace\\a" : "/workspace/a",
    );
    expect(isPathWithinRoot(root, root, path)).toBe(true);
    expect(isPathWithinRoot(path.join(root, "part.inc"), root, path)).toBe(
      true,
    );
    expect(
      isPathWithinRoot(path.resolve(root, "..", "b", "part.inc"), root, path),
    ).toBe(false);
    expect(
      isPathWithinRoot(path.resolve(root, "..", "ab", "part.inc"), root, path),
    ).toBe(false);
    expect(isPathWithinRoot(path.dirname(root), root, path)).toBe(false);
  }
  expect(isPathWithinRoot("D:\\outside", "C:\\workspace", win32)).toBe(false);
});
