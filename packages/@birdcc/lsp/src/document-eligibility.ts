import { fileURLToPath } from "node:url";
import {
  evaluateBirdDocumentEligibility,
  type BirdDocumentEligibility,
} from "@birdcc/core";
import type { ProjectAnalysisOptions } from "./project-config.js";

export const evaluateLspDocumentEligibility = (
  text: string,
  documentUri: string,
  project: ProjectAnalysisOptions,
): Promise<BirdDocumentEligibility> =>
  evaluateBirdDocumentEligibility(text, {
    filePath: documentUri.startsWith("file://")
      ? fileURLToPath(documentUri)
      : undefined,
    explicitMain:
      project.mode === "main" &&
      project.configPath !== undefined &&
      project.entryUri === documentUri,
  });
