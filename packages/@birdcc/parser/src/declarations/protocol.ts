import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  ChannelEntry,
  ExportStatement,
  ImportStatement,
  ParseIssue,
  ProtocolStatement,
} from "../types.js";
import { pushMissingFieldIssue } from "../issues.js";
import { isPresentNode, mergeRanges, textOf, toRange } from "../tree.js";
import {
  CHANNEL_DIRECTIONS,
  PROTOCOL_STATEMENT_TYPES,
  type ProtocolDeclaration,
  isIpLiteralCandidate,
  normalizeChannelType,
  protocolTypeTextAndRange,
  protocolStatementNodesOf,
} from "./shared.js";

// Keep API near parseProtocolStatements and channel fallback behavior.
const parseImportExportNode = (
  statementNode: SyntaxNode,
  source: string,
): ImportStatement | ExportStatement => {
  const statementRange = toRange(statementNode, source);
  const clauseNode = statementNode.childForFieldName("clause");
  const isImport = statementNode.type === "import_statement";

  const base = {
    kind: isImport ? ("import" as const) : ("export" as const),
    ...statementRange,
  };

  if (!isPresentNode(clauseNode) || clauseNode.type === "all_clause") {
    return {
      ...base,
      mode: "all",
    };
  }

  if (clauseNode.type === "none_clause") {
    return {
      ...base,
      mode: "none",
    };
  }

  if (
    clauseNode.type === "filter_name_clause" ||
    clauseNode.type === "filter_block_clause"
  ) {
    const filterNameNode = clauseNode.childForFieldName("filter_name");

    return {
      ...base,
      mode: "filter",
      filterName: isPresentNode(filterNameNode)
        ? textOf(filterNameNode, source)
        : undefined,
      filterNameRange: isPresentNode(filterNameNode)
        ? toRange(filterNameNode, source)
        : undefined,
    };
  }

  if (clauseNode.type === "where_clause") {
    const whereExpressionNode =
      clauseNode.childForFieldName("where_expression");

    return {
      ...base,
      mode: "where",
      whereExpression: isPresentNode(whereExpressionNode)
        ? textOf(whereExpressionNode, source)
        : undefined,
      whereExpressionRange: isPresentNode(whereExpressionNode)
        ? toRange(whereExpressionNode, source)
        : undefined,
      clauseText: textOf(clauseNode, source),
    };
  }

  const clauseText = textOf(clauseNode, source).trim();
  const lowered = clauseText.toLowerCase();

  if (lowered === "none" || lowered.startsWith("none ")) {
    return {
      ...base,
      mode: "none",
      clauseText,
    };
  }

  if (lowered.startsWith("where ")) {
    return {
      ...base,
      mode: "where",
      whereExpression: clauseText.slice("where ".length).trim(),
      clauseText,
    };
  }

  if (lowered.startsWith("filter ")) {
    const maybeName = clauseText.slice("filter ".length).trim();
    return {
      ...base,
      mode: "filter",
      filterName:
        maybeName.length > 0 && !maybeName.startsWith("{")
          ? maybeName
          : undefined,
      clauseText,
    };
  }

  return {
    ...base,
    mode: "other",
    clauseText,
  };
};

const parseChannelEntries = (
  channelBodyNode: SyntaxNode,
  source: string,
): ChannelEntry[] => {
  const entries: ChannelEntry[] = [];
  const namedChildren = channelBodyNode.namedChildren;

  for (let index = 0; index < namedChildren.length; index += 1) {
    const entryNode = namedChildren[index];
    if (!entryNode) {
      continue;
    }

    const entryRange = toRange(entryNode, source);

    if (entryNode.type === "channel_table_statement") {
      const tableNameNode = entryNode.childForFieldName("table_name");
      entries.push({
        kind: "table",
        tableName: isPresentNode(tableNameNode)
          ? textOf(tableNameNode, source)
          : "",
        tableNameRange: isPresentNode(tableNameNode)
          ? toRange(tableNameNode, source)
          : entryRange,
        ...entryRange,
      });
      continue;
    }

    if (
      entryNode.type === "identifier" &&
      textOf(entryNode, source).toLowerCase() === "table" &&
      namedChildren[index + 1]?.type === "identifier"
    ) {
      const tableNameNode = namedChildren[index + 1];
      const tableRange = mergeRanges(
        entryRange,
        toRange(tableNameNode, source),
      );
      entries.push({
        kind: "table",
        tableName: textOf(tableNameNode, source),
        tableNameRange: toRange(tableNameNode, source),
        ...tableRange,
      });
      index += 1;
      continue;
    }

    if (
      entryNode.type === "import_statement" ||
      entryNode.type === "export_statement"
    ) {
      const statement = parseImportExportNode(entryNode, source);
      const clauseText = statement.clauseText?.toLowerCase() ?? "";

      if (
        statement.mode === "other" &&
        (clauseText.startsWith("limit ") ||
          clauseText.startsWith("keep filtered "))
      ) {
        if (clauseText.startsWith("keep filtered ")) {
          entries.push({
            kind: "keep-filtered",
            value: (statement.clauseText ?? "")
              .slice("keep filtered ".length)
              .trim(),
            valueRange: entryRange,
            ...entryRange,
          });
        } else {
          const payload = (statement.clauseText ?? "")
            .slice("limit ".length)
            .trim();
          const actionMarker = " action ";
          const actionIndex = payload.toLowerCase().indexOf(actionMarker);
          const limitValue =
            actionIndex === -1 ? payload : payload.slice(0, actionIndex).trim();
          const limitAction =
            actionIndex === -1
              ? undefined
              : payload.slice(actionIndex + actionMarker.length).trim();

          entries.push({
            kind: "limit",
            direction: statement.kind === "export" ? "export" : "import",
            value: limitValue,
            valueRange: entryRange,
            action: limitAction,
            actionRange: limitAction ? entryRange : undefined,
            ...entryRange,
          });
        }
        continue;
      }

      if (statement.kind === "import") {
        entries.push({
          kind: "import",
          mode: statement.mode,
          filterName: statement.filterName,
          filterNameRange: statement.filterNameRange,
          whereExpression: statement.whereExpression,
          whereExpressionRange: statement.whereExpressionRange,
          clauseText: statement.clauseText,
          ...entryRange,
        });
      } else {
        entries.push({
          kind: "export",
          mode: statement.mode,
          filterName: statement.filterName,
          filterNameRange: statement.filterNameRange,
          whereExpression: statement.whereExpression,
          whereExpressionRange: statement.whereExpressionRange,
          clauseText: statement.clauseText,
          ...entryRange,
        });
      }
      continue;
    }

    if (entryNode.type === "channel_limit_statement") {
      const directionNode = entryNode.childForFieldName("direction");
      const limitValueNode = entryNode.childForFieldName("limit_value");
      const limitActionNode = entryNode.childForFieldName("limit_action");

      const directionText = isPresentNode(directionNode)
        ? textOf(directionNode, source).toLowerCase()
        : "import";
      const direction = CHANNEL_DIRECTIONS.has(directionText)
        ? (directionText as "import" | "receive" | "export")
        : "import";

      entries.push({
        kind: "limit",
        direction,
        value: isPresentNode(limitValueNode)
          ? textOf(limitValueNode, source)
          : "",
        valueRange: isPresentNode(limitValueNode)
          ? toRange(limitValueNode, source)
          : entryRange,
        action: isPresentNode(limitActionNode)
          ? textOf(limitActionNode, source)
          : undefined,
        actionRange: isPresentNode(limitActionNode)
          ? toRange(limitActionNode, source)
          : undefined,
        ...entryRange,
      });
      continue;
    }

    if (entryNode.type === "channel_debug_statement") {
      const debugClauseNode = entryNode.childForFieldName("debug_clause");
      entries.push({
        kind: "debug",
        clauseText: isPresentNode(debugClauseNode)
          ? textOf(debugClauseNode, source)
          : textOf(entryNode, source),
        ...entryRange,
      });
      continue;
    }

    if (
      entryNode.type === "identifier" &&
      textOf(entryNode, source).toLowerCase() === "debug" &&
      namedChildren[index + 1]
    ) {
      const clauseNode = namedChildren[index + 1];
      const debugRange = mergeRanges(entryRange, toRange(clauseNode, source));
      entries.push({
        kind: "debug",
        clauseText: textOf(clauseNode, source),
        ...debugRange,
      });
      index += 1;
      continue;
    }

    if (entryNode.type === "channel_keep_filtered_statement") {
      const switchValueNode = entryNode.childForFieldName("switch_value");
      entries.push({
        kind: "keep-filtered",
        value: isPresentNode(switchValueNode)
          ? textOf(switchValueNode, source)
          : "",
        valueRange: isPresentNode(switchValueNode)
          ? toRange(switchValueNode, source)
          : entryRange,
        ...entryRange,
      });
      continue;
    }

    entries.push({
      kind: "other",
      text: textOf(entryNode, source),
      ...entryRange,
    });
  }

  return entries;
};

export const parseProtocolStatements = (
  blockNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): ProtocolStatement[] => {
  const statements: ProtocolStatement[] = [];
  const nodes = protocolStatementNodesOf(blockNode);
  const childNodes = blockNode.namedChildren;
  const fallbackChannelIndices = new Set<number>();

  for (const statementNode of nodes) {
    const statementRange = toRange(statementNode, source);

    if (statementNode.type === "local_as_statement") {
      const asnNode = statementNode.childForFieldName("asn");
      if (!isPresentNode(asnNode)) {
        pushMissingFieldIssue(
          issues,
          statementNode,
          "Missing ASN in local as statement",
          source,
        );
      }

      statements.push({
        kind: "local-as",
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : "",
        asnRange: isPresentNode(asnNode)
          ? toRange(asnNode, source)
          : statementRange,
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "neighbor_statement") {
      const addressNode = statementNode.childForFieldName("address");
      const asnNode = statementNode.childForFieldName("asn");

      if (!isPresentNode(addressNode)) {
        pushMissingFieldIssue(
          issues,
          statementNode,
          "Missing neighbor address",
          source,
        );
      }

      const addressText = isPresentNode(addressNode)
        ? textOf(addressNode, source)
        : "";
      const addressKind =
        isPresentNode(addressNode) && isIpLiteralCandidate(addressText)
          ? "ip"
          : "other";

      statements.push({
        kind: "neighbor",
        address: addressText,
        addressRange: isPresentNode(addressNode)
          ? toRange(addressNode, source)
          : statementRange,
        addressKind,
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : undefined,
        asnRange: isPresentNode(asnNode) ? toRange(asnNode, source) : undefined,
        ...statementRange,
      });
      continue;
    }

    if (
      statementNode.type === "import_statement" ||
      statementNode.type === "export_statement"
    ) {
      statements.push(parseImportExportNode(statementNode, source));
      continue;
    }

    if (statementNode.type === "channel_statement") {
      const channelTypeNode = statementNode.childForFieldName("channel_type");
      const channelBodyNode = statementNode.childForFieldName("body");
      const channelTypeText = isPresentNode(channelTypeNode)
        ? textOf(channelTypeNode, source)
        : "";

      statements.push({
        kind: "channel",
        channelType: normalizeChannelType(channelTypeText),
        channelTypeRange: isPresentNode(channelTypeNode)
          ? toRange(channelTypeNode, source)
          : statementRange,
        entries: isPresentNode(channelBodyNode)
          ? parseChannelEntries(channelBodyNode, source)
          : [],
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "expression_statement") {
      statements.push({
        kind: "other",
        text: textOf(statementNode, source),
        ...statementRange,
      });
      continue;
    }
  }

  for (let index = 0; index < childNodes.length - 1; index += 1) {
    const maybeChannelTypeNode = childNodes[index];
    const maybeChannelBodyNode = childNodes[index + 1];
    if (!maybeChannelTypeNode || !maybeChannelBodyNode) {
      continue;
    }

    if (
      maybeChannelTypeNode.type !== "identifier" ||
      maybeChannelBodyNode.type !== "block"
    ) {
      continue;
    }

    const channelTypeText = textOf(maybeChannelTypeNode, source);
    const channelType = normalizeChannelType(channelTypeText);
    if (channelType === "unknown") {
      continue;
    }

    const channelRange = mergeRanges(
      toRange(maybeChannelTypeNode, source),
      toRange(maybeChannelBodyNode, source),
    );

    statements.push({
      kind: "channel",
      channelType,
      channelTypeRange: toRange(maybeChannelTypeNode, source),
      entries: parseChannelEntries(maybeChannelBodyNode, source),
      ...channelRange,
    });

    fallbackChannelIndices.add(index);
    fallbackChannelIndices.add(index + 1);
    index += 1;
  }

  for (let index = 0; index < childNodes.length; index += 1) {
    const currentNode = childNodes[index];

    if (
      PROTOCOL_STATEMENT_TYPES.has(currentNode.type) ||
      fallbackChannelIndices.has(index)
    ) {
      continue;
    }

    let endIndex = index;

    while (endIndex + 1 < childNodes.length) {
      const nextNode = childNodes[endIndex + 1];
      if (
        PROTOCOL_STATEMENT_TYPES.has(nextNode.type) ||
        fallbackChannelIndices.has(endIndex + 1)
      ) {
        break;
      }

      endIndex += 1;
    }

    const lastNode = childNodes[endIndex];
    const text = source.slice(currentNode.startIndex, lastNode.endIndex).trim();

    if (text.length > 0) {
      statements.push({
        kind: "other",
        text,
        ...mergeRanges(toRange(currentNode, source), toRange(lastNode, source)),
      });
    }

    index = endIndex;
  }

  return statements;
};

export const parseProtocolDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): ProtocolDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const protocolTypeNode = declarationNode.childForFieldName("protocol_type");
  const protocolVariantNode =
    declarationNode.childForFieldName("protocol_variant");
  const nameNode = declarationNode.childForFieldName("name");
  const fromTemplateNode = declarationNode.childForFieldName("from_template");
  const bodyNode = declarationNode.childForFieldName("body");
  const hasFromKeyword = declarationNode.children.some(
    (entry) => entry.type === "from",
  );

  if (!isPresentNode(protocolTypeNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing protocol type for protocol declaration",
      source,
    );
  }

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for protocol declaration",
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
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    fromTemplate: isPresentNode(fromTemplateNode)
      ? textOf(fromTemplateNode, source)
      : undefined,
    fromTemplateRange: isPresentNode(fromTemplateNode)
      ? toRange(fromTemplateNode, source)
      : undefined,
    statements: isPresentNode(bodyNode)
      ? parseProtocolStatements(bodyNode, source, issues)
      : [],
    ...declarationRange,
  };
};
