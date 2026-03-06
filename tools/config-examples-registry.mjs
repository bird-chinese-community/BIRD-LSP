const privateRoot = process.env.BIRDCC_PRIVATE_BIRD2_LAUNCHPAD_ROOT?.trim();

const configExampleSourceSort = (left, right) =>
  left.id.localeCompare(right.id);

const assertValidSource = (source) => {
  if (!source.id || !source.path || !source.birdMajor || !source.visibility) {
    throw new Error(`Invalid config example source definition: ${JSON.stringify(source)}`);
  }

  if (source.visibility === "private") {
    if (!source.ghUsername) {
      throw new Error(
        `Private config example source must define ghUsername: ${source.id}`,
      );
    }

    if (source.repo || source.repoGit) {
      throw new Error(
        `Private config example source must not expose repo or repoGit metadata: ${source.id}`,
      );
    }

    return source;
  }

  if (!source.repo || !source.repoGit) {
    throw new Error(
      `Public config example source must define repo and repoGit: ${source.id}`,
    );
  }

  return source;
};

export const configExampleSources = [
  {
    id: "bird2-ix-bird-rs-generator",
    birdMajor: 2,
    path: "BIRD2-IX-BIRD-RS-Generator",
    repo: "PoemaIX/IX-BIRD-RS-Generator",
    repoGit: "https://github.com/PoemaIX/IX-BIRD-RS-Generator.git",
    visibility: "public",
  },
  {
    id: "bird2-jknet-bird",
    birdMajor: 2,
    path: "BIRD2-JKNET-BIRD",
    repo: "HuJK-Data/JKNET-BIRD",
    repoGit: "https://github.com/HuJK-Data/JKNET-BIRD.git",
    visibility: "public",
  },
  {
    id: "bird2-net186-config",
    birdMajor: 2,
    path: "BIRD2-net186-config",
    repo: "186526/net186-config",
    repoGit: "https://github.com/186526/net186-config.git",
    visibility: "public",
  },
  {
    id: "bird2-launchpad-network-private",
    birdMajor: 2,
    path: "BIRD2-LaunchPad-Network",
    localPath: privateRoot,
    ghUsername: "LaunchPad-Network",
    visibility: "private",
  },
  {
    id: "bird2-sunyznet-bird-config",
    birdMajor: 2,
    path: "BIRD2-SunyzNET-bird-config",
    repo: "SunyzNET/bird-config",
    repoGit: "https://github.com/SunyzNET/bird-config.git",
    visibility: "public",
  },
  {
    id: "bird3-bird-configs-output",
    birdMajor: 3,
    path: "BIRD3-bird-configs-output",
    repo: "tianshome/bird-configs-output",
    repoGit: "https://github.com/tianshome/bird-configs-output.git",
    visibility: "public",
  },
].map(assertValidSource);

export const sortedConfigExampleSources = [...configExampleSources].sort(
  configExampleSourceSort,
);

export const publicConfigExampleSources = configExampleSources.filter(
  (source) => source.visibility !== "private",
);

export const sortedPublicConfigExampleSources = [
  ...publicConfigExampleSources,
].sort(configExampleSourceSort);
