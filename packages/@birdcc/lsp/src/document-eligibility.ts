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
): Promise<BirdDocumentEligibility> => {
  let filePath: string | undefined;
  if (documentUri.startsWith("file://")) {
    try {
      filePath = fileURLToPath(documentUri);
    } catch {
      // A malformed file URI must not crash eligibility checks; fall back to
      // undefined so evaluation proceeds without a filesystem-backed path.
      filePath = undefined;
    }
  }

  return evaluateBirdDocumentEligibility(text, {
    filePath,
    explicitMain:
      project.mode === "main" &&
      project.configPath !== undefined &&
      project.entryUri === documentUri,
  });
};
