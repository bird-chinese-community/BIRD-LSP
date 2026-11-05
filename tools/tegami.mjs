import process from "node:process";
import { runCli } from "tegami/cli";
import { createRelease } from "./tegami-config.mjs";

const githubIntegration = process.env.TEGAMI_GITHUB === "1";
await runCli(createRelease({ githubIntegration }));
