import type { Node as SyntaxNode } from "web-tree-sitter";
import type { BirdDeclaration, ParseIssue, ProtocolStatement } from "./types.js";
import { isPresentNode, mergeRanges, stripQuotes, textOf, toRange } from "./tree.js";
import { pushMissingFieldIssue } from "./issues.js";

type IncludeDeclaration = Extract<BirdDeclaration, { kind: "include" }>;
type DefineDeclaration = Extract<BirdDeclaration, { kind: "define" }>;
type ProtocolDeclaration = Extract<BirdDeclaration, { kind: "protocol" }>;
type TemplateDeclaration = Extract<BirdDeclaration, { kind: "template" }>;
type FilterDeclaration = Extract<BirdDeclaration, { kind: "filter" }>;
type FunctionDeclaration = Extract<BirdDeclaration, { kind: "function" }>;

const PROTOCOL_STATEMENT_TYPES = new Set([
  "local_as_statement",
  "neighbor_statement",
  "import_statement",
  "export_statement",
]);

const protocolStatementNodesOf = (blockNode: SyntaxNode): SyntaxNode[] => {
  return blockNode.namedChildren.filter((child) => PROTOCOL_STATEMENT_TYPES.has(child.type));
};

const protocolTypeTextAndRange = (
  protocolTypeNode: SyntaxNode | null,
  protocolVariantNode: SyntaxNode | null,
  source: string,
  declarationRange: ReturnType<typeof toRange>,
): { protocolType: string; protocolTypeRange: ReturnType<typeof toRange> } => {
  const protocolType = isPresentNode(protocolTypeNode)
    ? [
        textOf(protocolTypeNode, source),
        isPresentNode(protocolVariantNode) ? textOf(protocolVariantNode, source) : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const protocolTypeRange =
    isPresentNode(protocolTypeNode) && isPresentNode(protocolVariantNode)
      ? mergeRanges(toRange(protocolTypeNode, source), toRange(protocolVariantNode, source))
      : isPresentNode(protocolTypeNode)
        ? toRange(protocolTypeNode, source)
        : declarationRange;

  return { protocolType, protocolTypeRange };
};

const parseIncludeDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): IncludeDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const pathNode = declarationNode.childForFieldName("path");
  if (!isPresentNode(pathNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing path for include declaration", source);
  }

  return {
    kind: "include",
    path: isPresentNode(pathNode) ? stripQuotes(textOf(pathNode, source)) : "",
    pathRange: isPresentNode(pathNode) ? toRange(pathNode, source) : declarationRange,
    ...declarationRange,
  };
};

const parseDefineDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): DefineDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for define declaration", source);
  }

  return {
    kind: "define",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    ...declarationRange,
  };
};

const parseProtocolStatements = (
  blockNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): ProtocolStatement[] => {
  const statements: ProtocolStatement[] = [];
  const nodes = protocolStatementNodesOf(blockNode);

  for (const statementNode of nodes) {
    const statementRange = toRange(statementNode, source);

    if (statementNode.type === "local_as_statement") {
      const asnNode = statementNode.childForFieldName("asn");
      if (!isPresentNode(asnNode)) {
        pushMissingFieldIssue(issues, statementNode, "Missing ASN in local as statement", source);
      }

      statements.push({
        kind: "local-as",
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : "",
        asnRange: isPresentNode(asnNode) ? toRange(asnNode, source) : statementRange,
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "neighbor_statement") {
      const addressNode = statementNode.childForFieldName("address");
      const asnNode = statementNode.childForFieldName("asn");

      if (!isPresentNode(addressNode)) {
        pushMissingFieldIssue(issues, statementNode, "Missing neighbor address", source);
      }

      statements.push({
        kind: "neighbor",
        address: isPresentNode(addressNode) ? textOf(addressNode, source) : "",
        addressRange: isPresentNode(addressNode) ? toRange(addressNode, source) : statementRange,
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : undefined,
        asnRange: isPresentNode(asnNode) ? toRange(asnNode, source) : undefined,
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "import_statement" || statementNode.type === "export_statement") {
      const clauseNode = statementNode.childForFieldName("clause");
      const isImport = statementNode.type === "import_statement";
      const base = {
        kind: isImport ? ("import" as const) : ("export" as const),
        ...statementRange,
      };

      if (!isPresentNode(clauseNode) || clauseNode.type === "all_clause") {
        statements.push({
          ...base,
          mode: "all",
        });
        continue;
      }

      if (clauseNode.type === "filter_name_clause" || clauseNode.type === "filter_block_clause") {
        const filterNameNode = clauseNode.childForFieldName("filter_name");

        statements.push({
          ...base,
          mode: "filter",
          filterName: isPresentNode(filterNameNode) ? textOf(filterNameNode, source) : undefined,
          filterNameRange: isPresentNode(filterNameNode)
            ? toRange(filterNameNode, source)
            : undefined,
        });
        continue;
      }

      statements.push({
        ...base,
        mode: "other",
        clauseText: textOf(clauseNode, source),
      });
    }
  }

  return statements;
};

const parseProtocolDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): ProtocolDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const protocolTypeNode = declarationNode.childForFieldName("protocol_type");
  const protocolVariantNode = declarationNode.childForFieldName("protocol_variant");
  const nameNode = declarationNode.childForFieldName("name");
  const fromTemplateNode = declarationNode.childForFieldName("from_template");
  const bodyNode = declarationNode.childForFieldName("body");
  const hasFromKeyword = declarationNode.children.some((entry) => entry.type === "from");

  if (!isPresentNode(protocolTypeNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing protocol type for protocol declaration",
      source,
    );
  }

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for protocol declaration", source);
  }

  if (hasFromKeyword && !isPresentNode(fromTemplateNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing template name after from clause",
      source,
    );
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "parser/unbalanced-brace",
      message: "Missing '{' for protocol declaration",
      ...declarationRange,
    });
  }

  const { protocolType, protocolTypeRange } = protocolTypeTextAndRange(
    protocolTypeNode,
    protocolVariantNode,
    source,
    declarationRange,
  );

  return {
    kind: "protocol",
    protocolType,
    protocolTypeRange,
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    fromTemplate: isPresentNode(fromTemplateNode) ? textOf(fromTemplateNode, source) : undefined,
    fromTemplateRange: isPresentNode(fromTemplateNode)
      ? toRange(fromTemplateNode, source)
      : undefined,
    statements: isPresentNode(bodyNode) ? parseProtocolStatements(bodyNode, source, issues) : [],
    ...declarationRange,
  };
};

const parseTemplateDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TemplateDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const templateTypeNode = declarationNode.childForFieldName("template_type");
  const nameNode = declarationNode.childForFieldName("name");
  const bodyNode = declarationNode.childForFieldName("body");

  if (!isPresentNode(templateTypeNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing template type for template declaration",
      source,
    );
  }

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for template declaration", source);
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "parser/unbalanced-brace",
      message: "Missing '{' for template declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "template",
    templateType: isPresentNode(templateTypeNode) ? textOf(templateTypeNode, source) : "",
    templateTypeRange: isPresentNode(templateTypeNode)
      ? toRange(templateTypeNode, source)
      : declarationRange,
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    ...declarationRange,
  };
};

const parseFilterDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): FilterDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  const bodyNode = declarationNode.childForFieldName("body");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for filter declaration", source);
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "parser/unbalanced-brace",
      message: "Missing '{' for filter declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "filter",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    ...declarationRange,
  };
};

const parseFunctionDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): FunctionDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  const bodyNode = declarationNode.childForFieldName("body");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for function declaration", source);
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "parser/unbalanced-brace",
      message: "Missing '{' for function declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "function",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    ...declarationRange,
  };
};

export const parseDeclarations = (
  rootNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): BirdDeclaration[] => {
  const declarations: BirdDeclaration[] = [];

  for (const child of rootNode.namedChildren) {
    if (child.type === "include_declaration") {
      declarations.push(parseIncludeDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "define_declaration") {
      declarations.push(parseDefineDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "protocol_declaration") {
      declarations.push(parseProtocolDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "template_declaration") {
      declarations.push(parseTemplateDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "filter_declaration") {
      declarations.push(parseFilterDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "function_declaration") {
      declarations.push(parseFunctionDeclaration(child, source, issues));
    }
  }

  return declarations;
};
