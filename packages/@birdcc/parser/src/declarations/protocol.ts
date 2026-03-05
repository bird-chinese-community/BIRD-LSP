import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  ChannelEntry,
  ExportStatement,
  ImportStatement,
  ParseIssue,
  ProtocolStatement,
  SourceRange,
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

const isRangeImmediatelyAfter = (
  previous: SourceRange,
  next: SourceRange,
): boolean =>
  previous.endLine === next.line &&
  (next.column === previous.endColumn + 1 ||
    next.column === previous.endColumn);

const removeNeighborTailMissingSemicolonIssue = (
  issues: ParseIssue[],
  tailStartRange: SourceRange,
): void => {
  const issueIndex = issues.findIndex(
    (item) =>
      item.code === "syntax/missing-semicolon" &&
      item.line === tailStartRange.line &&
      (item.column === tailStartRange.column - 1 ||
        item.column === tailStartRange.column) &&
      item.endLine === tailStartRange.line &&
      (item.endColumn === tailStartRange.column - 1 ||
        item.endColumn === tailStartRange.column),
  );

  if (issueIndex === -1) {
    return;
  }

  issues.splice(issueIndex, 1);
};

const parseNeighborTailClause = (
  text: string,
  currentAddress: string,
): {
  hasKnownClause: boolean;
  mergedAddress?: string;
  interfaceValue?: string;
  asn?: string;
  port?: string;
  canConsumeWholeTail: boolean;
} => {
  const trimmed = text.trim();
  const firstStatementText = (trimmed.split(";")[0] ?? "").trim();
  if (firstStatementText.length === 0) {
    return { hasKnownClause: false, canConsumeWholeTail: false };
  }

  let clauseSource = firstStatementText;
  let mergedAddress: string | undefined;
  const ipv6ContinuationMatch = clauseSource.match(/^(:[0-9A-Fa-f:.]+)/);
  if (ipv6ContinuationMatch?.[1]) {
    mergedAddress = `${currentAddress}${ipv6ContinuationMatch[1]}`;
    clauseSource = clauseSource.slice(ipv6ContinuationMatch[1].length).trim();
  }

  if (
    !mergedAddress &&
    !/^(%|\bas\b|\bport\b)/i.test(clauseSource) &&
    !/\b(as|port)\b/i.test(clauseSource)
  ) {
    return { hasKnownClause: false, canConsumeWholeTail: false };
  }

  const interfaceMatch = clauseSource.match(
    /^%\s+(.+?)(?=\s+\b(?:as|port)\b|$)/i,
  );
  const asnMatch = clauseSource.match(/\bas\s+([^\s;]+)/i);
  const portMatch = clauseSource.match(/\bport\s+([^\s;]+)/i);

  return {
    hasKnownClause: Boolean(
      mergedAddress || interfaceMatch || asnMatch || portMatch,
    ),
    mergedAddress,
    interfaceValue: interfaceMatch?.[1]?.trim(),
    asn: asnMatch?.[1]?.trim(),
    port: portMatch?.[1]?.trim(),
    canConsumeWholeTail: firstStatementText === trimmed,
  };
};

const mergeNeighborTailStatements = (
  statements: ProtocolStatement[],
  issues: ParseIssue[],
): ProtocolStatement[] => {
  const tailCandidates = statements
    .filter((item): item is Extract<ProtocolStatement, { kind: "other" }> => {
      return item.kind === "other";
    })
    .sort((left, right) => {
      if (left.line !== right.line) {
        return left.line - right.line;
      }
      return left.column - right.column;
    });

  const consumedTails = new Set<
    Extract<ProtocolStatement, { kind: "other" }>
  >();

  for (const statement of statements) {
    if (statement.kind !== "neighbor") {
      continue;
    }

    let mergedRange: SourceRange = statement;
    for (const tail of tailCandidates) {
      if (consumedTails.has(tail)) {
        continue;
      }

      if (!isRangeImmediatelyAfter(mergedRange, tail)) {
        continue;
      }

      const tailClause = parseNeighborTailClause(tail.text, statement.address);
      if (!tailClause.hasKnownClause) {
        continue;
      }

      if (
        tailClause.mergedAddress &&
        isIpLiteralCandidate(tailClause.mergedAddress)
      ) {
        statement.address = tailClause.mergedAddress;
        statement.addressKind = "ip";
      }

      if (tailClause.interfaceValue && !statement.interface) {
        statement.interface = tailClause.interfaceValue;
        statement.interfaceRange = tail;
      }

      if (tailClause.asn && !statement.asn) {
        statement.asn = tailClause.asn;
        statement.asnRange = tail;
      }

      if (tailClause.port && !statement.port) {
        statement.port = tailClause.port;
        statement.portRange = tail;
      }

      removeNeighborTailMissingSemicolonIssue(issues, tail);

      if (tailClause.canConsumeWholeTail) {
        statement.endLine = tail.endLine;
        statement.endColumn = tail.endColumn;
        mergedRange = statement;
        consumedTails.add(tail);
      }
    }
  }

  return statements.filter((statement) => {
    if (statement.kind !== "other") {
      return true;
    }
    return !consumedTails.has(statement);
  });
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
      const interfaceNode = statementNode.childForFieldName("interface");
      const asnNode = statementNode.childForFieldName("asn");
      const portNode = statementNode.childForFieldName("port");

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
        interface: isPresentNode(interfaceNode)
          ? textOf(interfaceNode, source)
          : undefined,
        interfaceRange: isPresentNode(interfaceNode)
          ? toRange(interfaceNode, source)
          : undefined,
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : undefined,
        asnRange: isPresentNode(asnNode) ? toRange(asnNode, source) : undefined,
        port: isPresentNode(portNode) ? textOf(portNode, source) : undefined,
        portRange: isPresentNode(portNode)
          ? toRange(portNode, source)
          : undefined,
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

  return mergeNeighborTailStatements(statements, issues);
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
