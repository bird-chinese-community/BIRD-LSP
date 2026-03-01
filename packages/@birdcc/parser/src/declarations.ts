import type { Node as SyntaxNode } from "web-tree-sitter";
import type { BirdDeclaration, ParseIssue, ProtocolStatement } from "./types.js";
import { isPresentNode, mergeRanges, stripQuotes, textOf, toRange } from "./tree.js";
import { pushMissingFieldIssue } from "./issues.js";

const parseProtocolStatements = (
  blockNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): ProtocolStatement[] => {
  const statements: ProtocolStatement[] = [];
  const nodes = blockNode.descendantsOfType([
    "local_as_statement",
    "neighbor_statement",
    "import_statement",
    "export_statement",
  ]);

  for (const statementNode of nodes) {
    const statementRange = toRange(statementNode);

    if (statementNode.type === "local_as_statement") {
      const asnNode = statementNode.childForFieldName("asn");
      if (!isPresentNode(asnNode)) {
        pushMissingFieldIssue(issues, statementNode, "Missing ASN in local as statement");
      }

      statements.push({
        kind: "local-as",
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : "",
        asnRange: isPresentNode(asnNode) ? toRange(asnNode) : statementRange,
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "neighbor_statement") {
      const addressNode = statementNode.childForFieldName("address");
      const asnNode = statementNode.childForFieldName("asn");

      if (!isPresentNode(addressNode)) {
        pushMissingFieldIssue(issues, statementNode, "Missing neighbor address");
      }

      statements.push({
        kind: "neighbor",
        address: isPresentNode(addressNode) ? textOf(addressNode, source) : "",
        addressRange: isPresentNode(addressNode) ? toRange(addressNode) : statementRange,
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : undefined,
        asnRange: isPresentNode(asnNode) ? toRange(asnNode) : undefined,
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
          filterNameRange: isPresentNode(filterNameNode) ? toRange(filterNameNode) : undefined,
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

export const parseDeclarations = (
  rootNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): BirdDeclaration[] => {
  const declarations: BirdDeclaration[] = [];

  for (const child of rootNode.namedChildren) {
    const declarationRange = toRange(child);

    if (child.type === "include_declaration") {
      const pathNode = child.childForFieldName("path");
      if (!isPresentNode(pathNode)) {
        pushMissingFieldIssue(issues, child, "Missing path for include declaration");
      }

      declarations.push({
        kind: "include",
        path: isPresentNode(pathNode) ? stripQuotes(textOf(pathNode, source)) : "",
        pathRange: isPresentNode(pathNode) ? toRange(pathNode) : declarationRange,
        ...declarationRange,
      });
      continue;
    }

    if (child.type === "define_declaration") {
      const nameNode = child.childForFieldName("name");
      if (!isPresentNode(nameNode)) {
        pushMissingFieldIssue(issues, child, "Missing name for define declaration");
      }

      declarations.push({
        kind: "define",
        name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
        nameRange: isPresentNode(nameNode) ? toRange(nameNode) : declarationRange,
        ...declarationRange,
      });
      continue;
    }

    if (child.type === "protocol_declaration") {
      const protocolTypeNode = child.childForFieldName("protocol_type");
      const protocolVariantNode = child.childForFieldName("protocol_variant");
      const nameNode = child.childForFieldName("name");
      const fromTemplateNode = child.childForFieldName("from_template");
      const bodyNode = child.childForFieldName("body");
      const hasFromKeyword = child.children.some((entry) => entry.type === "from");

      if (!isPresentNode(protocolTypeNode)) {
        pushMissingFieldIssue(issues, child, "Missing protocol type for protocol declaration");
      }

      if (!isPresentNode(nameNode)) {
        pushMissingFieldIssue(issues, child, "Missing name for protocol declaration");
      }

      if (hasFromKeyword && !isPresentNode(fromTemplateNode)) {
        pushMissingFieldIssue(issues, child, "Missing template name after from clause");
      }

      if (!isPresentNode(bodyNode)) {
        issues.push({
          code: "parser/unbalanced-brace",
          message: "Missing '{' for protocol declaration",
          ...declarationRange,
        });
      }

      declarations.push({
        kind: "protocol",
        protocolType: isPresentNode(protocolTypeNode)
          ? [
              textOf(protocolTypeNode, source),
              isPresentNode(protocolVariantNode) ? textOf(protocolVariantNode, source) : "",
            ]
              .filter((item) => item.length > 0)
              .join(" ")
          : "",
        protocolTypeRange:
          isPresentNode(protocolTypeNode) && isPresentNode(protocolVariantNode)
            ? mergeRanges(toRange(protocolTypeNode), toRange(protocolVariantNode))
            : isPresentNode(protocolTypeNode)
              ? toRange(protocolTypeNode)
              : declarationRange,
        name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
        nameRange: isPresentNode(nameNode) ? toRange(nameNode) : declarationRange,
        fromTemplate: isPresentNode(fromTemplateNode)
          ? textOf(fromTemplateNode, source)
          : undefined,
        fromTemplateRange: isPresentNode(fromTemplateNode) ? toRange(fromTemplateNode) : undefined,
        statements: isPresentNode(bodyNode)
          ? parseProtocolStatements(bodyNode, source, issues)
          : [],
        ...declarationRange,
      });
      continue;
    }

    if (child.type === "template_declaration") {
      const templateTypeNode = child.childForFieldName("template_type");
      const nameNode = child.childForFieldName("name");
      const bodyNode = child.childForFieldName("body");

      if (!isPresentNode(templateTypeNode)) {
        pushMissingFieldIssue(issues, child, "Missing template type for template declaration");
      }

      if (!isPresentNode(nameNode)) {
        pushMissingFieldIssue(issues, child, "Missing name for template declaration");
      }

      if (!isPresentNode(bodyNode)) {
        issues.push({
          code: "parser/unbalanced-brace",
          message: "Missing '{' for template declaration",
          ...declarationRange,
        });
      }

      declarations.push({
        kind: "template",
        templateType: isPresentNode(templateTypeNode) ? textOf(templateTypeNode, source) : "",
        templateTypeRange: isPresentNode(templateTypeNode)
          ? toRange(templateTypeNode)
          : declarationRange,
        name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
        nameRange: isPresentNode(nameNode) ? toRange(nameNode) : declarationRange,
        ...declarationRange,
      });
      continue;
    }

    if (child.type === "filter_declaration") {
      const nameNode = child.childForFieldName("name");
      const bodyNode = child.childForFieldName("body");

      if (!isPresentNode(nameNode)) {
        pushMissingFieldIssue(issues, child, "Missing name for filter declaration");
      }

      if (!isPresentNode(bodyNode)) {
        issues.push({
          code: "parser/unbalanced-brace",
          message: "Missing '{' for filter declaration",
          ...declarationRange,
        });
      }

      declarations.push({
        kind: "filter",
        name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
        nameRange: isPresentNode(nameNode) ? toRange(nameNode) : declarationRange,
        ...declarationRange,
      });
      continue;
    }

    if (child.type === "function_declaration") {
      const nameNode = child.childForFieldName("name");
      const bodyNode = child.childForFieldName("body");

      if (!isPresentNode(nameNode)) {
        pushMissingFieldIssue(issues, child, "Missing name for function declaration");
      }

      if (!isPresentNode(bodyNode)) {
        issues.push({
          code: "parser/unbalanced-brace",
          message: "Missing '{' for function declaration",
          ...declarationRange,
        });
      }

      declarations.push({
        kind: "function",
        name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
        nameRange: isPresentNode(nameNode) ? toRange(nameNode) : declarationRange,
        ...declarationRange,
      });
    }
  }

  return declarations;
};
