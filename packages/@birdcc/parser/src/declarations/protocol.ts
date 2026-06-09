import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  ChannelEntry,
  ChannelStatement,
  ExportStatement,
  ImportStatement,
  ParseIssue,
  ProtocolStatement,
  SourceRange,
  StaticRouteStatement,
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

const COMPOUND_CHANNEL_HEADER =
  /\b(ipv6\s+sadr|ipv4\s+mpls|ipv6\s+mpls|vpn4\s+mpls|vpn6\s+mpls)\s*\{/gi;

const lineStartsOf = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
};

const indexToRange = (
  source: string,
  lineStarts: number[],
  startIndex: number,
  endIndex: number,
): SourceRange => {
  const positionOf = (index: number): { line: number; column: number } => {
    let lineIndex = 0;
    for (let cursor = 0; cursor < lineStarts.length; cursor += 1) {
      const start = lineStarts[cursor] ?? 0;
      if (start > index) {
        break;
      }
      lineIndex = cursor;
    }

    const lineStart = lineStarts[lineIndex] ?? 0;
    return {
      line: lineIndex + 1,
      column: index - lineStart + 1,
    };
  };

  const start = positionOf(startIndex);
  const end = positionOf(endIndex);
  return {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

const findMatchingBraceIndex = (
  source: string,
  openBraceIndex: number,
): number => {
  let balance = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      balance += 1;
      continue;
    }

    if (char !== "}") {
      continue;
    }

    balance -= 1;
    if (balance === 0) {
      return index;
    }
  }

  return -1;
};

const rangeContains = (outer: SourceRange, inner: SourceRange): boolean => {
  const startsBefore =
    outer.line < inner.line ||
    (outer.line === inner.line && outer.column <= inner.column);
  const endsAfter =
    outer.endLine > inner.endLine ||
    (outer.endLine === inner.endLine && outer.endColumn >= inner.endColumn);
  return startsBefore && endsAfter;
};

const fallbackEntryRange = (
  source: string,
  lineStarts: number[],
  bodyStartIndex: number,
  matchIndex: number,
  matchText: string,
): SourceRange =>
  indexToRange(
    source,
    lineStarts,
    bodyStartIndex + matchIndex,
    bodyStartIndex + matchIndex + matchText.length,
  );

const fallbackTokenRange = (
  source: string,
  lineStarts: number[],
  entryStartIndex: number,
  token: string,
): SourceRange => {
  const tokenStart = source.indexOf(token, entryStartIndex);
  return indexToRange(
    source,
    lineStarts,
    tokenStart,
    tokenStart + token.length,
  );
};

const parseFallbackChannelEntries = (
  source: string,
  lineStarts: number[],
  openBraceIndex: number,
  closeBraceIndex: number,
): ChannelEntry[] => {
  const bodyText = source.slice(openBraceIndex + 1, closeBraceIndex);
  const bodyStartIndex = openBraceIndex + 1;
  const entries: ChannelEntry[] = [];
  const entryPattern =
    /\b(?:(domain)\s+([A-Za-z_][A-Za-z0-9_-]*)|(table)\s+([A-Za-z_][A-Za-z0-9_-]*)|(label)\s+(range)\s+([A-Za-z_][A-Za-z0-9_-]*)|(label)\s+(policy)\s+([A-Za-z_][A-Za-z0-9_-]*))\s*;/gi;

  for (const match of bodyText.matchAll(entryPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const entryStart = bodyStartIndex + match.index;
    const entryRange = fallbackEntryRange(
      source,
      lineStarts,
      bodyStartIndex,
      match.index,
      match[0],
    );

    const domainName = match[2];
    if (domainName) {
      entries.push({
        kind: "domain",
        domainName,
        domainNameRange: fallbackTokenRange(
          source,
          lineStarts,
          entryStart,
          domainName,
        ),
        ...entryRange,
      });
      continue;
    }

    const tableName = match[4];
    if (tableName) {
      entries.push({
        kind: "table",
        tableName,
        tableNameRange: fallbackTokenRange(
          source,
          lineStarts,
          entryStart,
          tableName,
        ),
        ...entryRange,
      });
      continue;
    }

    const labelRange = match[7];
    if (labelRange) {
      entries.push({
        kind: "label-range",
        range: labelRange,
        rangeRange: fallbackTokenRange(
          source,
          lineStarts,
          entryStart,
          labelRange,
        ),
        ...entryRange,
      });
      continue;
    }

    const labelPolicy = match[10];
    if (labelPolicy) {
      const policy = labelPolicy.toLowerCase();
      entries.push({
        kind: "label-policy",
        policy:
          policy === "static" ||
          policy === "prefix" ||
          policy === "aggregate" ||
          policy === "vrf"
            ? policy
            : "other",
        policyRange: fallbackTokenRange(
          source,
          lineStarts,
          entryStart,
          labelPolicy,
        ),
        ...entryRange,
      });
    }
  }

  return entries;
};

const parseFallbackCompoundChannelEntries = (
  source: string,
  lineStarts: number[],
  openBraceIndex: number,
  closeBraceIndex: number,
): ChannelEntry[] =>
  parseFallbackChannelEntries(
    source,
    lineStarts,
    openBraceIndex,
    closeBraceIndex,
  );

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

    if (entryNode.type === "expression_statement") {
      const phraseNode = entryNode.namedChildren.find(
        (child) => child.type === "phrase_clause",
      );
      const phraseNodes = phraseNode?.namedChildren ?? [];
      const phraseTexts = phraseNodes.map((node) =>
        textOf(node, source).toLowerCase(),
      );

      if (phraseTexts[0] === "preference" && isPresentNode(phraseNodes[1])) {
        const valueNode = phraseNodes[1];
        entries.push({
          kind: "preference",
          value: textOf(valueNode, source),
          valueRange: toRange(valueNode, source),
          ...entryRange,
        });
        continue;
      }

      if (
        phraseTexts[0] === "rpki" &&
        phraseTexts[1] === "reload" &&
        isPresentNode(phraseNodes[2])
      ) {
        const valueNode = phraseNodes[2];
        entries.push({
          kind: "rpki-reload",
          value: textOf(valueNode, source),
          valueRange: toRange(valueNode, source),
          ...entryRange,
        });
        continue;
      }

      if (phraseTexts[0] === "gateway" && isPresentNode(phraseNodes[1])) {
        const modeNode = phraseNodes[1];
        const modeText = textOf(modeNode, source).toLowerCase();
        entries.push({
          kind: "gateway",
          mode:
            modeText === "direct" || modeText === "recursive"
              ? modeText
              : "other",
          modeRange: toRange(modeNode, source),
          ...entryRange,
        });
        continue;
      }

      if (phraseTexts[0] === "add" && phraseTexts[1] === "paths") {
        const valueNode = phraseNodes[2];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        const loweredValue = valueText?.toLowerCase();
        entries.push({
          kind: "add-paths",
          mode:
            loweredValue === "rx" || loweredValue === "tx"
              ? loweredValue
              : boolValue === true
                ? "on"
                : boolValue === false
                  ? "off"
                  : valueText === undefined
                    ? "on"
                    : "other",
          valueText,
          valueRange: isPresentNode(valueNode)
            ? toRange(valueNode, source)
            : undefined,
          ...entryRange,
        });
        continue;
      }

      if (
        phraseTexts[0] === "igp" &&
        phraseTexts[1] === "table" &&
        isPresentNode(phraseNodes[2])
      ) {
        const tableNameNode = phraseNodes[2];
        entries.push({
          kind: "igp-table",
          tableName: textOf(tableNameNode, source),
          tableNameRange: toRange(tableNameNode, source),
          ...entryRange,
        });
        continue;
      }

      if (phraseTexts[0] === "domain" && isPresentNode(phraseNodes[1])) {
        const domainNameNode = phraseNodes[1];
        entries.push({
          kind: "domain",
          domainName: textOf(domainNameNode, source),
          domainNameRange: toRange(domainNameNode, source),
          ...entryRange,
        });
        continue;
      }

      if (
        phraseTexts[0] === "label" &&
        phraseTexts[1] === "range" &&
        isPresentNode(phraseNodes[2])
      ) {
        const rangeNode = phraseNodes[2];
        entries.push({
          kind: "label-range",
          range: textOf(rangeNode, source),
          rangeRange: toRange(rangeNode, source),
          ...entryRange,
        });
        continue;
      }

      if (
        phraseTexts[0] === "label" &&
        phraseTexts[1] === "policy" &&
        isPresentNode(phraseNodes[2])
      ) {
        const policyNode = phraseNodes[2];
        const policyText = textOf(policyNode, source).toLowerCase();
        entries.push({
          kind: "label-policy",
          policy:
            policyText === "static" ||
            policyText === "prefix" ||
            policyText === "aggregate" ||
            policyText === "vrf"
              ? policyText
              : "other",
          policyRange: toRange(policyNode, source),
          ...entryRange,
        });
        continue;
      }
    }

    entries.push({
      kind: "other",
      text: textOf(entryNode, source),
      ...entryRange,
    });
  }

  return entries;
};

const STATIC_ROUTE_DESTINATIONS = new Set([
  "via",
  "recursive",
  "drop",
  "reject",
  "blackhole",
  "unreachable",
  "prohibit",
  "providers",
  "transit",
]);

const isNode = (node: SyntaxNode | undefined): node is SyntaxNode =>
  node !== undefined;

const stripQuotedText = (value: string): string =>
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;

const parseBoolToken = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return true;
  }

  const lowered = value.toLowerCase();
  if (lowered === "on" || lowered === "yes" || lowered === "true") {
    return true;
  }

  if (lowered === "off" || lowered === "no" || lowered === "false") {
    return false;
  }

  return undefined;
};

const phraseNodesOf = (statementNode: SyntaxNode): SyntaxNode[] => {
  const phraseNode = statementNode.namedChildren.find(
    (child) => child.type === "phrase_clause",
  );
  return phraseNode?.namedChildren ?? [];
};

const phraseTextAt = (
  phraseNodes: SyntaxNode[],
  index: number,
  source: string,
): string | undefined => {
  const node = phraseNodes[index];
  return isNode(node) ? textOf(node, source).toLowerCase() : undefined;
};

const parseBgpBoolOption = (
  phraseNodes: SyntaxNode[],
  source: string,
  option: Extract<ProtocolStatement, { kind: "bgp-option" }>["option"],
  statementRange: SourceRange,
): ProtocolStatement | undefined => {
  const valueNode = phraseNodes.at(-1);
  const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
  const value = parseBoolToken(valueText);
  if (value === undefined) {
    return undefined;
  }

  return {
    kind: "bgp-option",
    option,
    value,
    valueText,
    valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
    ...statementRange,
  };
};

const parseProtocolOptionStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  if (statementNode.type !== "expression_statement") {
    return undefined;
  }

  const phraseNodes = phraseNodesOf(statementNode);
  const optionNode = phraseNodes[0];
  if (!isNode(optionNode)) {
    return undefined;
  }

  const statementRange = toRange(statementNode, source);
  const optionText = textOf(optionNode, source).toLowerCase();

  if (optionText === "disabled") {
    const valueNode = phraseNodes[1];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "disabled",
      value,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  if (
    (optionText === "description" || optionText === "hostname") &&
    isNode(phraseNodes[1]) &&
    phraseNodes[1].type === "string"
  ) {
    const valueNode = phraseNodes[1];
    const valueText = textOf(valueNode, source);
    return {
      kind: optionText,
      value: stripQuotedText(valueText),
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (optionText === "vrf" && isNode(phraseNodes[1])) {
    const valueNode = phraseNodes[1];
    const valueText = textOf(valueNode, source);
    if (valueText.toLowerCase() === "default") {
      return {
        kind: "vrf",
        mode: "default",
        nameText: valueText,
        nameRange: toRange(valueNode, source),
        ...statementRange,
      };
    }

    if (valueNode.type === "string") {
      return {
        kind: "vrf",
        mode: "named",
        name: stripQuotedText(valueText),
        nameText: valueText,
        nameRange: toRange(valueNode, source),
        ...statementRange,
      };
    }
  }

  const valueNode = phraseNodes.at(-1);
  if (
    optionText === "hold" &&
    phraseTextAt(phraseNodes, 1, source) === "time" &&
    phraseNodes.length === 3 &&
    isNode(valueNode)
  ) {
    return {
      kind: "bgp-timer",
      option: "hold-time",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "connect" &&
    phraseTextAt(phraseNodes, 1, source) === "retry" &&
    phraseTextAt(phraseNodes, 2, source) === "time" &&
    phraseNodes.length === 4 &&
    isNode(valueNode)
  ) {
    return {
      kind: "bgp-timer",
      option: "connect-retry-time",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "keepalive" &&
    phraseTextAt(phraseNodes, 1, source) === "time" &&
    phraseNodes.length === 3 &&
    isNode(valueNode)
  ) {
    return {
      kind: "bgp-timer",
      option: "keepalive-time",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "source" &&
    phraseTextAt(phraseNodes, 1, source) === "address" &&
    isNode(phraseNodes[2])
  ) {
    const addressNode = phraseNodes[2];
    const address = textOf(addressNode, source);
    return {
      kind: "source-address",
      address,
      addressKind: isIpLiteralCandidate(address) ? "ip" : "other",
      addressRange: toRange(addressNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "rr" &&
    phraseTextAt(phraseNodes, 1, source) === "client" &&
    phraseNodes.length <= 3
  ) {
    return parseBgpBoolOption(phraseNodes, source, "rr-client", statementRange);
  }

  if (
    optionText === "strict" &&
    phraseTextAt(phraseNodes, 1, source) === "bind" &&
    phraseNodes.length <= 3
  ) {
    return parseBgpBoolOption(
      phraseNodes,
      source,
      "strict-bind",
      statementRange,
    );
  }

  if (optionText === "passive" && phraseNodes.length <= 2) {
    return parseBgpBoolOption(phraseNodes, source, "passive", statementRange);
  }

  if (
    optionText === "allow" &&
    phraseTextAt(phraseNodes, 1, source) === "local" &&
    phraseTextAt(phraseNodes, 2, source) === "as" &&
    phraseNodes.length <= 4
  ) {
    const valueNode = phraseNodes[3];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    return {
      kind: "bgp-option",
      option: "allow-local-as",
      value: valueText,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  if (optionText === "bfd" && phraseNodes.length <= 2) {
    const valueNode = phraseNodes[1];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const boolValue = parseBoolToken(valueText);
    return {
      kind: "bgp-option",
      option: "bfd",
      value: boolValue ?? valueText,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  return undefined;
};

const parseStaticRouteStatement = (
  statementNode: SyntaxNode,
  source: string,
): StaticRouteStatement | undefined => {
  if (statementNode.type !== "expression_statement") {
    return undefined;
  }

  const phraseNodes = phraseNodesOf(statementNode);
  if (
    textOf(phraseNodes[0], source).toLowerCase() !== "route" ||
    !isPresentNode(phraseNodes[1])
  ) {
    return undefined;
  }

  let destinationIndex = -1;
  for (let index = 2; index < phraseNodes.length; index += 1) {
    const tokenText = textOf(phraseNodes[index], source).toLowerCase();
    if (STATIC_ROUTE_DESTINATIONS.has(tokenText)) {
      destinationIndex = index;
      break;
    }
  }

  const routeTargetNodes =
    destinationIndex === -1
      ? phraseNodes.slice(1)
      : phraseNodes.slice(1, destinationIndex);
  const routeTargetStart = routeTargetNodes[0];
  const routeTargetEnd = routeTargetNodes.at(-1);
  if (!isNode(routeTargetStart) || !isNode(routeTargetEnd)) {
    return undefined;
  }

  const routeTarget = routeTargetNodes
    .map((node) => textOf(node, source))
    .join(" ");
  const destinationNode =
    destinationIndex === -1 ? undefined : phraseNodes[destinationIndex];
  const destinationText = isNode(destinationNode)
    ? textOf(destinationNode, source).toLowerCase()
    : "none";
  const destinationType = STATIC_ROUTE_DESTINATIONS.has(destinationText)
    ? (destinationText as StaticRouteStatement["destinationType"])
    : "other";
  const nextHopNode =
    destinationType === "via" || destinationType === "recursive"
      ? phraseNodes[destinationIndex + 1]
      : undefined;
  const optionsStartIndex =
    destinationType === "via" || destinationType === "recursive"
      ? destinationIndex + 2
      : destinationIndex + 1;
  const optionNodes =
    destinationIndex === -1 ? [] : phraseNodes.slice(optionsStartIndex);

  return {
    kind: "static-route",
    routeTarget,
    routeTargetRange: mergeRanges(
      toRange(routeTargetStart, source),
      toRange(routeTargetEnd, source),
    ),
    destinationType,
    destinationTypeRange: isNode(destinationNode)
      ? toRange(destinationNode, source)
      : undefined,
    nextHop: isNode(nextHopNode) ? textOf(nextHopNode, source) : undefined,
    nextHopRange: isNode(nextHopNode)
      ? toRange(nextHopNode, source)
      : undefined,
    optionsText:
      optionNodes.length > 0
        ? optionNodes.map((node) => textOf(node, source)).join(" ")
        : undefined,
    ...toRange(statementNode, source),
  };
};

const collectCompoundChannelFallbacks = (
  blockNode: SyntaxNode,
  source: string,
): ChannelStatement[] => {
  const blockText = textOf(blockNode, source);
  const blockStart = blockNode.startIndex;
  const lineStarts = lineStartsOf(source);
  const channels: ChannelStatement[] = [];

  for (const match of blockText.matchAll(COMPOUND_CHANNEL_HEADER)) {
    const headerText = match[1];
    if (!headerText || match.index === undefined) {
      continue;
    }

    const headerStart = blockStart + match.index;
    const openBraceIndex = source.indexOf("{", headerStart + headerText.length);
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = findMatchingBraceIndex(source, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    const semicolonIndex =
      source[closeBraceIndex + 1] === ";"
        ? closeBraceIndex + 2
        : closeBraceIndex + 1;
    const channelRange = indexToRange(
      source,
      lineStarts,
      headerStart,
      semicolonIndex,
    );
    const channelType = normalizeChannelType(headerText);
    if (channelType === "unknown") {
      continue;
    }

    channels.push({
      kind: "channel",
      channelType,
      channelTypeRange: indexToRange(
        source,
        lineStarts,
        headerStart,
        headerStart + headerText.length,
      ),
      entries: parseFallbackCompoundChannelEntries(
        source,
        lineStarts,
        openBraceIndex,
        closeBraceIndex,
      ),
      ...channelRange,
    });
  }

  return channels;
};

const findFirstField = (
  node: SyntaxNode,
  fieldName: string,
): SyntaxNode | null => {
  const direct = node.childForFieldName(fieldName);
  if (isPresentNode(direct)) {
    return direct;
  }

  const stack = [...node.namedChildren];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const nested = current.childForFieldName(fieldName);
    if (isPresentNode(nested)) {
      return nested;
    }

    stack.push(...current.namedChildren);
  }

  return null;
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
  const compoundChannelFallbacks = collectCompoundChannelFallbacks(
    blockNode,
    source,
  );

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
      const addressNode = findFirstField(statementNode, "address");
      const interfaceNode = findFirstField(statementNode, "interface");
      const asnNode = findFirstField(statementNode, "asn");
      const portNode = findFirstField(statementNode, "port");

      if (!isPresentNode(addressNode) && !isPresentNode(asnNode)) {
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
      const protocolOption = parseProtocolOptionStatement(
        statementNode,
        source,
      );
      if (protocolOption) {
        statements.push(protocolOption);
        continue;
      }

      const staticRoute = parseStaticRouteStatement(statementNode, source);
      if (staticRoute) {
        statements.push(staticRoute);
        continue;
      }

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

  const mergedStatements = [
    ...statements.filter((statement) => {
      if (statement.kind !== "other" && statement.kind !== "channel") {
        return true;
      }

      return !compoundChannelFallbacks.some((channel) =>
        rangeContains(channel, statement),
      );
    }),
    ...compoundChannelFallbacks,
  ];

  return mergeNeighborTailStatements(mergedStatements, issues);
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
