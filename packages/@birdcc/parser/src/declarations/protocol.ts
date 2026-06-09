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

      if (statement.mode === "other" && clauseText.startsWith("table ")) {
        const valueText = (statement.clauseText ?? "")
          .slice("table ".length)
          .trim();
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-option",
            option:
              statement.kind === "import" ? "import-table" : "export-table",
            value: boolValue,
            valueText,
            valueRange: entryRange,
            ...entryRange,
          });
          continue;
        }
      }

      if (
        statement.kind === "export" &&
        clauseText.startsWith("settle time ")
      ) {
        const valueText = (statement.clauseText ?? "")
          .slice("settle time ".length)
          .trim();
        entries.push({
          kind: "bgp-export-settle-time",
          value: valueText,
          valueRange: entryRange,
          ...entryRange,
        });
        continue;
      }

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

      if (
        phraseTexts[0] === "require" &&
        phraseTexts[1] === "extended" &&
        phraseTexts[2] === "next" &&
        phraseTexts[3] === "hop" &&
        phraseNodes.length <= 5
      ) {
        const valueNode = phraseNodes[4];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-require",
            option: "extended-next-hop",
            value: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
      }

      if (
        phraseTexts[0] === "require" &&
        phraseTexts[1] === "add" &&
        phraseTexts[2] === "paths" &&
        phraseNodes.length <= 4
      ) {
        const valueNode = phraseNodes[3];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-require",
            option: "add-paths",
            value: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
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
        phraseTexts[0] === "next" &&
        phraseTexts[1] === "hop" &&
        (phraseTexts[2] === "self" || phraseTexts[2] === "keep") &&
        phraseNodes.length <= 4
      ) {
        const valueNode = phraseNodes[3];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        const loweredValue = valueText?.toLowerCase();
        entries.push({
          kind: "bgp-next-hop-mode",
          option: phraseTexts[2],
          mode:
            loweredValue === "ibgp" || loweredValue === "ebgp"
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

      if (phraseTexts[0] === "secondary" && phraseNodes.length <= 2) {
        const valueNode = phraseNodes[1];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-option",
            option: "secondary",
            value: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
      }

      if (
        (phraseTexts[0] === "mandatory" || phraseTexts[0] === "validate") &&
        phraseNodes.length <= 2
      ) {
        const valueNode = phraseNodes[1];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-option",
            option: phraseTexts[0],
            value: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
      }

      if (
        phraseTexts[0] === "extended" &&
        phraseTexts[1] === "next" &&
        phraseTexts[2] === "hop" &&
        phraseNodes.length <= 4
      ) {
        const valueNode = phraseNodes[3];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-channel-option",
            option: "extended-next-hop",
            value: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
      }

      if (phraseTexts[0] === "aigp" && phraseNodes.length <= 2) {
        const valueNode = phraseNodes[1];
        const valueText = isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined;
        if (valueText?.toLowerCase() === "originate") {
          entries.push({
            kind: "bgp-aigp",
            enabled: true,
            originate: true,
            valueText,
            valueRange: toRange(valueNode, source),
            ...entryRange,
          });
          continue;
        }

        const boolValue = parseBoolToken(valueText);
        if (boolValue !== undefined) {
          entries.push({
            kind: "bgp-aigp",
            enabled: boolValue,
            valueText,
            valueRange: isPresentNode(valueNode)
              ? toRange(valueNode, source)
              : undefined,
            ...entryRange,
          });
          continue;
        }
      }

      if (phraseTexts[0] === "cost" && isPresentNode(phraseNodes[1])) {
        const valueNode = phraseNodes[1];
        entries.push({
          kind: "bgp-channel-cost",
          value: textOf(valueNode, source),
          valueRange: toRange(valueNode, source),
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

const phraseTailFrom = (
  phraseNodes: SyntaxNode[],
  startIndex: number,
  source: string,
): { text: string; range: SourceRange } | undefined => {
  const startNode = phraseNodes[startIndex];
  const endNode = phraseNodes.at(-1);
  if (
    !isNode(startNode) ||
    !isNode(endNode) ||
    startIndex >= phraseNodes.length
  ) {
    return undefined;
  }

  return {
    text: phraseNodes
      .slice(startIndex)
      .map((node) => textOf(node, source))
      .join(" "),
    range: mergeRanges(toRange(startNode, source), toRange(endNode, source)),
  };
};

const statementTailAfterNode = (
  statementNode: SyntaxNode,
  optionNode: SyntaxNode,
  source: string,
): { text: string; range: SourceRange } | undefined => {
  let startIndex = optionNode.endIndex;
  let endIndex = statementNode.endIndex;

  while (startIndex < endIndex && /\s/u.test(source[startIndex] ?? "")) {
    startIndex += 1;
  }

  while (endIndex > startIndex && /\s/u.test(source[endIndex - 1] ?? "")) {
    endIndex -= 1;
  }

  if (source[endIndex - 1] === ";") {
    endIndex -= 1;
  }

  while (endIndex > startIndex && /\s/u.test(source[endIndex - 1] ?? "")) {
    endIndex -= 1;
  }

  if (startIndex >= endIndex) {
    return undefined;
  }

  return {
    text: source.slice(startIndex, endIndex),
    range: indexToRange(source, lineStartsOf(source), startIndex, endIndex),
  };
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

const parseBgpPhraseBoolOption = (
  phraseNodes: SyntaxNode[],
  source: string,
  statementRange: SourceRange,
  phrase: string[],
  option: Extract<ProtocolStatement, { kind: "bgp-option" }>["option"],
): ProtocolStatement | undefined => {
  if (phraseNodes.length !== phrase.length + 1) {
    return undefined;
  }

  const matches = phrase.every(
    (text, index) => phraseTextAt(phraseNodes, index, source) === text,
  );
  if (!matches) {
    return undefined;
  }

  const valueNode = phraseNodes[phrase.length];
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

const parseBgpPhraseValueOption = (
  phraseNodes: SyntaxNode[],
  source: string,
  statementRange: SourceRange,
  phrase: string[],
  option: Extract<ProtocolStatement, { kind: "bgp-option" }>["option"],
): ProtocolStatement | undefined => {
  if (phraseNodes.length < phrase.length + 1) {
    return undefined;
  }

  const matches = phrase.every(
    (text, index) => phraseTextAt(phraseNodes, index, source) === text,
  );
  if (!matches) {
    return undefined;
  }

  const value = phraseTailFrom(phraseNodes, phrase.length, source);
  if (!value) {
    return undefined;
  }

  return {
    kind: "bgp-option",
    option,
    value: value.text,
    valueText: value.text,
    valueRange: value.range,
    ...statementRange,
  };
};

const parseBgpCapabilityStatement = (
  phraseNodes: SyntaxNode[],
  source: string,
  statementRange: SourceRange,
): ProtocolStatement | undefined => {
  const modeText = phraseTextAt(phraseNodes, 0, source);

  if (modeText === "capabilities" && phraseNodes.length <= 2) {
    const valueNode = phraseNodes[1];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "bgp-capability",
      mode: "capabilities",
      option: "all",
      value,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  const mode =
    modeText === "enable" || modeText === "require" || modeText === "advertise"
      ? modeText
      : undefined;
  if (!mode) {
    return undefined;
  }

  const phraseOffset = 1;
  const valueNode = phraseNodes.at(-1);
  const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
  const value = parseBoolToken(valueText);
  if (value === undefined) {
    return undefined;
  }

  const optionTexts = phraseNodes
    .slice(phraseOffset, -1)
    .map((node) => textOf(node, source).toLowerCase());
  const optionText = optionTexts.join("-");
  const option =
    optionText === "route-refresh" ||
    optionText === "enhanced-route-refresh" ||
    optionText === "as4" ||
    optionText === "extended-messages" ||
    optionText === "hostname" ||
    optionText === "graceful-restart" ||
    optionText === "long-lived-graceful-restart"
      ? optionText
      : undefined;

  if (!option) {
    return undefined;
  }

  if (mode === "enable" && option === "hostname") {
    return undefined;
  }

  if (mode === "advertise" && option !== "hostname") {
    return undefined;
  }

  return {
    kind: "bgp-capability",
    mode,
    option,
    value,
    valueText,
    valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
    ...statementRange,
  };
};

const parseBgpTimerOption = (
  phraseNodes: SyntaxNode[],
  source: string,
  statementRange: SourceRange,
): ProtocolStatement | undefined => {
  const phraseTexts = phraseNodes.map((node) => textOf(node, source));
  const lowerTexts = phraseTexts.map((text) => text.toLowerCase());

  const timerOptions: Array<{
    phrase: string[];
    option: Extract<ProtocolStatement, { kind: "bgp-timer" }>["option"];
  }> = [
    { phrase: ["hold", "time"], option: "hold-time" },
    { phrase: ["min", "hold", "time"], option: "min-hold-time" },
    { phrase: ["startup", "hold", "time"], option: "startup-hold-time" },
    { phrase: ["connect", "delay", "time"], option: "connect-delay-time" },
    { phrase: ["connect", "retry", "time"], option: "connect-retry-time" },
    { phrase: ["keepalive", "time"], option: "keepalive-time" },
    {
      phrase: ["min", "keepalive", "time"],
      option: "min-keepalive-time",
    },
    { phrase: ["send", "hold", "time"], option: "send-hold-time" },
    { phrase: ["error", "forget", "time"], option: "error-forget-time" },
    { phrase: ["error", "wait", "time"], option: "error-wait-time" },
  ];

  for (const timerOption of timerOptions) {
    const { phrase, option } = timerOption;
    if (
      lowerTexts.length === phrase.length + 1 &&
      phrase.every((item, index) => lowerTexts[index] === item)
    ) {
      const valueNode = phraseNodes.at(-1);
      if (!isNode(valueNode)) {
        return undefined;
      }

      return {
        kind: "bgp-timer",
        option,
        value: textOf(valueNode, source),
        valueRange: toRange(valueNode, source),
        ...statementRange,
      };
    }
  }

  if (
    lowerTexts.length === 5 &&
    lowerTexts[0] === "error" &&
    lowerTexts[1] === "wait" &&
    lowerTexts[2] === "time"
  ) {
    const minNode = phraseNodes[3];
    const maxNode = phraseNodes[4];
    if (!isNode(minNode) || !isNode(maxNode)) {
      return undefined;
    }

    return {
      kind: "bgp-timer",
      option: "error-wait-time",
      value: `${textOf(minNode, source)}, ${textOf(maxNode, source)}`,
      valueRange: mergeRanges(
        toRange(minNode, source),
        toRange(maxNode, source),
      ),
      ...statementRange,
    };
  }

  return undefined;
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

  if (
    optionText === "restart" &&
    phraseTextAt(phraseNodes, 1, source) === "time"
  ) {
    const value = phraseTailFrom(phraseNodes, 2, source);
    if (value) {
      return {
        kind: "restart-time",
        value: value.text,
        valueRange: value.range,
        ...statementRange,
      };
    }
  }

  if (optionText === "debug") {
    const clause = statementTailAfterNode(statementNode, optionNode, source);
    if (clause) {
      return {
        kind: "debug",
        clauseText: clause.text,
        clauseRange: clause.range,
        ...statementRange,
      };
    }
  }

  if (optionText === "mrtdump") {
    const mask = statementTailAfterNode(statementNode, optionNode, source);
    if (mask) {
      return {
        kind: "mrtdump",
        maskText: mask.text,
        maskRange: mask.range,
        ...statementRange,
      };
    }
  }

  if (
    optionText === "router" &&
    phraseTextAt(phraseNodes, 1, source) === "id"
  ) {
    const value = phraseTailFrom(phraseNodes, 2, source);
    if (value) {
      return {
        kind: "protocol-router-id",
        value: value.text,
        valueRange: value.range,
        ...statementRange,
      };
    }
  }

  if (
    optionText === "thread" &&
    phraseTextAt(phraseNodes, 1, source) === "group" &&
    isNode(phraseNodes[2])
  ) {
    const nameNode = phraseNodes[2];
    return {
      kind: "thread-group",
      name: stripQuotedText(textOf(nameNode, source)),
      nameRange: toRange(nameNode, source),
      ...statementRange,
    };
  }

  const timerStatement = parseBgpTimerOption(
    phraseNodes,
    source,
    statementRange,
  );
  if (timerStatement) {
    return timerStatement;
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

  if (optionText === "authentication" && isNode(phraseNodes[1])) {
    const authTypeNode = phraseNodes[1];
    const authTypeText = textOf(authTypeNode, source).toLowerCase();
    return {
      kind: "bgp-authentication",
      authType:
        authTypeText === "none" ||
        authTypeText === "md5" ||
        authTypeText === "ao"
          ? authTypeText
          : "other",
      authTypeRange: toRange(authTypeNode, source),
      ...statementRange,
    };
  }

  if (optionText === "password" && isNode(phraseNodes[1])) {
    const valueNode = phraseNodes[1];
    const valueText = textOf(valueNode, source);
    return {
      kind: "bgp-password",
      value: stripQuotedText(valueText),
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (optionText === "setkey" && phraseNodes.length <= 2) {
    const valueNode = phraseNodes[1];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "bgp-setkey",
      value,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
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

  const bgpCapabilityStatement = parseBgpCapabilityStatement(
    phraseNodes,
    source,
    statementRange,
  );
  if (bgpCapabilityStatement) {
    return bgpCapabilityStatement;
  }

  const bgpSessionBoolOption =
    parseBgpPhraseBoolOption(
      phraseNodes,
      source,
      statementRange,
      ["ttl", "security"],
      "ttl-security",
    ) ??
    parseBgpPhraseBoolOption(
      phraseNodes,
      source,
      statementRange,
      ["check", "link"],
      "check-link",
    ) ??
    parseBgpPhraseBoolOption(
      phraseNodes,
      source,
      statementRange,
      ["enforce", "first", "as"],
      "enforce-first-as",
    ) ??
    parseBgpPhraseBoolOption(
      phraseNodes,
      source,
      statementRange,
      ["require", "roles"],
      "require-roles",
    ) ??
    parseBgpPhraseBoolOption(
      phraseNodes,
      source,
      statementRange,
      ["disable", "rx"],
      "disable-rx",
    );
  if (bgpSessionBoolOption) {
    return bgpSessionBoolOption;
  }

  const bgpSessionValueOption =
    parseBgpPhraseValueOption(
      phraseNodes,
      source,
      statementRange,
      ["local", "role"],
      "local-role",
    ) ??
    parseBgpPhraseValueOption(
      phraseNodes,
      source,
      statementRange,
      ["tx", "size", "warning"],
      "tx-size-warning",
    );
  if (bgpSessionValueOption) {
    return bgpSessionValueOption;
  }

  if (optionText === "direct" && phraseNodes.length === 1) {
    return {
      kind: "bgp-hop-mode",
      mode: "direct",
      ...statementRange,
    };
  }

  if (optionText === "multihop" && phraseNodes.length <= 2) {
    const ttlNode = phraseNodes[1];
    return {
      kind: "bgp-hop-mode",
      mode: "multihop",
      ttl: isNode(ttlNode) ? textOf(ttlNode, source) : undefined,
      ttlRange: isNode(ttlNode) ? toRange(ttlNode, source) : undefined,
      ...statementRange,
    };
  }

  if (
    optionText === "scan" &&
    phraseTextAt(phraseNodes, 1, source) === "time" &&
    isNode(phraseNodes[2])
  ) {
    const valueNodes = phraseNodes.slice(2);
    const value = valueNodes.map((node) => textOf(node, source)).join(" ");
    const valueRange = mergeRanges(
      toRange(valueNodes[0] ?? phraseNodes[2], source),
      toRange(valueNodes[valueNodes.length - 1] ?? phraseNodes[2], source),
    );
    return {
      kind: "scan-time",
      value,
      valueRange,
      ...statementRange,
    };
  }

  if (optionText === "learn" && phraseNodes.length <= 2) {
    const valueNode = phraseNodes[1];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const boolValue = parseBoolToken(valueText);
    return {
      kind: "learn",
      mode:
        valueText?.toLowerCase() === "all"
          ? "all"
          : boolValue === false
            ? "off"
            : "on",
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  if (optionText === "interface" && isNode(phraseNodes[1])) {
    const isRange = phraseTextAt(phraseNodes, 1, source) === "range";
    const patternNodes = isRange ? phraseNodes.slice(2) : phraseNodes.slice(1);
    if (patternNodes.length > 0) {
      return {
        kind: "interface",
        mode: isRange ? "range" : "single",
        patterns: patternNodes.map((node) =>
          stripQuotedText(textOf(node, source)),
        ),
        patternRanges: patternNodes.map((node) => toRange(node, source)),
        ...statementRange,
      };
    }
  }

  return undefined;
};

const parseLocalRoleStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  if (statementNode.type !== "local_role_statement") {
    return undefined;
  }

  const roleNode = statementNode.childForFieldName("role");
  if (!isPresentNode(roleNode)) {
    return undefined;
  }

  const roleText = textOf(roleNode, source);
  return {
    kind: "bgp-option",
    option: "local-role",
    value: roleText,
    valueText: roleText,
    valueRange: toRange(roleNode, source),
    ...toRange(statementNode, source),
  };
};

const parseMrtOptionStatement = (
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

  if (
    (optionText === "table" ||
      optionText === "filename" ||
      optionText === "period") &&
    isNode(phraseNodes[1])
  ) {
    const valueNode = phraseNodes[1];
    const valueText = textOf(valueNode, source);
    return {
      kind: "mrt-option",
      option: optionText,
      value: optionText === "filename" ? stripQuotedText(valueText) : valueText,
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    phraseNodes.length === 4 &&
    phraseTextAt(phraseNodes, 0, source) === "always" &&
    phraseTextAt(phraseNodes, 1, source) === "add" &&
    phraseTextAt(phraseNodes, 2, source) === "path"
  ) {
    const valueNode = phraseNodes[3];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "mrt-option",
      option: "always-add-path",
      value,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  return undefined;
};

const parseAggregatorOptionStatement = (
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

  if (optionText === "table" && isNode(phraseNodes[1])) {
    const valueNode = phraseNodes[1];
    const valueText = textOf(valueNode, source);
    return {
      kind: "aggregator-option",
      option: "table",
      value: valueText,
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "peer" &&
    phraseTextAt(phraseNodes, 1, source) === "table" &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    const valueText = textOf(valueNode, source);
    return {
      kind: "aggregator-option",
      option: "peer-table",
      value: valueText,
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "aggregate" &&
    phraseTextAt(phraseNodes, 1, source) === "on"
  ) {
    const onNode = phraseNodes[1];
    if (!isNode(onNode)) {
      return undefined;
    }

    const value = statementTailAfterNode(statementNode, onNode, source);
    if (!value) {
      return undefined;
    }
    const valueText = value.text.replace(/\s*,\s*/gu, ", ");

    return {
      kind: "aggregator-option",
      option: "aggregate-on",
      value: valueText,
      valueText,
      valueRange: value.range,
      ...statementRange,
    };
  }

  if (optionText === "merge" && phraseTextAt(phraseNodes, 1, source) === "by") {
    const bodyNode = statementNode.childForFieldName("body");
    if (!isPresentNode(bodyNode)) {
      return undefined;
    }

    return {
      kind: "aggregator-option",
      option: "merge-by",
      bodyText: textOf(bodyNode, source),
      bodyRange: toRange(bodyNode, source),
      ...statementRange,
    };
  }

  return undefined;
};

const parsePipeImportInStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  const statementText = textOf(statementNode, source)
    .trim()
    .replace(/;\s*$/u, "");
  const importInMatch = statementText.match(
    /^import\s+in\s+(\S+)(?:\s+(.+))?$/iu,
  );
  if (!importInMatch?.[1]) {
    return undefined;
  }

  const network = importInMatch[1];
  const clauseText = importInMatch[2]?.trim() ?? "";
  const modeText = clauseText.split(/\s+/u)[0]?.toLowerCase() ?? "other";
  const mode =
    modeText === "all" ||
    modeText === "none" ||
    modeText === "filter" ||
    modeText === "where"
      ? modeText
      : "other";

  return {
    kind: "pipe-import-in",
    network,
    networkRange: rangeForStatementToken(source, statementNode, network),
    mode,
    clauseText,
    ...toRange(statementNode, source),
  };
};

const parsePipeOptionStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  const phraseNodes = phraseNodesOf(statementNode);
  const statementRange = toRange(statementNode, source);

  if (
    phraseTextAt(phraseNodes, 0, source) === "peer" &&
    phraseTextAt(phraseNodes, 1, source) === "table" &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    return {
      kind: "pipe-option",
      option: "peer-table",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    phraseTextAt(phraseNodes, 0, source) === "max" &&
    phraseTextAt(phraseNodes, 1, source) === "generation" &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    return {
      kind: "pipe-option",
      option: "max-generation",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  return undefined;
};

const parseBmpOptionStatement = (
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

  if (
    optionText === "local" &&
    phraseTextAt(phraseNodes, 1, source) === "address" &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    return {
      kind: "bmp-option",
      option: "local-address",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "station" &&
    phraseTextAt(phraseNodes, 1, source) === "address" &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    const statementText = textOf(statementNode, source);
    const portMatch = statementText.match(/\bport\s+([^\s;]+)/iu);
    const port = portMatch?.[1];
    return {
      kind: "bmp-option",
      option: "station-address",
      value: textOf(valueNode, source),
      valueRange: toRange(valueNode, source),
      port,
      portRange: port
        ? rangeForStatementToken(source, statementNode, port)
        : undefined,
      ...statementRange,
    };
  }

  if (
    optionText === "system" &&
    (phraseTextAt(phraseNodes, 1, source) === "description" ||
      phraseTextAt(phraseNodes, 1, source) === "name") &&
    isNode(phraseNodes[2])
  ) {
    const valueNode = phraseNodes[2];
    const valueText = textOf(valueNode, source);
    return {
      kind: "bmp-option",
      option:
        phraseTextAt(phraseNodes, 1, source) === "description"
          ? "system-description"
          : "system-name",
      value: stripQuotedText(valueText),
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "monitoring" &&
    phraseTextAt(phraseNodes, 1, source) === "rib" &&
    phraseTextAt(phraseNodes, 2, source) === "in" &&
    (phraseTextAt(phraseNodes, 3, source) === "pre_policy" ||
      phraseTextAt(phraseNodes, 3, source) === "post_policy") &&
    isNode(phraseNodes[4])
  ) {
    const valueNode = phraseNodes[4];
    const valueText = textOf(valueNode, source);
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "bmp-option",
      option:
        phraseTextAt(phraseNodes, 3, source) === "pre_policy"
          ? "monitoring-rib-in-pre-policy"
          : "monitoring-rib-in-post-policy",
      value,
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  if (
    optionText === "tx" &&
    phraseTextAt(phraseNodes, 1, source) === "buffer" &&
    phraseTextAt(phraseNodes, 2, source) === "limit" &&
    isNode(phraseNodes[3])
  ) {
    const valueNode = phraseNodes[3];
    const valueText = textOf(valueNode, source);
    return {
      kind: "bmp-option",
      option: "tx-buffer-limit",
      value: valueText,
      valueText,
      valueRange: toRange(valueNode, source),
      ...statementRange,
    };
  }

  return undefined;
};

const parseBfdOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");

  const acceptMatch = trimmed.match(/^accept(?:\s+(.+))?$/iu);
  if (acceptMatch) {
    const tokens = (acceptMatch[1] ?? "")
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => token.toLowerCase());
    const families = tokens.filter(
      (token): token is "ipv4" | "ipv6" => token === "ipv4" || token === "ipv6",
    );
    const sessionTypes = tokens.filter(
      (token): token is "direct" | "multihop" =>
        token === "direct" || token === "multihop",
    );

    return {
      kind: "bfd-option",
      option: "accept",
      families,
      sessionTypes,
      ...statementRange,
    };
  }

  const strictBindMatch = trimmed.match(/^strict\s+bind(?:\s+(\S+))?$/iu);
  if (strictBindMatch) {
    const valueText = strictBindMatch[1];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "bfd-option",
      option: "strict-bind",
      value,
      valueText,
      valueRange: valueText ? tokenRange(valueText) : undefined,
      ...statementRange,
    };
  }

  const checksumMatch = trimmed.match(
    /^zero\s+udp6\s+checksum\s+rx(?:\s+(\S+))?$/iu,
  );
  if (checksumMatch) {
    const valueText = checksumMatch[1];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "bfd-option",
      option: "zero-udp6-checksum-rx",
      value,
      valueText,
      valueRange: valueText ? tokenRange(valueText) : undefined,
      ...statementRange,
    };
  }

  const expressThreadMatch = trimmed.match(
    /^express\s+thread\s+group\s+([A-Za-z_][A-Za-z0-9_-]*)$/iu,
  );
  if (expressThreadMatch?.[1]) {
    return {
      kind: "bfd-option",
      option: "express-thread-group",
      name: expressThreadMatch[1],
      nameRange: tokenRange(expressThreadMatch[1]),
      ...statementRange,
    };
  }

  return undefined;
};

const parseBfdProfileEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "bfd-profile" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return body
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const timerMatch = item.match(
        /^(interval|min\s+rx\s+interval|min\s+tx\s+interval|idle\s+tx\s+interval)\s+(.+)$/iu,
      );
      if (timerMatch?.[1] && timerMatch[2]) {
        const optionText = timerMatch[1].toLowerCase().replace(/\s+/gu, "-");
        return {
          kind: "timer",
          option:
            optionText === "min-rx-interval" ||
            optionText === "min-tx-interval" ||
            optionText === "idle-tx-interval"
              ? optionText
              : "interval",
          value: timerMatch[2].trim(),
          valueRange: tokenRange(timerMatch[2].trim()),
          ...bodyRange,
        };
      }

      const multiplierMatch = item.match(/^multiplier\s+(.+)$/iu);
      if (multiplierMatch?.[1]) {
        const value = multiplierMatch[1].trim();
        return {
          kind: "multiplier",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const passiveMatch = item.match(/^passive(?:\s+(\S+))?$/iu);
      if (passiveMatch) {
        const valueText = passiveMatch[1];
        return {
          kind: "passive",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      if (/^graceful$/iu.test(item)) {
        return {
          kind: "graceful",
          ...bodyRange,
        };
      }

      const authenticationMatch = item.match(/^authentication\s+(.+)$/iu);
      if (authenticationMatch?.[1]) {
        const authType = authenticationMatch[1].trim();
        return {
          kind: "authentication",
          authType,
          authTypeRange: tokenRange(authType),
          ...bodyRange,
        };
      }

      const passwordMatch = item.match(/^password\s+(.+)$/iu);
      if (passwordMatch?.[1]) {
        const valueText = passwordMatch[1].trim();
        return {
          kind: "password",
          value: stripQuotedText(valueText),
          valueText,
          valueRange: tokenRange(valueText),
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseBfdProfileTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const profileMatch = trimmed.match(/^(interface|multihop)\b(.*)$/isu);
  if (!profileMatch?.[1] || !profileMatch[2]) {
    return undefined;
  }

  const profileType = profileMatch[1].toLowerCase() as "interface" | "multihop";
  const rest = profileMatch[2].trim();
  const bodyMatch = rest.match(/\{[\s\S]*\}$/u);
  const bodyText = bodyMatch?.[0];
  if (!bodyText) {
    return undefined;
  }

  const patternText = rest.slice(0, rest.indexOf(bodyText)).trim();
  const patternMatches = [...patternText.matchAll(/"[^"]+"|'[^']+'|\S+/gu)];
  const patterns = patternMatches.map((match) => stripQuotedText(match[0]));
  const patternRanges = patternMatches.map((match) => tokenRange(match[0]));
  const bodyRange = tokenRange(bodyText);

  return {
    kind: "bfd-profile",
    profileType,
    patterns: profileType === "interface" ? patterns : undefined,
    patternRanges: profileType === "interface" ? patternRanges : undefined,
    entries: parseBfdProfileEntries(bodyText, bodyRange, tokenRange),
    bodyText,
    bodyRange,
    ...statementRange,
  };
};

const parseBfdNeighborTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const neighborMatch = trimmed.match(/^neighbor\s+(\S+)(?:\s+(.+))?$/iu);
  if (!neighborMatch?.[1]) {
    return undefined;
  }

  const address = neighborMatch[1];
  const tail = neighborMatch[2] ?? "";
  const interfaceMatch =
    tail.match(/(?:^|\s)dev\s+("[^"]+"|'[^']+'|\S+)/iu) ??
    tail.match(/(?:^|\s)%\s+("[^"]+"|'[^']+'|\S+)/iu);
  const localMatch = tail.match(/(?:^|\s)local\s+(\S+)/iu);
  const multihopMatch = tail.match(/(?:^|\s)multihop(?:\s+(\S+))?/iu);
  const multihopText = multihopMatch?.[1];
  const interfaceText = interfaceMatch?.[1];
  const localAddress = localMatch?.[1];

  return {
    kind: "bfd-neighbor",
    address,
    addressKind: isIpLiteralCandidate(address) ? "ip" : "other",
    addressRange: tokenRange(address),
    interface: interfaceText ? stripQuotedText(interfaceText) : undefined,
    interfaceSyntax: interfaceMatch
      ? interfaceMatch[0].trim().startsWith("%")
        ? "percent"
        : "dev"
      : undefined,
    interfaceRange: interfaceText ? tokenRange(interfaceText) : undefined,
    localAddress,
    localAddressKind: localAddress
      ? isIpLiteralCandidate(localAddress)
        ? "ip"
        : "other"
      : undefined,
    localAddressRange: localAddress ? tokenRange(localAddress) : undefined,
    multihop: multihopMatch
      ? (parseBoolToken(multihopText) ?? true)
      : undefined,
    multihopText,
    multihopRange: multihopText ? tokenRange(multihopText) : undefined,
    ...statementRange,
  };
};

const parseBfdTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined =>
  parseBfdOptionTextStatement(statementText, statementRange, tokenRange) ??
  parseBfdProfileTextStatement(statementText, statementRange, tokenRange) ??
  parseBfdNeighborTextStatement(statementText, statementRange, tokenRange);

const parseVpnOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");

  const simpleMatch = trimmed.match(/^(rd|vni|vid|tag)\s+(.+)$/iu);
  if (simpleMatch?.[1] && simpleMatch[2]) {
    const optionText = simpleMatch[1].toLowerCase();
    const value = simpleMatch[2].trim();
    return {
      kind: "vpn-option",
      option: optionText as "rd" | "vni" | "vid" | "tag",
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  const routeDistinguisherMatch = trimmed.match(
    /^route\s+distinguisher\s+(.+)$/iu,
  );
  if (routeDistinguisherMatch?.[1]) {
    const value = routeDistinguisherMatch[1].trim();
    return {
      kind: "vpn-option",
      option: "route-distinguisher",
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  const targetMatch = trimmed.match(
    /^(import|export|route)\s+target\s+(.+)$/iu,
  );
  if (targetMatch?.[1] && targetMatch[2]) {
    const optionText = `${targetMatch[1].toLowerCase()}-target` as
      | "import-target"
      | "export-target"
      | "route-target";
    const value = targetMatch[2].trim();
    return {
      kind: "vpn-option",
      option: optionText,
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  return undefined;
};

const parseEvpnEncapsulationEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "evpn-encapsulation" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const tunnelDeviceMatch = item.match(/^tunnel\s+device\s+(.+)$/iu);
      if (tunnelDeviceMatch?.[1]) {
        const valueText = tunnelDeviceMatch[1].trim();
        return {
          kind: "tunnel-device",
          value: stripQuotedText(valueText),
          valueText,
          valueRange: tokenRange(valueText),
          ...bodyRange,
        };
      }

      const routerAddressMatch = item.match(/^router\s+address\s+(\S+)$/iu);
      if (routerAddressMatch?.[1]) {
        const address = routerAddressMatch[1];
        return {
          kind: "router-address",
          address,
          addressKind: isIpLiteralCandidate(address) ? "ip" : "other",
          addressRange: tokenRange(address),
          ...bodyRange,
        };
      }

      const defaultMatch = item.match(/^default(?:\s+(\S+))?$/iu);
      if (defaultMatch) {
        const valueText = defaultMatch[1];
        return {
          kind: "default",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseEvpnVlanEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "evpn-vlan" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const valueMatch = item.match(/^(range|vni|vid)\s+(.+)$/iu);
      if (valueMatch?.[1] && valueMatch[2]) {
        const value = valueMatch[2].trim();
        return {
          kind: valueMatch[1].toLowerCase() as "range" | "vni" | "vid",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseEvpnTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const encapsulationMatch = trimmed.match(
    /^encapsulation\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu,
  );
  if (encapsulationMatch?.[1]) {
    const encapsulationText = encapsulationMatch[1].toLowerCase();
    const bodyText = encapsulationMatch[2];
    const bodyRange = bodyText ? tokenRange(bodyText) : undefined;
    return {
      kind: "evpn-encapsulation",
      encapsulation: encapsulationText === "vxlan" ? "vxlan" : "other",
      encapsulationText,
      encapsulationRange: tokenRange(encapsulationMatch[1]),
      entries:
        bodyText && bodyRange
          ? parseEvpnEncapsulationEntries(bodyText, bodyRange, tokenRange)
          : [],
      bodyText,
      bodyRange,
      ...statementRange,
    };
  }

  const vlanMatch = trimmed.match(/^vlan\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu);
  if (vlanMatch?.[1]) {
    const id = vlanMatch[1];
    const bodyText = vlanMatch[2];
    const bodyRange = bodyText ? tokenRange(bodyText) : undefined;
    return {
      kind: "evpn-vlan",
      id,
      idRange: tokenRange(id),
      entries:
        bodyText && bodyRange
          ? parseEvpnVlanEntries(bodyText, bodyRange, tokenRange)
          : [],
      bodyText,
      bodyRange,
      ...statementRange,
    };
  }

  return undefined;
};

const parseBridgeOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");

  const bridgeDeviceMatch = trimmed.match(/^bridge\s+device\s+(.+)$/iu);
  if (bridgeDeviceMatch?.[1]) {
    const valueText = bridgeDeviceMatch[1].trim();
    return {
      kind: "bridge-option",
      option: "bridge-device",
      value: stripQuotedText(valueText),
      valueText,
      valueRange: tokenRange(valueText),
      ...statementRange,
    };
  }

  const vlanFilteringMatch = trimmed.match(/^vlan\s+filtering(?:\s+(\S+))?$/iu);
  if (vlanFilteringMatch) {
    const valueText = vlanFilteringMatch[1];
    return {
      kind: "bridge-option",
      option: "vlan-filtering",
      value: parseBoolToken(valueText) ?? true,
      valueText,
      valueRange: valueText ? tokenRange(valueText) : statementRange,
      ...statementRange,
    };
  }

  return undefined;
};

const parseOspfOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");

  if (/^graceful\s+restart\s+aware$/iu.test(trimmed)) {
    return {
      kind: "ospf-option",
      option: "graceful-restart-aware",
      ...statementRange,
    };
  }

  const boolOptionMatch = trimmed.match(
    /^(rfc1583compat|rfc5838|stub\s+router|graceful\s+restart|merge\s+external)\s+(\S+)$/iu,
  );
  if (boolOptionMatch?.[1] && boolOptionMatch[2]) {
    const option = boolOptionMatch[1].toLowerCase().replace(/\s+/gu, "-") as
      | "rfc1583compat"
      | "rfc5838"
      | "stub-router"
      | "graceful-restart"
      | "merge-external";
    const valueText = boolOptionMatch[2];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "ospf-option",
      option,
      value,
      valueText,
      valueRange: tokenRange(valueText),
      ...statementRange,
    };
  }

  const vpnPeMatch = trimmed.match(/^vpn\s+pe\s+(\S+)$/iu);
  if (vpnPeMatch?.[1]) {
    const valueText = vpnPeMatch[1];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "ospf-option",
      option: "vpn-pe",
      value,
      valueText,
      valueRange: tokenRange(valueText),
      ...statementRange,
    };
  }

  const valueOptionMatch = trimmed.match(
    /^(graceful\s+restart\s+time|tick|instance\s+id)\s+(.+)$/iu,
  );
  if (valueOptionMatch?.[1] && valueOptionMatch[2]) {
    const value = valueOptionMatch[2].trim();
    return {
      kind: "ospf-option",
      option: valueOptionMatch[1].toLowerCase().replace(/\s+/gu, "-") as
        | "graceful-restart-time"
        | "tick"
        | "instance-id",
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  const ecmpMatch = trimmed.match(/^ecmp\s+(\S+)(?:\s+limit\s+(.+))?$/iu);
  if (ecmpMatch?.[1]) {
    const valueText = ecmpMatch[1];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    const limit = ecmpMatch[2]?.trim();
    return {
      kind: "ospf-option",
      option: "ecmp",
      value,
      valueText,
      valueRange: tokenRange(valueText),
      limit,
      limitRange: limit ? tokenRange(limit) : undefined,
      ...statementRange,
    };
  }

  return undefined;
};

const parseOspfAreaPrefixListEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<
  Extract<ProtocolStatement, { kind: "ospf-area" }>["entries"][number],
  { kind: "networks" | "external" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const prefixMatch = item.match(/^(\S+)(?:\s+(hidden|tag\s+(.+)))?$/iu);
      const prefix = prefixMatch?.[1] ?? item;
      const tag = prefixMatch?.[3]?.trim();
      const hidden = prefixMatch?.[2]?.toLowerCase() === "hidden";
      return {
        prefix,
        prefixRange: tokenRange(prefix),
        hidden: hidden ? true : undefined,
        hiddenRange: hidden
          ? tokenRange(prefixMatch?.[2] ?? "hidden")
          : undefined,
        tag,
        tagRange: tag ? tokenRange(tag) : undefined,
        ...bodyRange,
      };
    });
};

const parseOspfAreaStubnetEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<
  Extract<ProtocolStatement, { kind: "ospf-area" }>["entries"][number],
  { kind: "stubnet" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const boolMatch = item.match(/^(hidden|summary)(?:\s+(\S+))?$/iu);
      if (boolMatch?.[1]) {
        const valueText = boolMatch[2];
        const value = parseBoolToken(valueText);
        if (value === undefined) {
          return {
            kind: "other",
            text: item,
            ...bodyRange,
          };
        }

        return {
          kind: boolMatch[1].toLowerCase() as "hidden" | "summary",
          value,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const costMatch = item.match(/^cost\s+(.+)$/iu);
      if (costMatch?.[1]) {
        const value = costMatch[1].trim();
        return {
          kind: "cost",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseOspfAreaInterfaceNeighbors = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<
  Extract<
    Extract<ProtocolStatement, { kind: "ospf-area" }>["entries"][number],
    { kind: "interface" }
  >["entries"][number],
  { kind: "neighbors" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const neighborMatch = item.match(/^(\S+)(?:\s+(eligible))?$/iu);
      const address = neighborMatch?.[1] ?? item;
      const eligibleText = neighborMatch?.[2];
      return {
        address,
        addressRange: tokenRange(address),
        eligible: eligibleText !== undefined,
        eligibleRange: eligibleText ? tokenRange(eligibleText) : undefined,
        ...bodyRange,
      };
    });
};

const parseOspfAreaInterfaceEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<
  Extract<ProtocolStatement, { kind: "ospf-area" }>["entries"][number],
  { kind: "interface" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const valueMatch = item.match(/^(cost|priority|ecmp\s+weight)\s+(.+)$/iu);
      if (valueMatch?.[1] && valueMatch[2]) {
        const option = valueMatch[1].toLowerCase().replace(/\s+/gu, "-");
        const value = valueMatch[2].trim();
        return {
          kind:
            option === "ecmp-weight"
              ? "ecmp-weight"
              : (option as "cost" | "priority"),
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const deadCountMatch = item.match(/^dead\s+count\s+(.+)$/iu);
      if (deadCountMatch?.[1]) {
        const value = deadCountMatch[1].trim();
        return {
          kind: "timer",
          option: "dead-count",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const timerMatch = item.match(
        /^(hello|poll|retransmit|wait|dead)\s+(.+)$/iu,
      );
      if (timerMatch?.[1] && timerMatch[2]) {
        const value = timerMatch[2].trim();
        return {
          kind: "timer",
          option: timerMatch[1].toLowerCase() as
            | "hello"
            | "poll"
            | "retransmit"
            | "wait"
            | "dead",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const transmitDelayMatch = item.match(/^transmit\s+delay\s+(.+)$/iu);
      if (transmitDelayMatch?.[1]) {
        const value = transmitDelayMatch[1].trim();
        return {
          kind: "timer",
          option: "transmit-delay",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const typeMatch = item.match(/^type\s+(\S+)$/iu);
      if (typeMatch?.[1]) {
        const valueText = typeMatch[1].toLowerCase();
        const knownTypes = [
          "broadcast",
          "bcast",
          "nonbroadcast",
          "nbma",
          "pointopoint",
          "ptp",
          "pointomultipoint",
          "ptmp",
        ] as const;
        return {
          kind: "type",
          value: knownTypes.includes(valueText as (typeof knownTypes)[number])
            ? (valueText as (typeof knownTypes)[number])
            : "other",
          valueText,
          valueRange: tokenRange(typeMatch[1]),
          ...bodyRange,
        };
      }

      const ttlSecurityTxOnlyMatch = item.match(
        /^ttl\s+security\s+tx\s+only$/iu,
      );
      if (ttlSecurityTxOnlyMatch) {
        return {
          kind: "ttl-security",
          value: "tx-only",
          valueText: "tx only",
          valueRange: tokenRange("tx only"),
          ...bodyRange,
        };
      }

      const boolMatch = item.match(
        /^(strict\s+nonbroadcast|stub|check\s+link|real\s+broadcast|ptp\s+netmask|ptp\s+address|link\s+lsa\s+suppression|ttl\s+security|bfd)\s+(\S+)$/iu,
      );
      if (boolMatch?.[1] && boolMatch[2]) {
        const valueText = boolMatch[2];
        const value = parseBoolToken(valueText);
        if (value === undefined) {
          return {
            kind: "other",
            text: item,
            ...bodyRange,
          };
        }

        return {
          kind: boolMatch[1].toLowerCase().replace(/\s+/gu, "-") as
            | "strict-nonbroadcast"
            | "stub"
            | "check-link"
            | "real-broadcast"
            | "ptp-netmask"
            | "ptp-address"
            | "link-lsa-suppression"
            | "ttl-security"
            | "bfd",
          value,
          valueText,
          valueRange: tokenRange(valueText),
          ...bodyRange,
        };
      }

      const authenticationMatch = item.match(/^authentication\s+(\S+)$/iu);
      if (authenticationMatch?.[1]) {
        const valueText = authenticationMatch[1].toLowerCase();
        return {
          kind: "authentication",
          value:
            valueText === "none" ||
            valueText === "simple" ||
            valueText === "cryptographic"
              ? valueText
              : "other",
          valueText,
          valueRange: tokenRange(authenticationMatch[1]),
          ...bodyRange,
        };
      }

      const rxBufferMatch = item.match(/^rx\s+buffer\s+(.+)$/iu);
      if (rxBufferMatch?.[1]) {
        const value = rxBufferMatch[1].trim().toLowerCase();
        return {
          kind: "rx-buffer",
          value,
          valueRange: tokenRange(rxBufferMatch[1]),
          ...bodyRange,
        };
      }

      const txMatch = item.match(/^tx\s+(tos|priority|length)\s+(.+)$/iu);
      if (txMatch?.[1] && txMatch[2]) {
        const value = txMatch[2].trim();
        return {
          kind: "tx",
          option: txMatch[1].toLowerCase() as "tos" | "priority" | "length",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const neighborsMatch = item.match(/^neighbors\s+(\{[\s\S]*\})$/iu);
      if (neighborsMatch?.[1]) {
        const neighborsBodyText = neighborsMatch[1];
        const neighborsBodyRange = tokenRange(neighborsBodyText);
        return {
          kind: "neighbors",
          entries: parseOspfAreaInterfaceNeighbors(
            neighborsBodyText,
            neighborsBodyRange,
            tokenRange,
          ),
          bodyText: neighborsBodyText,
          bodyRange: neighborsBodyRange,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseOspfAreaEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "ospf-area" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const boolMatch = item.match(
        /^(stub|nssa|summary|translator)(?:\s+(\S+))?$/iu,
      );
      if (boolMatch?.[1]) {
        const valueText = boolMatch[2];
        const value = parseBoolToken(valueText);
        if (value === undefined) {
          return {
            kind: "other",
            text: item,
            ...bodyRange,
          };
        }

        return {
          kind: boolMatch[1].toLowerCase() as
            | "stub"
            | "nssa"
            | "summary"
            | "translator",
          value,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const defaultNssaMatch = item.match(/^default\s+nssa(?:\s+(\S+))?$/iu);
      if (defaultNssaMatch) {
        const valueText = defaultNssaMatch[1];
        const value = parseBoolToken(valueText);
        if (value === undefined) {
          return {
            kind: "other",
            text: item,
            ...bodyRange,
          };
        }

        return {
          kind: "default-nssa",
          value,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const defaultCostMatch = item.match(/^default\s+(cost2|cost)\s+(.+)$/iu);
      if (defaultCostMatch?.[1] && defaultCostMatch[2]) {
        const value = defaultCostMatch[2].trim();
        return {
          kind:
            defaultCostMatch[1].toLowerCase() === "cost2"
              ? "default-cost2"
              : "default-cost",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const stubCostMatch = item.match(/^stub\s+cost\s+(.+)$/iu);
      if (stubCostMatch?.[1]) {
        const value = stubCostMatch[1].trim();
        return {
          kind: "stub-cost",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const translatorStabilityMatch = item.match(
        /^translator\s+stability\s+(.+)$/iu,
      );
      if (translatorStabilityMatch?.[1]) {
        const value = translatorStabilityMatch[1].trim();
        return {
          kind: "translator-stability",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const prefixListMatch = item.match(
        /^(networks|external)\s+(\{[\s\S]*\})$/iu,
      );
      if (prefixListMatch?.[1] && prefixListMatch[2]) {
        const bodyText = prefixListMatch[2];
        const prefixListBodyRange = tokenRange(bodyText);
        return {
          kind: prefixListMatch[1].toLowerCase() as "networks" | "external",
          entries: parseOspfAreaPrefixListEntries(
            bodyText,
            prefixListBodyRange,
            tokenRange,
          ),
          bodyText,
          bodyRange: prefixListBodyRange,
          ...bodyRange,
        };
      }

      const stubnetMatch = item.match(
        /^stubnet\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu,
      );
      if (stubnetMatch?.[1]) {
        const prefix = stubnetMatch[1];
        const stubnetBodyText = stubnetMatch[2];
        const stubnetBodyRange = stubnetBodyText
          ? tokenRange(stubnetBodyText)
          : undefined;
        return {
          kind: "stubnet",
          prefix,
          prefixRange: tokenRange(prefix),
          entries:
            stubnetBodyText && stubnetBodyRange
              ? parseOspfAreaStubnetEntries(
                  stubnetBodyText,
                  stubnetBodyRange,
                  tokenRange,
                )
              : [],
          bodyText: stubnetBodyText,
          bodyRange: stubnetBodyRange,
          ...bodyRange,
        };
      }

      const interfaceMatch = item.match(
        /^interface\b([\s\S]*?)(?:\s+(\{[\s\S]*\}))?$/iu,
      );
      if (interfaceMatch?.[1]) {
        const rest = interfaceMatch[1].trim();
        const bodyText = interfaceMatch[2];
        const instanceMatch = rest.match(/\s+instance\s+(\S+)\s*$/iu);
        const instanceId = instanceMatch?.[1];
        const patternsText = instanceMatch
          ? rest.slice(0, instanceMatch.index).trim()
          : rest;
        const patternTexts = patternsText
          .split(",")
          .map((pattern) => pattern.trim())
          .filter(Boolean);
        const interfaceBodyRange = bodyText ? tokenRange(bodyText) : undefined;
        return {
          kind: "interface",
          patterns: patternTexts.map((pattern) => stripQuotedText(pattern)),
          patternRanges: patternTexts.map((pattern) => tokenRange(pattern)),
          instanceId,
          instanceIdRange: instanceId ? tokenRange(instanceId) : undefined,
          entries:
            bodyText && interfaceBodyRange
              ? parseOspfAreaInterfaceEntries(
                  bodyText,
                  interfaceBodyRange,
                  tokenRange,
                )
              : [],
          bodyText,
          bodyRange: interfaceBodyRange,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseOspfAreaTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const areaMatch = trimmed.match(/^area\s+(\S+)\s+(\{[\s\S]*\})$/iu);
  if (!areaMatch?.[1] || !areaMatch[2]) {
    return undefined;
  }

  const areaId = areaMatch[1];
  const bodyText = areaMatch[2];
  const bodyRange = tokenRange(bodyText);
  return {
    kind: "ospf-area",
    areaId,
    areaIdRange: tokenRange(areaId),
    entries: parseOspfAreaEntries(bodyText, bodyRange, tokenRange),
    bodyText,
    bodyRange,
    ...statementRange,
  };
};

const parseBabelTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const randomizeRouterIdMatch = trimmed.match(
    /^randomize\s+router\s+id(?:\s+(\S+))?$/iu,
  );
  if (randomizeRouterIdMatch) {
    const valueText = randomizeRouterIdMatch[1];
    const value = parseBoolToken(valueText);
    if (value === undefined) {
      return undefined;
    }

    return {
      kind: "babel-option",
      option: "randomize-router-id",
      value,
      valueText,
      valueRange: valueText ? tokenRange(valueText) : undefined,
      ...statementRange,
    };
  }

  return undefined;
};

const parseBabelInterfaceEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "babel-interface" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return body
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const typeMatch = item.match(/^type\s+(\S+)$/iu);
      if (typeMatch?.[1]) {
        const valueText = typeMatch[1].toLowerCase();
        return {
          kind: "type",
          value:
            valueText === "wired" ||
            valueText === "wireless" ||
            valueText === "tunnel"
              ? valueText
              : "other",
          valueText,
          valueRange: tokenRange(typeMatch[1]),
          ...bodyRange,
        };
      }

      const simpleValueMatch = item.match(
        /^(rxcost|limit|tx\s+length)\s+(.+)$/iu,
      );
      if (simpleValueMatch?.[1] && simpleValueMatch[2]) {
        const option = simpleValueMatch[1].toLowerCase();
        const kind =
          option === "rxcost"
            ? "rxcost"
            : option === "limit"
              ? "limit"
              : "tx-length";
        const value = simpleValueMatch[2].trim();
        return {
          kind,
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const timerMatch = item.match(/^(hello|update)\s+interval\s+(.+)$/iu);
      if (timerMatch?.[1] && timerMatch[2]) {
        const value = timerMatch[2].trim();
        return {
          kind: "timer",
          option:
            timerMatch[1].toLowerCase() === "hello"
              ? "hello-interval"
              : "update-interval",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const bufferMatch = item.match(/^rx\s+buffer\s+(.+)$/iu);
      if (bufferMatch?.[1]) {
        const value = bufferMatch[1].trim();
        return {
          kind: "buffer",
          option: "rx-buffer",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const txMatch = item.match(
        /^tx\s+(?!length\b|priority\b)(\S+)\s+(.+)$/iu,
      );
      if (txMatch?.[1] && txMatch[2]) {
        const value = txMatch[2].trim();
        return {
          kind: "tx",
          option: txMatch[1].toLowerCase(),
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const txPriorityMatch = item.match(/^tx\s+priority\s+(.+)$/iu);
      if (txPriorityMatch?.[1]) {
        const value = txPriorityMatch[1].trim();
        return {
          kind: "tx-priority",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const checkLinkMatch = item.match(/^check\s+link(?:\s+(\S+))?$/iu);
      if (checkLinkMatch) {
        const valueText = checkLinkMatch[1];
        return {
          kind: "check-link",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const nextHopMatch = item.match(/^next\s+hop\s+(ipv4|ipv6)\s+(\S+)$/iu);
      if (nextHopMatch?.[1] && nextHopMatch[2]) {
        const family = nextHopMatch[1].toLowerCase() as "ipv4" | "ipv6";
        const address = nextHopMatch[2];
        return {
          kind: "next-hop",
          family,
          address,
          addressKind: isIpLiteralCandidate(address) ? "ip" : "other",
          addressRange: tokenRange(address),
          ...bodyRange,
        };
      }

      const nextHopPreferMatch = item.match(/^next\s+hop\s+prefer\s+(\S+)$/iu);
      if (nextHopPreferMatch?.[1]) {
        const valueText = nextHopPreferMatch[1].toLowerCase();
        return {
          kind: "next-hop-prefer",
          value:
            valueText === "native" || valueText === "ipv6"
              ? valueText
              : "other",
          valueText,
          valueRange: tokenRange(nextHopPreferMatch[1]),
          ...bodyRange,
        };
      }

      const extendedNextHopMatch = item.match(
        /^extended\s+next\s+hop(?:\s+(\S+))?$/iu,
      );
      if (extendedNextHopMatch) {
        const valueText = extendedNextHopMatch[1];
        return {
          kind: "extended-next-hop",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const authenticationMatch = item.match(
        /^authentication\s+(\S+)(?:\s+(permissive))?$/iu,
      );
      if (authenticationMatch?.[1]) {
        const permissiveText = authenticationMatch[2];
        return {
          kind: "authentication",
          authType: authenticationMatch[1].toLowerCase(),
          authTypeRange: tokenRange(authenticationMatch[1]),
          permissive: Boolean(permissiveText),
          permissiveRange: permissiveText
            ? tokenRange(permissiveText)
            : undefined,
          ...bodyRange,
        };
      }

      const passwordMatch = item.match(/^password\s+(.+)$/iu);
      if (passwordMatch?.[1]) {
        const valueText = passwordMatch[1].trim();
        return {
          kind: "password",
          value: stripQuotedText(valueText),
          valueText,
          valueRange: tokenRange(valueText),
          ...bodyRange,
        };
      }

      const rttMatch = item.match(/^(rtt)\s+(min|max|cost|decay)\s+(.+)$/iu);
      if (rttMatch?.[2] && rttMatch[3]) {
        const value = rttMatch[3].trim();
        return {
          kind: "rtt",
          option: rttMatch[2].toLowerCase() as "min" | "max" | "cost" | "decay",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const sendTimestampsMatch = item.match(
        /^send\s+timestamps(?:\s+(\S+))?$/iu,
      );
      if (sendTimestampsMatch) {
        const valueText = sendTimestampsMatch[1];
        return {
          kind: "send-timestamps",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseBabelInterfaceTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const interfaceMatch = trimmed.match(/^interface\b(.*)$/isu);
  const rest = interfaceMatch?.[1]?.trim();
  if (!rest) {
    return undefined;
  }

  const bodyMatch = rest.match(/\{[\s\S]*\}$/u);
  const bodyText = bodyMatch?.[0];
  if (!bodyText) {
    return undefined;
  }

  const patternText = rest.slice(0, rest.indexOf(bodyText)).trim();
  const patternMatches = [...patternText.matchAll(/"[^"]+"|'[^']+'|\S+/gu)];
  const patterns = patternMatches.map((match) => stripQuotedText(match[0]));
  const patternRanges = patternMatches.map((match) => tokenRange(match[0]));
  const bodyRange = tokenRange(bodyText);

  return {
    kind: "babel-interface",
    patterns,
    patternRanges,
    entries: parseBabelInterfaceEntries(bodyText, bodyRange, tokenRange),
    bodyText,
    bodyRange,
    ...statementRange,
  };
};

const parseRadvInterfaceEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<ProtocolStatement, { kind: "radv-interface" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  const statements = splitTopLevelStatements(body);
  return statements
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const prefixMatch = item.match(/^prefix\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu);
      if (prefixMatch?.[1]) {
        const prefix = prefixMatch[1];
        const prefixBodyText = prefixMatch[2];
        const prefixBodyRange = prefixBodyText
          ? tokenRange(prefixBodyText)
          : undefined;
        return {
          kind: "prefix",
          prefix,
          prefixRange: tokenRange(prefix),
          entries: prefixBodyText
            ? parseRadvPrefixEntries(prefixBodyText, bodyRange, tokenRange)
            : [],
          bodyText: prefixBodyText,
          bodyRange: prefixBodyRange,
          ...bodyRange,
        };
      }

      const maxRaIntervalMatch = item.match(/^max\s+ra\s+interval\s+(.+)$/iu);
      if (maxRaIntervalMatch?.[1]) {
        const value = maxRaIntervalMatch[1].trim();
        return {
          kind: "timer",
          option: "max-ra-interval",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const rdnssLocalMatch = item.match(/^rdnss\s+local(?:\s+(\S+))?$/iu);
      if (rdnssLocalMatch) {
        const valueText = rdnssLocalMatch[1];
        return {
          kind: "local",
          option: "rdnss-local",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const splitTopLevelStatements = (body: string): string[] => {
  const statements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === ";" && depth === 0) {
      statements.push(body.slice(start, index));
      start = index + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
};

const parseRadvPrefixEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): Extract<
  Extract<ProtocolStatement, { kind: "radv-interface" }>["entries"][number],
  { kind: "prefix" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const boolMatch = item.match(
        /^(skip|onlink|autonomous|pd\s+preferred)(?:\s+(\S+))?$/iu,
      );
      if (boolMatch?.[1]) {
        const valueText = boolMatch[2];
        const optionText = boolMatch[1].toLowerCase().replace(/\s+/gu, "-");
        return {
          kind: optionText as "skip" | "onlink" | "autonomous" | "pd-preferred",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const lifetimeMatch = item.match(
        /^(valid|preferred)\s+lifetime\s+(\S+)(?:\s+sensitive\s+(\S+))?$/iu,
      );
      if (lifetimeMatch?.[1] && lifetimeMatch[2]) {
        const value = lifetimeMatch[2];
        const sensitiveText = lifetimeMatch[3];
        return {
          kind: "lifetime",
          option:
            lifetimeMatch[1].toLowerCase() === "valid"
              ? "valid-lifetime"
              : "preferred-lifetime",
          value,
          valueRange: tokenRange(value),
          sensitive: parseBoolToken(sensitiveText),
          sensitiveText,
          sensitiveRange: sensitiveText ? tokenRange(sensitiveText) : undefined,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseRadvInterfaceTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const interfaceMatch = trimmed.match(/^interface\b(.*)$/isu);
  const rest = interfaceMatch?.[1]?.trim();
  if (!rest) {
    return undefined;
  }

  const bodyMatch = rest.match(/\{[\s\S]*\}$/u);
  const bodyText = bodyMatch?.[0];
  if (!bodyText) {
    return undefined;
  }

  const patternText = rest.slice(0, rest.indexOf(bodyText)).trim();
  const patternMatches = [...patternText.matchAll(/"[^"]+"|'[^']+'|\S+/gu)];
  const patterns = patternMatches.map((match) => stripQuotedText(match[0]));
  const patternRanges = patternMatches.map((match) => tokenRange(match[0]));
  const bodyRange = tokenRange(bodyText);

  return {
    kind: "radv-interface",
    patterns,
    patternRanges,
    entries: parseRadvInterfaceEntries(bodyText, bodyRange, tokenRange),
    bodyText,
    bodyRange,
    ...statementRange,
  };
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

const parseStaticOptionStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  const phraseNodes = phraseNodesOf(statementNode);
  const statementRange = toRange(statementNode, source);

  if (
    phraseTextAt(phraseNodes, 0, source) === "check" &&
    phraseTextAt(phraseNodes, 1, source) === "link" &&
    phraseNodes.length <= 3
  ) {
    const valueNode = phraseNodes[2];
    const valueText = isNode(valueNode) ? textOf(valueNode, source) : undefined;
    return {
      kind: "static-option",
      option: "check-link",
      value: parseBoolToken(valueText) ?? true,
      valueText,
      valueRange: isNode(valueNode) ? toRange(valueNode, source) : undefined,
      ...statementRange,
    };
  }

  if (
    phraseTextAt(phraseNodes, 0, source) === "igp" &&
    phraseTextAt(phraseNodes, 1, source) === "table" &&
    isNode(phraseNodes[2])
  ) {
    const tableNameNode = phraseNodes[2];
    return {
      kind: "static-igp-table",
      tableName: textOf(tableNameNode, source),
      tableNameRange: toRange(tableNameNode, source),
      ...statementRange,
    };
  }

  return undefined;
};

const unquoteProtocolToken = (value: string): string =>
  stripQuotedText(value.trim());

const quotedOrBareToken = "\"[^\"]+\"|'[^']+'|\\S+";

const rangeForStatementToken = (
  source: string,
  statementNode: SyntaxNode,
  token: string,
): SourceRange => {
  const tokenIndex = source.indexOf(token, statementNode.startIndex);
  if (tokenIndex === -1 || tokenIndex > statementNode.endIndex) {
    return toRange(statementNode, source);
  }

  return indexToRange(
    source,
    lineStartsOf(source),
    tokenIndex,
    tokenIndex + token.length,
  );
};

const rangeForTextToken = (
  source: string,
  statementRange: SourceRange,
  token: string,
): SourceRange => {
  const lineStarts = lineStartsOf(source);
  const statementStartIndex = source.indexOf(
    token,
    lineStarts[statementRange.line - 1] ?? 0,
  );
  if (statementStartIndex === -1) {
    return statementRange;
  }

  const tokenStart = source.indexOf(token, statementStartIndex);
  if (tokenStart === -1) {
    return statementRange;
  }

  return indexToRange(
    source,
    lineStarts,
    tokenStart,
    tokenStart + token.length,
  );
};

const parseRpkiOtherTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: (token: string) => SourceRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");

  const remoteMatch = trimmed.match(
    new RegExp(
      `^remote\\s+(${quotedOrBareToken})(?:\\s+port\\s+(\\S+))?$`,
      "iu",
    ),
  );
  if (remoteMatch) {
    const addressText = remoteMatch[1] ?? "";
    const address = unquoteProtocolToken(addressText);
    const port = remoteMatch[2]?.trim();
    return {
      kind: "rpki-remote",
      address,
      addressKind: isIpLiteralCandidate(address)
        ? "ip"
        : addressText.startsWith('"') || addressText.startsWith("'")
          ? "hostname"
          : "other",
      addressRange: tokenRange(addressText),
      port,
      portRange: port ? tokenRange(port) : undefined,
      ...statementRange,
    };
  }

  const portMatch = trimmed.match(/^port\s+(\S+)$/iu);
  if (portMatch?.[1]) {
    return {
      kind: "rpki-port",
      port: portMatch[1],
      portRange: tokenRange(portMatch[1]),
      ...statementRange,
    };
  }

  const localAddressMatch = trimmed.match(/^local\s+address\s+(\S+)$/iu);
  if (localAddressMatch?.[1]) {
    const address = localAddressMatch[1];
    return {
      kind: "rpki-local-address",
      address,
      addressKind: isIpLiteralCandidate(address) ? "ip" : "other",
      addressRange: tokenRange(address),
      ...statementRange,
    };
  }

  const transportMatch = trimmed.match(/^transport\s+(\S+)(?:\s+(.+))?$/isu);
  if (transportMatch?.[1]) {
    const transportText = transportMatch[1].toLowerCase();
    const bodyText = transportMatch[2]?.trim();
    return {
      kind: "rpki-transport",
      transport:
        transportText === "tcp" || transportText === "ssh"
          ? transportText
          : "other",
      transportRange: tokenRange(transportMatch[1]),
      bodyText,
      bodyRange: bodyText ? tokenRange(bodyText) : undefined,
      ...statementRange,
    };
  }

  const timerMatch = trimmed.match(
    /^(refresh|retry|expire)\s+(keep\s+)?(\S+)$/iu,
  );
  if (timerMatch?.[1] && timerMatch[3]) {
    const value = timerMatch[3];
    return {
      kind: "rpki-timer",
      option: timerMatch[1].toLowerCase() as "refresh" | "retry" | "expire",
      keep: Boolean(timerMatch[2]),
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  const ignoreMatch = trimmed.match(/^ignore\s+max\s+length(?:\s+(\S+))?$/iu);
  if (ignoreMatch) {
    const valueText = ignoreMatch[1]?.trim();
    return {
      kind: "rpki-ignore-max-length",
      value: parseBoolToken(valueText) ?? true,
      valueText,
      valueRange: valueText ? tokenRange(valueText) : undefined,
      ...statementRange,
    };
  }

  const versionMatch = trimmed.match(/^(min|max)\s+version\s+(\S+)$/iu);
  if (versionMatch?.[1] && versionMatch[2]) {
    const value = versionMatch[2];
    return {
      kind: "rpki-version",
      option: versionMatch[1].toLowerCase() as "min" | "max",
      value,
      valueRange: tokenRange(value),
      ...statementRange,
    };
  }

  return undefined;
};

const parseRpkiStatement = (
  statementNode: SyntaxNode,
  source: string,
): ProtocolStatement | undefined => {
  const statementRange = toRange(statementNode, source);
  return parseRpkiOtherTextStatement(
    textOf(statementNode, source),
    statementRange,
    (token) => rangeForStatementToken(source, statementNode, token),
  );
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

const mergeRpkiLocalAddressStatements = (
  statements: ProtocolStatement[],
): ProtocolStatement[] => {
  const consumed = new Set<number>();

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (
      statement?.kind !== "other" ||
      statement.text.toLowerCase() !== "local address"
    ) {
      continue;
    }

    const nextIndex = statements.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate.kind === "other" &&
        candidate.line === statement.line &&
        candidate.column === statement.endColumn + 1,
    );
    const next = statements[nextIndex];
    if (next?.kind !== "other") {
      continue;
    }

    const localAddress = parseRpkiOtherTextStatement(
      `${statement.text} ${next.text}`,
      mergeRanges(statement, next),
      (token) => {
        if (token === next.text.replace(/;\s*$/u, "")) {
          return next;
        }

        return mergeRanges(statement, next);
      },
    );

    if (localAddress) {
      statements[index] = localAddress;
      consumed.add(nextIndex);
    }
  }

  return statements.filter((_, index) => !consumed.has(index));
};

const mergeBmpLocalAddressStatements = (
  statements: ProtocolStatement[],
): ProtocolStatement[] => {
  const consumed = new Set<number>();

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (
      statement?.kind !== "other" ||
      statement.text.toLowerCase() !== "local address"
    ) {
      continue;
    }

    const nextIndex = statements.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate.kind === "other" &&
        candidate.line === statement.line &&
        candidate.column === statement.endColumn + 1,
    );
    const next = statements[nextIndex];
    if (next?.kind !== "other") {
      continue;
    }

    const address = next.text.replace(/;\s*$/u, "").trim();
    if (!address) {
      continue;
    }

    statements[index] = {
      kind: "bmp-option",
      option: "local-address",
      value: address,
      valueRange: next,
      ...mergeRanges(statement, next),
    };
    consumed.add(nextIndex);
  }

  return statements.filter((_, index) => !consumed.has(index));
};

const mergeBfdAcceptHopStatements = (
  statements: ProtocolStatement[],
): ProtocolStatement[] => {
  const consumed = new Set<number>();

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (
      statement?.kind !== "bfd-option" ||
      statement.option !== "accept" ||
      statement.sessionTypes?.length !== 0
    ) {
      continue;
    }

    const nextIndex = statements.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate.kind === "bgp-hop-mode" &&
        candidate.line === statement.line &&
        candidate.column === statement.endColumn + 1,
    );
    const next = statements[nextIndex];
    if (next?.kind !== "bgp-hop-mode") {
      continue;
    }

    statements[index] = {
      ...statement,
      sessionTypes: [next.mode],
      ...mergeRanges(statement, next),
    };
    consumed.add(nextIndex);
  }

  return statements.filter((_, index) => !consumed.has(index));
};

const mergeBfdNeighborTailStatements = (
  statements: ProtocolStatement[],
): ProtocolStatement[] => {
  const consumed = new Set<number>();

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (statement?.kind !== "neighbor") {
      continue;
    }

    const nextIndex = statements.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate.kind === "other" &&
        candidate.line === statement.line &&
        candidate.column === statement.endColumn + 1,
    );
    const next = statements[nextIndex];
    const text =
      next?.kind === "other"
        ? `neighbor ${statement.address} ${next.text}`
        : `neighbor ${statement.address}`;
    const range =
      next?.kind === "other" ? mergeRanges(statement, next) : statement;
    const bfdNeighbor = parseBfdNeighborTextStatement(text, range, (token) => {
      if (token === statement.address) {
        return statement.addressRange;
      }

      if (next?.kind === "other") {
        return next;
      }

      return range;
    });

    if (!bfdNeighbor) {
      continue;
    }

    statements[index] = bfdNeighbor;
    if (next?.kind === "other") {
      consumed.add(nextIndex);
    }
  }

  return statements.filter((_, index) => !consumed.has(index));
};

export const parseProtocolStatements = (
  blockNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
  protocolType = "",
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

    if (statementNode.type === "local_role_statement") {
      const localRole = parseLocalRoleStatement(statementNode, source);
      if (localRole) {
        statements.push(localRole);
      }
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
      if (protocolType === "pipe") {
        const pipeImportIn = parsePipeImportInStatement(statementNode, source);
        if (pipeImportIn) {
          statements.push(pipeImportIn);
          continue;
        }
      }

      if (protocolType === "l3vpn" || protocolType === "evpn") {
        const vpnOption = parseVpnOptionTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (vpnOption) {
          statements.push(vpnOption);
          continue;
        }
      }

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
      if (protocolType === "l3vpn" || protocolType === "evpn") {
        const vpnOption = parseVpnOptionTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (vpnOption) {
          statements.push(vpnOption);
          continue;
        }
      }

      if (protocolType === "evpn") {
        const evpnStatement = parseEvpnTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (evpnStatement) {
          statements.push(evpnStatement);
          continue;
        }
      }

      if (protocolType === "bridge") {
        const bridgeStatement = parseBridgeOptionTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (bridgeStatement) {
          statements.push(bridgeStatement);
          continue;
        }
      }

      if (protocolType === "mrt") {
        const mrtOption = parseMrtOptionStatement(statementNode, source);
        if (mrtOption) {
          statements.push(mrtOption);
          continue;
        }
      }

      if (protocolType === "aggregator") {
        const aggregatorOption = parseAggregatorOptionStatement(
          statementNode,
          source,
        );
        if (aggregatorOption) {
          statements.push(aggregatorOption);
          continue;
        }
      }

      if (protocolType === "pipe") {
        const pipeOption = parsePipeOptionStatement(statementNode, source);
        if (pipeOption) {
          statements.push(pipeOption);
          continue;
        }
      }

      if (protocolType === "bmp") {
        const bmpOption = parseBmpOptionStatement(statementNode, source);
        if (bmpOption) {
          statements.push(bmpOption);
          continue;
        }
      }

      if (protocolType === "bfd") {
        const bfdStatement = parseBfdTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (bfdStatement) {
          statements.push(bfdStatement);
          continue;
        }
      }

      if (protocolType === "babel") {
        const statementText = textOf(statementNode, source);
        const babelStatement =
          parseBabelInterfaceTextStatement(
            statementText,
            statementRange,
            (token) => rangeForStatementToken(source, statementNode, token),
          ) ??
          parseBabelTextStatement(statementText, statementRange, (token) =>
            rangeForStatementToken(source, statementNode, token),
          );
        if (babelStatement) {
          statements.push(babelStatement);
          continue;
        }
      }

      if (protocolType.toLowerCase().startsWith("ospf")) {
        const statementText = textOf(statementNode, source);
        const ospfStatement =
          parseOspfAreaTextStatement(statementText, statementRange, (token) =>
            rangeForStatementToken(source, statementNode, token),
          ) ??
          parseOspfOptionTextStatement(statementText, statementRange, (token) =>
            rangeForStatementToken(source, statementNode, token),
          );
        if (ospfStatement) {
          statements.push(ospfStatement);
          continue;
        }
      }

      if (protocolType === "radv") {
        const radvStatement = parseRadvInterfaceTextStatement(
          textOf(statementNode, source),
          statementRange,
          (token) => rangeForStatementToken(source, statementNode, token),
        );
        if (radvStatement) {
          statements.push(radvStatement);
          continue;
        }
      }

      if (protocolType === "static") {
        const staticOption = parseStaticOptionStatement(statementNode, source);
        if (staticOption) {
          statements.push(staticOption);
          continue;
        }
      }

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

      const rpkiStatement = parseRpkiStatement(statementNode, source);
      if (rpkiStatement) {
        statements.push(rpkiStatement);
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
      const fallbackRange = mergeRanges(
        toRange(currentNode, source),
        toRange(lastNode, source),
      );
      const vpnOption =
        protocolType === "l3vpn" || protocolType === "evpn"
          ? parseVpnOptionTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            )
          : undefined;
      const evpnStatement =
        protocolType === "evpn"
          ? parseEvpnTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            )
          : undefined;
      const bridgeStatement =
        protocolType === "bridge"
          ? parseBridgeOptionTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            )
          : undefined;
      const ospfStatement = protocolType.toLowerCase().startsWith("ospf")
        ? (parseOspfAreaTextStatement(text, fallbackRange, (token) =>
            rangeForTextToken(source, fallbackRange, token),
          ) ??
          parseOspfOptionTextStatement(text, fallbackRange, (token) =>
            rangeForTextToken(source, fallbackRange, token),
          ))
        : undefined;
      const bfdStatement =
        protocolType === "bfd"
          ? parseBfdTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            )
          : undefined;
      const babelStatement =
        protocolType === "babel"
          ? (parseBabelInterfaceTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            ) ??
            parseBabelTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            ))
          : undefined;
      const radvStatement =
        protocolType === "radv"
          ? parseRadvInterfaceTextStatement(text, fallbackRange, (token) =>
              rangeForTextToken(source, fallbackRange, token),
            )
          : undefined;
      statements.push(
        vpnOption ??
          evpnStatement ??
          bridgeStatement ??
          ospfStatement ??
          bfdStatement ??
          babelStatement ??
          radvStatement ?? {
            kind: "other",
            text,
            ...fallbackRange,
          },
      );
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

  const protocolMergedStatements =
    protocolType === "rpki"
      ? mergeRpkiLocalAddressStatements(mergedStatements)
      : protocolType === "bmp"
        ? mergeBmpLocalAddressStatements(mergedStatements)
        : protocolType === "bfd"
          ? mergeBfdNeighborTailStatements(
              mergeBfdAcceptHopStatements(mergedStatements),
            )
          : mergedStatements;

  return mergeNeighborTailStatements(protocolMergedStatements, issues).sort(
    (left, right) => {
      if (left.line !== right.line) {
        return left.line - right.line;
      }

      return left.column - right.column;
    },
  );
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
      ? parseProtocolStatements(bodyNode, source, issues, protocolType)
      : [],
    ...declarationRange,
  };
};
