import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const createServerProcess = (
  command: string,
  args: readonly string[],
) => {
  let child: ChildProcessWithoutNullStreams | undefined;

  const start = async (): Promise<ChildProcessWithoutNullStreams> => {
    child = spawn(command, [...args], {
      stdio: "pipe",
      env:
        command === process.execPath
          ? { ...process.env, ELECTRON_RUN_AS_NODE: "1", ELECTRON_NO_ASAR: "1" }
          : process.env,
    });
    const spawned = child;
    await new Promise<void>((resolve, reject) => {
      spawned.once("spawn", resolve);
      spawned.once("error", reject);
    });
    return spawned;
  };

  const terminate = async (): Promise<void> => {
    const process = child;
    if (!process || process.exitCode !== null || process.signalCode !== null)
      return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => process.kill("SIGKILL"), 2_000);
      process.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      process.kill("SIGTERM");
    });
    child = undefined;
  };

  return { start, terminate };
};
