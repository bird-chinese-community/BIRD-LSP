export const configExampleSources = [
  {
    id: "bird2-ix-bird-rs-generator",
    birdMajor: 2,
    path: "BIRD2-IX-BIRD-RS-Generator",
    repo: "PoemaIX/IX-BIRD-RS-Generator",
    repoGit: "https://github.com/PoemaIX/IX-BIRD-RS-Generator.git",
  },
  {
    id: "bird2-jknet-bird",
    birdMajor: 2,
    path: "BIRD2-JKNET-BIRD",
    repo: "HuJK-Data/JKNET-BIRD",
    repoGit: "https://github.com/HuJK-Data/JKNET-BIRD.git",
  },
  {
    id: "bird2-net186-config",
    birdMajor: 2,
    path: "BIRD2-net186-config",
    repo: "186526/net186-config",
    repoGit: "https://github.com/186526/net186-config.git",
  },
  {
    id: "bird3-bird-configs-output",
    birdMajor: 3,
    path: "BIRD3-bird-configs-output",
    repo: "tianshome/bird-configs-output",
    repoGit: "https://github.com/tianshome/bird-configs-output.git",
  },
];

export const sortedConfigExampleSources = [...configExampleSources].sort((a, b) =>
  a.id.localeCompare(b.id),
);
