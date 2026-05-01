import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ParseIssue } from "../types.js";
import { pushMissingFieldIssue } from "../issues.js";
import { isPresentNode, stripQuotes, textOf, toRange } from "../tree.js";
import {
  type DefineDeclaration,
  type IncludeDeclaration,
  type RouterIdDeclaration,
  type TableDeclaration,
  type TemplateDeclaration,
  isStrictIpv4Literal,
  nodeOrSelf,
  normalizeTableType,
} from "./shared.js";

export const parseIncludeDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): IncludeDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const pathNode = declarationNode.childForFieldName("path");
  if (!isPresentNode(pathNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing path for include declaration",
      source,
    );
  }

  return {
    kind: "include",
    path: isPresentNode(pathNode) ? stripQuotes(textOf(pathNode, source)) : "",
    pathRange: isPresentNode(pathNode)
      ? toRange(pathNode, source)
      : declarationRange,
    ...declarationRange,
  };
};

const DEFINE_VALUE_EXTRACTOR = /^define\s+\S+\s*=\s*(.+?)\s*;$/s;

export const parseDefineDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): DefineDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for define declaration",
      source,
    );
  }

  const name = isPresentNode(nameNode) ? textOf(nameNode, source) : "";
  const nameRange = isPresentNode(nameNode)
    ? toRange(nameNode, source)
    : declarationRange;

  const fullText = textOf(declarationNode, source);
  const valueMatch = fullText.match(DEFINE_VALUE_EXTRACTOR);
  const value = valueMatch?.[1]?.trim();

  return {
    kind: "define",
    name,
    nameRange,
    ...(value !== undefined && value.length > 0 ? { value } : {}),
    ...declarationRange,
  };
};

export const parseRouterIdDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): RouterIdDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const rawValueNode = declarationNode.childForFieldName("value");

  if (!isPresentNode(rawValueNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing value for router id declaration",
      source,
    );
    return {
      kind: "router-id",
      value: "",
      valueKind: "unknown",
      valueRange: declarationRange,
      ...declarationRange,
    };
  }

  const valueNode = nodeOrSelf(rawValueNode);

  if (valueNode.type === "router_id_from_clause") {
    const fromSourceNode = valueNode.childForFieldName("from_source");
    const fromSourceText = isPresentNode(fromSourceNode)
      ? textOf(fromSourceNode, source).toLowerCase()
      : "";
    if (fromSourceText !== "routing" && fromSourceText !== "dynamic") {
      return {
        kind: "router-id",
        value: textOf(valueNode, source),
        valueKind: "unknown",
        valueRange: toRange(valueNode, source),
        ...declarationRange,
      };
    }

    return {
      kind: "router-id",
      value: textOf(valueNode, source),
      valueKind: "from",
      valueRange: toRange(valueNode, source),
      fromSource: fromSourceText,
      ...declarationRange,
    };
  }

  if (
    valueNode.type === "ipv4_literal" &&
    isStrictIpv4Literal(textOf(valueNode, source))
  ) {
    return {
      kind: "router-id",
      value: textOf(valueNode, source),
      valueKind: "ip",
      valueRange: toRange(valueNode, source),
      ...declarationRange,
    };
  }

  if (valueNode.type === "number") {
    return {
      kind: "router-id",
      value: textOf(valueNode, source),
      valueKind: "number",
      valueRange: toRange(valueNode, source),
      ...declarationRange,
    };
  }

  return {
    kind: "router-id",
    value: textOf(valueNode, source),
    valueKind: "unknown",
    valueRange: toRange(valueNode, source),
    ...declarationRange,
  };
};

export const parseTableDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TableDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const tableTypeNode = declarationNode.childForFieldName("table_type");
  const nameNode = declarationNode.childForFieldName("name");
  const attrsNode = declarationNode.childForFieldName("attrs");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for table declaration",
      source,
    );
  }

  const firstToken = declarationNode.children[0];
  const tableTypeText = isPresentNode(tableTypeNode)
    ? textOf(tableTypeNode, source)
    : firstToken
      ? textOf(firstToken, source)
      : "unknown";

  return {
    kind: "table",
    tableType: normalizeTableType(tableTypeText),
    tableTypeRange: isPresentNode(tableTypeNode)
      ? toRange(tableTypeNode, source)
      : declarationRange,
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    attrsText: isPresentNode(attrsNode) ? textOf(attrsNode, source) : undefined,
    attrsRange: isPresentNode(attrsNode)
      ? toRange(attrsNode, source)
      : undefined,
    ...declarationRange,
  };
};

export const parseTemplateDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TemplateDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const declarationText = textOf(declarationNode, source);
  const declarationHeader = declarationText.split("{", 1)[0] ?? declarationText;
  const templateTypeNode = declarationNode.childForFieldName("template_type");
  const nameNode = declarationNode.childForFieldName("name");
  const fromTemplateNode = declarationNode.childForFieldName("from_template");
  const bodyNode = declarationNode.childForFieldName("body");
  const inferredFromTemplateMatch = declarationHeader.match(
    /\bfrom\s+([A-Za-z_][A-Za-z0-9_-]*)\b/i,
  );
  const inferredFromTemplate = inferredFromTemplateMatch?.[1];
  const hasFromKeyword =
    declarationNode.children.some((entry) => entry.type === "from") ||
    /\bfrom\b/i.test(declarationHeader);

  if (!isPresentNode(templateTypeNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing template type for template declaration",
      source,
    );
  }

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for template declaration",
      source,
    );
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
      code: "syntax/unbalanced-brace",
      message: "Missing '{' for template declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "template",
    templateType: isPresentNode(templateTypeNode)
      ? textOf(templateTypeNode, source)
      : "",
    templateTypeRange: isPresentNode(templateTypeNode)
      ? toRange(templateTypeNode, source)
      : declarationRange,
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    fromTemplate: isPresentNode(fromTemplateNode)
      ? textOf(fromTemplateNode, source)
      : inferredFromTemplate,
    fromTemplateRange: isPresentNode(fromTemplateNode)
      ? toRange(fromTemplateNode, source)
      : inferredFromTemplate
        ? declarationRange
        : undefined,
    ...declarationRange,
  };
};
