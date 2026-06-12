import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  AttributeDeclaration,
  BirdDeclaration,
  MplsDomainDeclaration,
  ParseIssue,
  SourceRange,
  TableDeclaration,
  TableOptionEntry,
} from "../types.js";
import {
  parseAttributeDeclaration,
  parseDefineDeclaration,
  parseIncludeDeclaration,
  parseMplsDomainDeclaration,
  parseRouterIdDeclaration,
  parseTableDeclaration,
  parseTemplateDeclaration,
} from "./basic.js";
import { parseFilterDeclaration, parseFunctionDeclaration } from "./filter.js";
import { parseProtocolDeclaration } from "./protocol.js";
import {
  parseGracefulRestartWaitFromStatement,
  parseHostnameOverrideFromStatement,
  parseRouterIdFromStatement,
  parseTableFromStatement,
  parseTimeformatFromStatement,
  parseWatchdogFromStatement,
} from "./top-level.js";
import { normalizeTableType } from "./shared.js";
import { indexToRange, lineStartsOf } from "../tree.js";

const IPV6_SADR_TABLE_LINE =
  /^(\s*)ipv6\s+sadr\s+table\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s+.*)?;\s*$/i;
const TABLE_BLOCK_HEADER =
  /\b((?:ipv6\s+sadr|ipv4-mpls|ipv6-mpls|vpn4-mpls|vpn6-mpls|routing|ipv4|ipv6|vpn4|vpn6|roa4|roa6|aspa|mpls|eth|evpn|neighbor|flow4|flow6)?)\s*table\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{/gi;
const ATTRIBUTE_DECLARATION_LINE =
  /^(\s*)attribute\s+([A-Za-z_][A-Za-z0-9_-]*(?:\s+set)?)\s+([A-Za-z_][A-Za-z0-9_-]*)\s*;\s*$/i;
const MPLS_DOMAIN_HEADER = /^(\s*)mpls\s+domain\s+([A-Za-z_][A-Za-z0-9_-]*)\b/i;

const sourceRangeForLineSlice = (
  line: number,
  startColumn: number,
  text: string,
): SourceRange => ({
  line,
  column: startColumn,
  endLine: line,
  endColumn: startColumn + text.length,
});

const countChar = (text: string, char: string): number => {
  let count = 0;
  for (const current of text) {
    if (current === char) {
      count += 1;
    }
  }
  return count;
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

const valueRangeInStatement = (
  source: string,
  lineStarts: number[],
  statementStartIndex: number,
  statementText: string,
  value: string,
): SourceRange => {
  const relativeIndex = statementText.indexOf(value);
  const startIndex =
    relativeIndex === -1
      ? statementStartIndex
      : statementStartIndex + relativeIndex;
  return indexToRange(
    source,
    lineStarts,
    startIndex,
    startIndex + value.length,
  );
};

const parseTableOptionEntries = (
  source: string,
  lineStarts: number[],
  bodyStartIndex: number,
  bodyText: string,
): TableOptionEntry[] => {
  const entries: TableOptionEntry[] = [];
  const statements = bodyText.matchAll(/((?:[^;{}]|\{[^{}]*\})+);/gu);

  for (const statementMatch of statements) {
    if (statementMatch.index === undefined) {
      continue;
    }

    const rawStatement = statementMatch[1] ?? "";
    const statementText = rawStatement.trim();
    if (statementText.length === 0) {
      continue;
    }

    const statementStartIndex =
      bodyStartIndex +
      statementMatch.index +
      rawStatement.indexOf(statementText);
    const statementRange = indexToRange(
      source,
      lineStarts,
      statementStartIndex,
      statementStartIndex + statementText.length,
    );
    const lowered = statementText.toLowerCase();

    const trieMatch = lowered.match(/^trie(?:\s+(\S+))?$/u);
    if (trieMatch) {
      const valueText = trieMatch[1];
      entries.push({
        kind: "trie",
        value:
          valueText === undefined ||
          valueText === "yes" ||
          valueText === "on" ||
          valueText === "true",
        valueText,
        valueRange: valueText
          ? valueRangeInStatement(
              source,
              lineStarts,
              statementStartIndex,
              statementText,
              valueText,
            )
          : undefined,
        ...statementRange,
      });
      continue;
    }

    const sortedMatch = lowered.match(/^sorted(?:\s+(\S+))?$/u);
    if (sortedMatch) {
      const valueText = sortedMatch[1];
      entries.push({
        kind: "sorted",
        value:
          valueText === undefined ||
          valueText === "yes" ||
          valueText === "on" ||
          valueText === "true",
        valueText,
        valueRange: valueText
          ? valueRangeInStatement(
              source,
              lineStarts,
              statementStartIndex,
              statementText,
              valueText,
            )
          : undefined,
        ...statementRange,
      });
      continue;
    }

    const debugMatch = statementText.match(/^debug\s+(.+)$/iu);
    if (debugMatch?.[1]) {
      const clauseText = debugMatch[1].trim();
      entries.push({
        kind: "debug",
        clauseText,
        clauseRange: valueRangeInStatement(
          source,
          lineStarts,
          statementStartIndex,
          statementText,
          clauseText,
        ),
        ...statementRange,
      });
      continue;
    }

    const corkThresholdMatch = statementText.match(
      /^cork\s+threshold\s+(\S+)\s+(.+)$/iu,
    );
    if (corkThresholdMatch?.[1] && corkThresholdMatch[2]) {
      const low = corkThresholdMatch[1].trim();
      const high = corkThresholdMatch[2].trim();
      entries.push({
        kind: "cork-threshold",
        low,
        high,
        lowRange: valueRangeInStatement(
          source,
          lineStarts,
          statementStartIndex,
          statementText,
          low,
        ),
        highRange: valueRangeInStatement(
          source,
          lineStarts,
          statementStartIndex,
          statementText,
          high,
        ),
        ...statementRange,
      });
      continue;
    }

    const threadGroupMatch = statementText.match(/^thread\s+group\s+(.+)$/iu);
    if (threadGroupMatch?.[1]) {
      const name = threadGroupMatch[1].trim();
      entries.push({
        kind: "thread-group",
        name,
        nameRange: valueRangeInStatement(
          source,
          lineStarts,
          statementStartIndex,
          statementText,
          name,
        ),
        ...statementRange,
      });
      continue;
    }

    const gcMatch = statementText.match(/^gc\s+(threshold|period)\s+(.+)$/iu);
    if (gcMatch?.[1] && gcMatch[2]) {
      const value = gcMatch[2].trim();
      entries.push({
        kind:
          gcMatch[1].toLowerCase() === "period" ? "gc-period" : "gc-threshold",
        value,
        valueRange: valueRangeInStatement(
          source,
          lineStarts,
          statementStartIndex,
          statementText,
          value,
        ),
        ...statementRange,
      });
      continue;
    }

    const settleMatch = statementText.match(
      /^(?:(min|max|export|digest)\s+settle\s+time|route\s+refresh\s+export\s+settle\s+time)\s+(.+)$/iu,
    );
    if (settleMatch) {
      const option = lowered.startsWith("route refresh export")
        ? "route-refresh-export"
        : (settleMatch[1]?.toLowerCase() as
            | "min"
            | "max"
            | "export"
            | "digest");
      const value = (settleMatch[2] ?? "").trim();
      if (option && value) {
        entries.push({
          kind: "settle-time",
          option,
          value,
          valueRange: valueRangeInStatement(
            source,
            lineStarts,
            statementStartIndex,
            statementText,
            value,
          ),
          ...statementRange,
        });
        continue;
      }
    }

    entries.push({
      kind: "other",
      text: statementText,
      ...statementRange,
    });
  }

  return entries;
};

const collectFallbackMplsDomainDeclarations = (
  source: string,
  declarations: BirdDeclaration[],
): MplsDomainDeclaration[] => {
  const existingDomains = new Set(
    declarations
      .filter(
        (item): item is MplsDomainDeclaration => item.kind === "mpls-domain",
      )
      .map((item) => `${item.name}:${item.line}`),
  );
  const fallbackDeclarations: MplsDomainDeclaration[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const match = lineText.match(MPLS_DOMAIN_HEADER);
    const name = match?.[2];
    if (!match || !name) {
      continue;
    }

    const line = index + 1;
    const key = `${name}:${line}`;
    if (existingDomains.has(key)) {
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const startColumn = indent + 1;
    const nameColumn = lineText.indexOf(name) + 1;
    let endLineIndex = index;
    let braceBalance = 0;
    let sawBody = false;

    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const currentLine = lines[cursor] ?? "";
      braceBalance += countChar(currentLine, "{");
      braceBalance -= countChar(currentLine, "}");
      sawBody ||= currentLine.includes("{");

      if (sawBody) {
        if (braceBalance <= 0) {
          endLineIndex = cursor;
          break;
        }
        continue;
      }

      if (currentLine.includes(";")) {
        endLineIndex = cursor;
        break;
      }
    }

    const endLineText = lines[endLineIndex] ?? "";
    const declarationRange: SourceRange = {
      line,
      column: startColumn,
      endLine: endLineIndex + 1,
      endColumn: endLineText.trimEnd().length + 1,
    };

    let bodyText: string | undefined;
    let bodyRange: SourceRange | undefined;
    const joinedText = lines.slice(index, endLineIndex + 1).join("\n");
    const bodyStartOffset = joinedText.indexOf("{");
    const bodyEndOffset = joinedText.lastIndexOf("}");
    if (bodyStartOffset !== -1 && bodyEndOffset > bodyStartOffset) {
      bodyText = joinedText.slice(bodyStartOffset, bodyEndOffset + 1);
      const bodyLinesBefore = joinedText.slice(0, bodyStartOffset).split("\n");
      const bodyEndLinesBefore = joinedText
        .slice(0, bodyEndOffset + 1)
        .split("\n");
      const bodyStartLine = line + bodyLinesBefore.length - 1;
      const bodyEndLine = line + bodyEndLinesBefore.length - 1;
      const bodyStartColumn =
        bodyLinesBefore.length === 1
          ? startColumn + bodyStartOffset
          : (bodyLinesBefore.at(-1)?.length ?? 0) + 1;
      const bodyEndColumn = bodyEndLinesBefore.at(-1)?.length ?? 0;
      bodyRange = {
        line: bodyStartLine,
        column: bodyStartColumn,
        endLine: bodyEndLine,
        endColumn: bodyEndColumn + 1,
      };
    }

    fallbackDeclarations.push({
      kind: "mpls-domain",
      name,
      nameRange: sourceRangeForLineSlice(line, nameColumn, name),
      bodyText,
      bodyRange,
      ...declarationRange,
    });
    existingDomains.add(key);
  }

  return fallbackDeclarations;
};

const collectFallbackAttributeDeclarations = (
  source: string,
  declarations: BirdDeclaration[],
): AttributeDeclaration[] => {
  const existingAttributes = new Set(
    declarations
      .filter((item): item is AttributeDeclaration => item.kind === "attribute")
      .map((item) => `${item.attributeType}:${item.name}:${item.line}`),
  );
  const fallbackDeclarations: AttributeDeclaration[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const match = lineText.match(ATTRIBUTE_DECLARATION_LINE);
    const attributeType = match?.[2];
    const name = match?.[3];
    if (!match || !attributeType || !name) {
      continue;
    }

    const line = index + 1;
    const key = `${attributeType}:${name}:${line}`;
    if (existingAttributes.has(key)) {
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const startColumn = indent + 1;
    const statementText = lineText.trimEnd().slice(indent);
    const declarationRange = sourceRangeForLineSlice(
      line,
      startColumn,
      statementText,
    );
    const attributeTypeColumn = lineText.indexOf(attributeType) + 1;
    const nameColumn = lineText.indexOf(name, attributeTypeColumn) + 1;

    fallbackDeclarations.push({
      kind: "attribute",
      attributeType,
      attributeTypeRange: sourceRangeForLineSlice(
        line,
        attributeTypeColumn,
        attributeType,
      ),
      name,
      nameRange: sourceRangeForLineSlice(line, nameColumn, name),
      ...declarationRange,
    });
    existingAttributes.add(key);
  }

  return fallbackDeclarations;
};

const collectFallbackTableDeclarations = (
  source: string,
  declarations: BirdDeclaration[],
): TableDeclaration[] => {
  const existingTables = new Set(
    declarations
      .filter((item): item is TableDeclaration => item.kind === "table")
      .map((item) => `${item.tableType}:${item.name}:${item.line}`),
  );
  const fallbackDeclarations: TableDeclaration[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? "";
    const match = lineText.match(IPV6_SADR_TABLE_LINE);
    const name = match?.[2];
    if (!match || !name) {
      continue;
    }

    const line = index + 1;
    const key = `ipv6-sadr:${name}:${line}`;
    if (existingTables.has(key)) {
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const startColumn = indent + 1;
    const statementText = lineText.trimEnd().slice(indent);
    const declarationRange = sourceRangeForLineSlice(
      line,
      startColumn,
      statementText,
    );
    const nameColumn = lineText.indexOf(name) + 1;

    fallbackDeclarations.push({
      kind: "table",
      tableType: "ipv6-sadr",
      tableTypeRange: sourceRangeForLineSlice(line, startColumn, "ipv6 sadr"),
      name,
      nameRange: sourceRangeForLineSlice(line, nameColumn, name),
      entries: [],
      ...declarationRange,
    });
    existingTables.add(key);
  }

  return fallbackDeclarations;
};

const collectTableBlockDeclarations = (
  source: string,
  declarations: BirdDeclaration[],
): TableDeclaration[] => {
  const tableDeclarations = declarations.filter(
    (item): item is TableDeclaration => item.kind === "table",
  );
  const declarationsByKey = new Map(
    tableDeclarations.map((item) => [`${item.name}:${item.line}`, item]),
  );
  const existingKeys = new Set(
    tableDeclarations.map((item) => `${item.name}:${item.line}`),
  );
  const blockDeclarations: TableDeclaration[] = [];
  const lineStarts = lineStartsOf(source);

  for (const match of source.matchAll(TABLE_BLOCK_HEADER)) {
    if (match.index === undefined) {
      continue;
    }

    const tableTypeText = (match[1] ?? "").trim() || "unknown";
    const name = match[2];
    if (!name) {
      continue;
    }

    const openBraceIndex = source.indexOf(
      "{",
      match.index + match[0].length - 1,
    );
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = findMatchingBraceIndex(source, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    const declarationEndIndex =
      source[closeBraceIndex + 1] === ";"
        ? closeBraceIndex + 2
        : closeBraceIndex + 1;
    const declarationRange = indexToRange(
      source,
      lineStarts,
      match.index,
      declarationEndIndex,
    );
    const bodyText = source.slice(openBraceIndex, closeBraceIndex + 1);
    const bodyRange = indexToRange(
      source,
      lineStarts,
      openBraceIndex,
      closeBraceIndex + 1,
    );
    const bodyInnerText = source.slice(openBraceIndex + 1, closeBraceIndex);
    const entries = parseTableOptionEntries(
      source,
      lineStarts,
      openBraceIndex + 1,
      bodyInnerText,
    );
    const existing = declarationsByKey.get(`${name}:${declarationRange.line}`);

    if (existing) {
      existing.bodyText = bodyText;
      existing.bodyRange = bodyRange;
      existing.entries = entries;
      existing.endLine = declarationRange.endLine;
      existing.endColumn = declarationRange.endColumn;
      continue;
    }

    const tableTypeStart = match.index;
    const tableTypeEnd = tableTypeStart + tableTypeText.length;
    const nameStart = source.indexOf(name, match.index);
    const key = `${name}:${declarationRange.line}`;
    if (existingKeys.has(key)) {
      continue;
    }

    blockDeclarations.push({
      kind: "table",
      tableType: normalizeTableType(tableTypeText),
      tableTypeRange: indexToRange(
        source,
        lineStarts,
        tableTypeStart,
        tableTypeEnd,
      ),
      name,
      nameRange: indexToRange(
        source,
        lineStarts,
        nameStart,
        nameStart + name.length,
      ),
      bodyText,
      bodyRange,
      entries,
      ...declarationRange,
    });
    existingKeys.add(key);
  }

  return blockDeclarations;
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

const removeTablesCoveredByBlockTables = (
  declarations: BirdDeclaration[],
): BirdDeclaration[] => {
  const blockTables = declarations.filter(
    (item): item is TableDeclaration =>
      item.kind === "table" && item.bodyRange !== undefined,
  );

  if (blockTables.length === 0) {
    return declarations;
  }

  return declarations.filter((item) => {
    if (item.kind !== "table" || item.bodyRange !== undefined) {
      return true;
    }

    return !blockTables.some(
      (table) =>
        table !== item &&
        rangeContains(table, item) &&
        table.tableType === item.tableType,
    );
  });
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

    if (child.type === "attribute_declaration") {
      declarations.push(parseAttributeDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "table_declaration") {
      declarations.push(parseTableDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "mpls_domain_declaration") {
      declarations.push(parseMplsDomainDeclaration(child, source, issues));
      continue;
    }

    if (child.type === "timeformat_statement") {
      const timeformat = parseTimeformatFromStatement(child, source, issues);
      if (timeformat) {
        declarations.push(timeformat);
      }
      continue;
    }

    if (child.type === "watchdog_statement") {
      const watchdog = parseWatchdogFromStatement(child, source, issues);
      if (watchdog) {
        declarations.push(watchdog);
      }
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
      const routerFromTopLevel = parseRouterIdFromStatement(
        child,
        source,
        issues,
      );
      if (routerFromTopLevel) {
        declarations.push(routerFromTopLevel);
        continue;
      }

      const gracefulRestartWaitFromTopLevel =
        parseGracefulRestartWaitFromStatement(child, source, issues);
      if (gracefulRestartWaitFromTopLevel) {
        declarations.push(gracefulRestartWaitFromTopLevel);
        continue;
      }

      const hostnameOverrideFromTopLevel = parseHostnameOverrideFromStatement(
        child,
        source,
        issues,
      );
      if (hostnameOverrideFromTopLevel) {
        declarations.push(hostnameOverrideFromTopLevel);
        continue;
      }

      const tableFromTopLevel = parseTableFromStatement(child, source, issues);
      if (tableFromTopLevel) {
        declarations.push(tableFromTopLevel);
        continue;
      }

      const timeformatFromTopLevel = parseTimeformatFromStatement(
        child,
        source,
        issues,
      );
      if (timeformatFromTopLevel) {
        declarations.push(timeformatFromTopLevel);
        continue;
      }

      const watchdogFromTopLevel = parseWatchdogFromStatement(
        child,
        source,
        issues,
      );
      if (watchdogFromTopLevel) {
        declarations.push(watchdogFromTopLevel);
      }
    }
  }

  const allDeclarations = [
    ...declarations,
    ...collectFallbackMplsDomainDeclarations(source, declarations),
    ...collectFallbackAttributeDeclarations(source, declarations),
    ...collectFallbackTableDeclarations(source, declarations),
  ];

  return removeTablesCoveredByBlockTables([
    ...allDeclarations,
    ...collectTableBlockDeclarations(source, allDeclarations),
  ]).sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
};
