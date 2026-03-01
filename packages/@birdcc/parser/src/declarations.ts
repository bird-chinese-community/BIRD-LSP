import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  BirdDeclaration,
  ChannelEntry,
  ExportStatement,
  FilterBodyStatement,
  ImportStatement,
  ParseIssue,
  ProtocolStatement,
  SourceRange,
} from "./types.js";
import { isPresentNode, mergeRanges, stripQuotes, textOf, toRange } from "./tree.js";
import { pushMissingFieldIssue } from "./issues.js";

type IncludeDeclaration = Extract<BirdDeclaration, { kind: "include" }>;
type DefineDeclaration = Extract<BirdDeclaration, { kind: "define" }>;
type RouterIdDeclaration = Extract<BirdDeclaration, { kind: "router-id" }>;
type TableDeclaration = Extract<BirdDeclaration, { kind: "table" }>;
type ProtocolDeclaration = Extract<BirdDeclaration, { kind: "protocol" }>;
type TemplateDeclaration = Extract<BirdDeclaration, { kind: "template" }>;
type FilterDeclaration = Extract<BirdDeclaration, { kind: "filter" }>;
type FunctionDeclaration = Extract<BirdDeclaration, { kind: "function" }>;
type ExtractedLiteral = FilterDeclaration["literals"][number];
type MatchExpression = FilterDeclaration["matches"][number];

const PROTOCOL_STATEMENT_TYPES = new Set([
  "local_as_statement",
  "neighbor_statement",
  "import_statement",
  "export_statement",
  "channel_statement",
]);

const TABLE_TYPES = new Set([
  "routing",
  "ipv4",
  "ipv6",
  "vpn4",
  "vpn6",
  "roa4",
  "roa6",
  "flow4",
  "flow6",
]);

const CHANNEL_TYPES = new Set([
  "ipv4",
  "ipv6",
  "vpn4",
  "vpn6",
  "roa4",
  "roa6",
  "flow4",
  "flow6",
  "mpls",
]);

const CHANNEL_DIRECTIONS = new Set(["import", "receive", "export"]);

const protocolStatementNodesOf = (blockNode: SyntaxNode): SyntaxNode[] => {
  return blockNode.namedChildren.filter((child) => PROTOCOL_STATEMENT_TYPES.has(child.type));
};

const protocolTypeTextAndRange = (
  protocolTypeNode: SyntaxNode | null,
  protocolVariantNode: SyntaxNode | null,
  source: string,
  declarationRange: SourceRange,
): { protocolType: string; protocolTypeRange: SourceRange } => {
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

const normalizeTableType = (value: string): TableDeclaration["tableType"] => {
  const lowered = value.toLowerCase();
  return TABLE_TYPES.has(lowered) ? (lowered as TableDeclaration["tableType"]) : "unknown";
};

const normalizeChannelType = (
  value: string,
): Extract<ProtocolStatement, { kind: "channel" }>["channelType"] => {
  const lowered = value.toLowerCase();
  return CHANNEL_TYPES.has(lowered)
    ? (lowered as Extract<ProtocolStatement, { kind: "channel" }>["channelType"])
    : "unknown";
};

const nodeOrSelf = (node: SyntaxNode): SyntaxNode => {
  if (node.namedChildCount === 1) {
    const child = node.namedChildren[0];
    if (child) {
      return child;
    }
  }

  return node;
};

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

  if (clauseNode.type === "filter_name_clause" || clauseNode.type === "filter_block_clause") {
    const filterNameNode = clauseNode.childForFieldName("filter_name");

    return {
      ...base,
      mode: "filter",
      filterName: isPresentNode(filterNameNode) ? textOf(filterNameNode, source) : undefined,
      filterNameRange: isPresentNode(filterNameNode) ? toRange(filterNameNode, source) : undefined,
    };
  }

  if (clauseNode.type === "where_clause") {
    const whereExpressionNode = clauseNode.childForFieldName("where_expression");

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
      filterName: maybeName.length > 0 && !maybeName.startsWith("{") ? maybeName : undefined,
      clauseText,
    };
  }

  return {
    ...base,
    mode: "other",
    clauseText,
  };
};

const parseChannelEntries = (channelBodyNode: SyntaxNode, source: string): ChannelEntry[] => {
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
        tableName: isPresentNode(tableNameNode) ? textOf(tableNameNode, source) : "",
        tableNameRange: isPresentNode(tableNameNode) ? toRange(tableNameNode, source) : entryRange,
        ...entryRange,
      });
      continue;
    }

    // Old wasm fallback: table <name>;
    if (
      entryNode.type === "identifier" &&
      textOf(entryNode, source).toLowerCase() === "table" &&
      namedChildren[index + 1]?.type === "identifier"
    ) {
      const tableNameNode = namedChildren[index + 1];
      const tableRange = mergeRanges(entryRange, toRange(tableNameNode, source));
      entries.push({
        kind: "table",
        tableName: textOf(tableNameNode, source),
        tableNameRange: toRange(tableNameNode, source),
        ...tableRange,
      });
      index += 1;
      continue;
    }

    if (entryNode.type === "import_statement" || entryNode.type === "export_statement") {
      const statement = parseImportExportNode(entryNode, source);
      const clauseText = statement.clauseText?.toLowerCase() ?? "";

      if (
        statement.mode === "other" &&
        (clauseText.startsWith("limit ") || clauseText.startsWith("keep filtered "))
      ) {
        if (clauseText.startsWith("keep filtered ")) {
          entries.push({
            kind: "keep-filtered",
            value: (statement.clauseText ?? "").slice("keep filtered ".length).trim(),
            valueRange: entryRange,
            ...entryRange,
          });
        } else {
          const payload = (statement.clauseText ?? "").slice("limit ".length).trim();
          const actionMarker = " action ";
          const actionIndex = payload.toLowerCase().indexOf(actionMarker);
          const limitValue = actionIndex === -1 ? payload : payload.slice(0, actionIndex).trim();
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
        value: isPresentNode(limitValueNode) ? textOf(limitValueNode, source) : "",
        valueRange: isPresentNode(limitValueNode) ? toRange(limitValueNode, source) : entryRange,
        action: isPresentNode(limitActionNode) ? textOf(limitActionNode, source) : undefined,
        actionRange: isPresentNode(limitActionNode) ? toRange(limitActionNode, source) : undefined,
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

    // Old wasm fallback: debug <clause>;
    if (entryNode.type === "identifier" && textOf(entryNode, source).toLowerCase() === "debug") {
      const nextNode = namedChildren[index + 1];
      const debugRange = nextNode ? mergeRanges(entryRange, toRange(nextNode, source)) : entryRange;
      entries.push({
        kind: "debug",
        clauseText: nextNode ? textOf(nextNode, source) : "",
        ...debugRange,
      });
      if (nextNode) {
        index += 1;
      }
      continue;
    }

    if (entryNode.type === "channel_keep_filtered_statement") {
      const switchValueNode = entryNode.childForFieldName("switch_value");
      entries.push({
        kind: "keep-filtered",
        value: isPresentNode(switchValueNode) ? textOf(switchValueNode, source) : "",
        valueRange: isPresentNode(switchValueNode) ? toRange(switchValueNode, source) : entryRange,
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

      const addressText = isPresentNode(addressNode) ? textOf(addressNode, source) : "";
      const addressKind =
        isPresentNode(addressNode) &&
        (addressNode.type === "ip_literal" ||
          addressText.includes(".") ||
          addressText.includes(":"))
          ? "ip"
          : "other";

      statements.push({
        kind: "neighbor",
        address: addressText,
        addressRange: isPresentNode(addressNode) ? toRange(addressNode, source) : statementRange,
        addressKind,
        asn: isPresentNode(asnNode) ? textOf(asnNode, source) : undefined,
        asnRange: isPresentNode(asnNode) ? toRange(asnNode, source) : undefined,
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "import_statement" || statementNode.type === "export_statement") {
      statements.push(parseImportExportNode(statementNode, source));
      continue;
    }

    if (statementNode.type === "channel_statement") {
      const channelTypeNode = statementNode.childForFieldName("channel_type");
      const channelBodyNode = statementNode.childForFieldName("body");
      const channelTypeText = isPresentNode(channelTypeNode) ? textOf(channelTypeNode, source) : "";

      statements.push({
        kind: "channel",
        channelType: normalizeChannelType(channelTypeText),
        channelTypeRange: isPresentNode(channelTypeNode)
          ? toRange(channelTypeNode, source)
          : statementRange,
        entries: isPresentNode(channelBodyNode) ? parseChannelEntries(channelBodyNode, source) : [],
        ...statementRange,
      });
    }
  }

  // Old wasm fallback: channel can appear as `identifier` + `block` pair in body children.
  const childNodes = blockNode.children;
  for (let index = 0; index < childNodes.length - 1; index += 1) {
    const maybeTypeNode = childNodes[index];
    const maybeBlockNode = childNodes[index + 1];
    if (!maybeTypeNode || !maybeBlockNode) {
      continue;
    }

    if (maybeTypeNode.type !== "identifier" || maybeBlockNode.type !== "block") {
      continue;
    }

    const channelTypeText = textOf(maybeTypeNode, source);
    const channelType = normalizeChannelType(channelTypeText);
    if (channelType === "unknown") {
      continue;
    }

    const channelRange = mergeRanges(
      toRange(maybeTypeNode, source),
      toRange(maybeBlockNode, source),
    );
    statements.push({
      kind: "channel",
      channelType,
      channelTypeRange: toRange(maybeTypeNode, source),
      entries: parseChannelEntries(maybeBlockNode, source),
      ...channelRange,
    });
    index += 1;
  }

  return statements;
};

const parseControlStatements = (bodyNode: SyntaxNode, source: string): FilterBodyStatement[] => {
  const statements: FilterBodyStatement[] = [];
  const bodyText = textOf(bodyNode, source);
  const bodyRange = toRange(bodyNode, source);

  for (const statementNode of bodyNode.namedChildren) {
    const statementRange = toRange(statementNode, source);
    const text = textOf(statementNode, source).trim();
    const lowered = text.toLowerCase();

    if (statementNode.type === "if_statement" || lowered === "if") {
      statements.push({
        kind: "if",
        conditionText: bodyText.includes(" then ")
          ? bodyText.split(" then ")[0]?.split("if ")[1]?.trim()
          : undefined,
        thenText: "",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "accept_statement" || lowered === "accept") {
      statements.push({
        kind: "accept",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "reject_statement" || lowered === "reject") {
      statements.push({
        kind: "reject",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "return_statement" || lowered === "return") {
      statements.push({
        kind: "return",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "case_statement" || lowered === "case") {
      statements.push({
        kind: "case",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "expression_statement") {
      const expressionNode = statementNode.childForFieldName("expression");
      statements.push({
        kind: "expression",
        expressionText: isPresentNode(expressionNode)
          ? textOf(expressionNode, source)
          : textOf(statementNode, source),
        ...statementRange,
      });
      continue;
    }
  }

  // Fallback by raw text to preserve skeleton coverage under older wasm grammar.
  if (bodyText.includes("if ") && !statements.some((item) => item.kind === "if")) {
    statements.push({ kind: "if", conditionText: undefined, thenText: "", ...bodyRange });
  }
  if (bodyText.includes("case ") && !statements.some((item) => item.kind === "case")) {
    statements.push({ kind: "case", subjectText: undefined, ...bodyRange });
  }
  if (bodyText.includes("accept;") && !statements.some((item) => item.kind === "accept")) {
    statements.push({ kind: "accept", ...bodyRange });
  }
  if (bodyText.includes("reject;") && !statements.some((item) => item.kind === "reject")) {
    statements.push({ kind: "reject", ...bodyRange });
  }
  if (bodyText.includes("return") && !statements.some((item) => item.kind === "return")) {
    statements.push({ kind: "return", valueText: undefined, ...bodyRange });
  }

  return statements;
};

const collectLiteralsAndMatches = (
  bodyNode: SyntaxNode,
  source: string,
): { literals: ExtractedLiteral[]; matches: MatchExpression[] } => {
  const literals: ExtractedLiteral[] = [];
  const matches: MatchExpression[] = [];
  const isIpLike = (token: string): boolean => {
    if (token.length === 0) {
      return false;
    }

    const first = token[0];
    const hasDot = token.includes(".");
    const hasColon = token.includes(":");
    if (!hasDot && !hasColon) {
      return false;
    }

    const isDigit = first >= "0" && first <= "9";
    const isHexLetter = (first >= "a" && first <= "f") || (first >= "A" && first <= "F");
    return isDigit || (hasColon && isHexLetter);
  };

  const extractPrefixSuffix = (token: string): string | null => {
    const slashIndex = token.indexOf("/");
    if (slashIndex === -1) {
      return null;
    }

    let cursor = slashIndex + 1;
    while (cursor < token.length && token[cursor] >= "0" && token[cursor] <= "9") {
      cursor += 1;
    }

    if (cursor === slashIndex + 1) {
      return null;
    }

    if (cursor < token.length && (token[cursor] === "+" || token[cursor] === "-")) {
      cursor += 1;
    } else if (cursor < token.length && token[cursor] === "{") {
      cursor += 1;
      while (cursor < token.length && token[cursor] !== "}") {
        cursor += 1;
      }
      if (cursor < token.length && token[cursor] === "}") {
        cursor += 1;
      }
    }

    return token.slice(slashIndex, cursor);
  };

  const collectNode = (node: SyntaxNode): void => {
    const namedChildren = node.namedChildren;

    for (let index = 0; index < namedChildren.length; index += 1) {
      const current = namedChildren[index];
      if (!current) {
        continue;
      }

      const currentText = textOf(current, source);
      const currentRange = toRange(current, source);

      if (current.type === "ip_literal") {
        literals.push({
          kind: "ip",
          value: currentText,
          ...currentRange,
        });
      }

      if (current.type === "prefix_literal") {
        literals.push({
          kind: "prefix",
          value: currentText,
          ...currentRange,
        });
      }

      if ((current.type === "number" || current.type === "raw_token") && isIpLike(currentText)) {
        const ownSuffix = extractPrefixSuffix(currentText);
        if (ownSuffix) {
          const ipPart = currentText.slice(0, currentText.indexOf("/"));
          literals.push({
            kind: "prefix",
            value: `${ipPart}${ownSuffix}`,
            ...currentRange,
          });
        } else {
          const nextNode = namedChildren[index + 1];
          const nextText = nextNode ? textOf(nextNode, source) : "";
          const nextSuffix = nextNode ? extractPrefixSuffix(nextText) : null;

          if (nextSuffix) {
            const mergedRange = mergeRanges(currentRange, toRange(nextNode, source));
            literals.push({
              kind: "prefix",
              value: `${currentText}${nextSuffix}`,
              ...mergedRange,
            });
          } else {
            literals.push({
              kind: "ip",
              value: currentText,
              ...currentRange,
            });
          }
        }
      }

      if (current.type === "binary_expression") {
        const operatorNode = current.childForFieldName("operator");
        const leftNode = current.childForFieldName("left");
        const rightNode = current.childForFieldName("right");

        if (isPresentNode(operatorNode) && textOf(operatorNode, source) === "~") {
          matches.push({
            operator: "~",
            left: isPresentNode(leftNode) ? textOf(leftNode, source) : "",
            right: isPresentNode(rightNode) ? textOf(rightNode, source) : "",
            ...toRange(current, source),
          });
        }
      }

      // Old wasm fallback: `~` is represented as a raw token between two named nodes.
      if (currentText.trim() === "~") {
        const leftNode = namedChildren[index - 1];
        const rightNode = namedChildren[index + 1];
        if (leftNode && rightNode) {
          matches.push({
            operator: "~",
            left: textOf(leftNode, source),
            right: textOf(rightNode, source),
            ...currentRange,
          });
        }
      }

      collectNode(current);
    }
  };

  collectNode(bodyNode);

  const literalKeys = new Set<string>();
  const uniqueLiterals: ExtractedLiteral[] = [];
  for (const literal of literals) {
    const key = `${literal.kind}:${literal.value}:${literal.line}:${literal.column}:${literal.endLine}:${literal.endColumn}`;
    if (literalKeys.has(key)) {
      continue;
    }

    literalKeys.add(key);
    uniqueLiterals.push(literal);
  }

  const matchKeys = new Set<string>();
  const uniqueMatches: MatchExpression[] = [];
  for (const match of matches) {
    const key = `${match.operator}:${match.left}:${match.right}:${match.line}:${match.column}:${match.endLine}:${match.endColumn}`;
    if (matchKeys.has(key)) {
      continue;
    }

    matchKeys.add(key);
    uniqueMatches.push(match);
  }

  return {
    literals: uniqueLiterals,
    matches: uniqueMatches,
  };
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

const isIpv4Token = (value: string): boolean => {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }

  for (const part of parts) {
    if (part.length === 0) {
      return false;
    }

    for (const char of part) {
      if (char < "0" || char > "9") {
        return false;
      }
    }
  }

  return true;
};

const isNumericToken = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }

  for (const char of value) {
    if (char < "0" || char > "9") {
      return false;
    }
  }

  return true;
};

const parseRouterIdFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): RouterIdDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const fullText = textOf(statementNode, source).trim();
  const lowered = fullText.toLowerCase();
  if (!lowered.startsWith("router id")) {
    return null;
  }

  const body = fullText.endsWith(";") ? fullText.slice(0, -1).trim() : fullText;
  const value = body.slice("router id".length).trim();

  if (value.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing value for router id declaration",
      ...declarationRange,
    });

    return {
      kind: "router-id",
      value: "",
      valueKind: "unknown",
      valueRange: declarationRange,
      ...declarationRange,
    };
  }

  if (value.toLowerCase() === "from routing" || value.toLowerCase() === "from dynamic") {
    return {
      kind: "router-id",
      value,
      valueKind: "from",
      valueRange: declarationRange,
      fromSource: value.toLowerCase() === "from dynamic" ? "dynamic" : "routing",
      ...declarationRange,
    };
  }

  if (isIpv4Token(value)) {
    return {
      kind: "router-id",
      value,
      valueKind: "ip",
      valueRange: declarationRange,
      ...declarationRange,
    };
  }

  if (isNumericToken(value)) {
    return {
      kind: "router-id",
      value,
      valueKind: "number",
      valueRange: declarationRange,
      ...declarationRange,
    };
  }

  return {
    kind: "router-id",
    value,
    valueKind: "unknown",
    valueRange: declarationRange,
    ...declarationRange,
  };
};

const parseTableFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TableDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const fullText = textOf(statementNode, source).trim();
  const body = fullText.endsWith(";") ? fullText.slice(0, -1).trim() : fullText;
  const tokens = body.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  let tableType: TableDeclaration["tableType"] = "unknown";
  let name = "";
  let attrsText: string | undefined;

  if (tokens[0]?.toLowerCase() === "routing" && tokens[1]?.toLowerCase() === "table") {
    tableType = "routing";
    name = tokens[2] ?? "";
    if (tokens.length > 3) {
      attrsText = tokens.slice(3).join(" ");
    }
  } else if (
    TABLE_TYPES.has(tokens[0]?.toLowerCase() ?? "") &&
    tokens[1]?.toLowerCase() === "table"
  ) {
    tableType = normalizeTableType(tokens[0] ?? "");
    name = tokens[2] ?? "";
    if (tokens.length > 3) {
      attrsText = tokens.slice(3).join(" ");
    }
  } else if (tokens[0]?.toLowerCase() === "table") {
    tableType = "unknown";
    name = tokens[1] ?? "";
  } else {
    return null;
  }

  if (name.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing name for table declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "table",
    tableType,
    tableTypeRange: declarationRange,
    name,
    nameRange: declarationRange,
    attrsText,
    attrsRange: attrsText ? declarationRange : undefined,
    ...declarationRange,
  };
};

const parseRouterIdDeclaration = (
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
      : "routing";

    return {
      kind: "router-id",
      value: textOf(valueNode, source),
      valueKind: "from",
      valueRange: toRange(valueNode, source),
      fromSource: fromSourceText === "dynamic" ? "dynamic" : "routing",
      ...declarationRange,
    };
  }

  if (valueNode.type === "ipv4_literal") {
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

const parseTableDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TableDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const tableTypeNode = declarationNode.childForFieldName("table_type");
  const nameNode = declarationNode.childForFieldName("name");
  const attrsNode = declarationNode.childForFieldName("attrs");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(issues, declarationNode, "Missing name for table declaration", source);
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
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    attrsText: isPresentNode(attrsNode) ? textOf(attrsNode, source) : undefined,
    attrsRange: isPresentNode(attrsNode) ? toRange(attrsNode, source) : undefined,
    ...declarationRange,
  };
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

  const extracted = isPresentNode(bodyNode)
    ? collectLiteralsAndMatches(bodyNode, source)
    : { literals: [], matches: [] };

  return {
    kind: "filter",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    statements: isPresentNode(bodyNode) ? parseControlStatements(bodyNode, source) : [],
    literals: extracted.literals,
    matches: extracted.matches,
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

  const extracted = isPresentNode(bodyNode)
    ? collectLiteralsAndMatches(bodyNode, source)
    : { literals: [], matches: [] };

  return {
    kind: "function",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode) ? toRange(nameNode, source) : declarationRange,
    statements: isPresentNode(bodyNode) ? parseControlStatements(bodyNode, source) : [],
    literals: extracted.literals,
    matches: extracted.matches,
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

    if (child.type === "router_id_declaration") {
      declarations.push(parseRouterIdDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "table_declaration") {
      declarations.push(parseTableDeclaration(child, source, issues));
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
      continue;
    }

    if (child.type === "top_level_statement") {
      const routerFromTopLevel = parseRouterIdFromStatement(child, source, issues);
      if (routerFromTopLevel) {
        declarations.push(routerFromTopLevel);
        continue;
      }

      const tableFromTopLevel = parseTableFromStatement(child, source, issues);
      if (tableFromTopLevel) {
        declarations.push(tableFromTopLevel);
      }
    }
  }

  return declarations;
};
