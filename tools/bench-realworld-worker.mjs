import {
  benchmarkConfigFile,
  clampRepeats,
  loadWorkspaceApis,
  runWarmup,
} from "./bench-realworld-core.mjs";

const parseArgs = (argv) => {
  const options = {
    filePath: undefined,
    engine: "builtin",
    repeats: 1,
    warmup: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--file":
        options.filePath = next;
        index += 1;
        break;
      case "--engine":
        options.engine = next ?? options.engine;
        index += 1;
        break;
      case "--repeats":
        options.repeats = Number(next ?? options.repeats);
        index += 1;
        break;
      case "--no-warmup":
        options.warmup = false;
        break;
      default:
        break;
    }
  }

  return options;
};

const main = async () => {
  const options = parseArgs(process.argv);
  if (!options.filePath) {
    throw new Error("Missing --file argument");
  }

  const { parseBirdConfig, formatBirdConfig } = await loadWorkspaceApis();
  const safeRepeats = clampRepeats(options.repeats);

  if (options.warmup) {
    await runWarmup({
      parseBirdConfig,
      formatBirdConfig,
      engine: options.engine,
    });
  }

  const result = await benchmarkConfigFile({
    filePath: options.filePath,
    engine: options.engine,
    repeats: safeRepeats,
    parseBirdConfig,
    formatBirdConfig,
  });

  process.stdout.write(JSON.stringify(result));
};

await main();
