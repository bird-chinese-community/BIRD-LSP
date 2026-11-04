import { isAbsolute, relative, sep } from "node:path";

export const isPathWithinRoot = (
  candidate: string,
  root: string,
  pathOperations = { isAbsolute, relative, sep },
): boolean => {
  const path = pathOperations.relative(root, candidate);
  return (
    path === "" ||
    (path !== ".." &&
      !path.startsWith(`..${pathOperations.sep}`) &&
      !pathOperations.isAbsolute(path))
  );
};
