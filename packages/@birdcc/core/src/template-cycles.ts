import type { ParsedBirdDocument, SourceRange } from "@birdcc/parser";
import type { BirdDiagnostic } from "./types.js";

interface ParsedDocumentWithUri {
  uri: string;
  parsed: ParsedBirdDocument;
}

interface TemplateInheritanceNode {
  uri: string;
  name: string;
  key: string;
  parentName?: string;
  parentKey?: string;
  parentRange: SourceRange;
}

const createNode = (
  uri: string,
  declaration: Extract<ParsedBirdDocument["program"]["declarations"][number], { kind: "template" }>,
): TemplateInheritanceNode => ({
  uri,
  name: declaration.name,
  key: declaration.name.toLowerCase(),
  parentName: declaration.fromTemplate,
  parentKey: declaration.fromTemplate?.toLowerCase(),
  parentRange: declaration.fromTemplateRange ?? declaration.nameRange,
});

const collectTemplateInheritanceNodes = (
  parsedDocuments: ParsedDocumentWithUri[],
): Map<string, TemplateInheritanceNode> => {
  const nodes = new Map<string, TemplateInheritanceNode>();

  for (const document of parsedDocuments) {
    const { uri, parsed } = document;
    for (const declaration of parsed.program.declarations) {
      if (declaration.kind !== "template") {
        continue;
      }

      const node = createNode(uri, declaration);
      if (!nodes.has(node.key)) {
        nodes.set(node.key, node);
      }
    }
  }

  return nodes;
};

const normalizeParsedDocuments = (
  parsedDocuments: ParsedBirdDocument[] | ParsedDocumentWithUri[],
): ParsedDocumentWithUri[] => {
  if (parsedDocuments.length === 0) {
    return [];
  }

  const first = parsedDocuments[0];
  if ("parsed" in first && "uri" in first) {
    return parsedDocuments as ParsedDocumentWithUri[];
  }

  return (parsedDocuments as ParsedBirdDocument[]).map((parsed, index) => ({
    uri: `memory://document-${index + 1}.conf`,
    parsed,
  }));
};

export const collectCircularTemplateDiagnostics = (
  parsedDocuments: ParsedBirdDocument[] | ParsedDocumentWithUri[],
): BirdDiagnostic[] => {
  const normalizedDocuments = normalizeParsedDocuments(parsedDocuments);
  const nodes = collectTemplateInheritanceNodes(normalizedDocuments);
  const diagnostics: BirdDiagnostic[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const emitted = new Set<string>();

  const visit = (key: string): void => {
    state.set(key, 1);
    stack.push(key);

    const node = nodes.get(key);
    const parentKey = node?.parentKey;

    if (node && parentKey && nodes.has(parentKey)) {
      const parentState = state.get(parentKey) ?? 0;

      if (parentState === 0) {
        visit(parentKey);
      } else if (parentState === 1) {
        const startIndex = stack.lastIndexOf(parentKey);
        if (startIndex >= 0) {
          const cycleKeys = [...stack.slice(startIndex), parentKey];
          const cycleSignature = cycleKeys
            .slice(0, -1)
            .map((entry) => entry.toLowerCase())
            .sort()
            .join("->");

          if (!emitted.has(cycleSignature)) {
            emitted.add(cycleSignature);
            const cycleNames = cycleKeys.map((entry) => nodes.get(entry)?.name ?? entry);

            diagnostics.push({
              code: "semantic/circular-template",
              message: `Circular template inheritance detected: ${cycleNames.join(" -> ")}`,
              severity: "error",
              source: "core",
              uri: node.uri,
              range: {
                line: node.parentRange.line,
                column: node.parentRange.column,
                endLine: node.parentRange.endLine,
                endColumn: node.parentRange.endColumn,
              },
            });
          }
        }
      }
    }

    stack.pop();
    state.set(key, 2);
  };

  for (const key of nodes.keys()) {
    if ((state.get(key) ?? 0) !== 0) {
      continue;
    }

    visit(key);
  }

  return diagnostics;
};
