import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  AttributeDeclaration,
  BirdDeclaration,
  ParseIssue,
  SourceRange,
  TableDeclaration,
} from "../types.js";
import {
  parseAttributeDeclaration,
  parseDefineDeclaration,
  parseIncludeDeclaration,
  parseRouterIdDeclaration,
  parseTableDeclaration,
  parseTemplateDeclaration,
} from "./basic.js";
import { parseFilterDeclaration, parseFunctionDeclaration } from "./filter.js";
import { parseProtocolDeclaration } from "./protocol.js";
import {
  parseRouterIdFromStatement,
  parseTableFromStatement,
} from "./top-level.js";

const IPV6_SADR_TABLE_LINE =
  /^(\s*)ipv6\s+sadr\s+table\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s+.*)?;\s*$/i;
const ATTRIBUTE_DECLARATION_LINE =
  /^(\s*)attribute\s+([A-Za-z_][A-Za-z0-9_-]*(?:\s+set)?)\s+([A-Za-z_][A-Za-z0-9_-]*)\s*;\s*$/i;

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
      ...declarationRange,
    });
    existingTables.add(key);
  }

  return fallbackDeclarations;
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

      const tableFromTopLevel = parseTableFromStatement(child, source, issues);
      if (tableFromTopLevel) {
        declarations.push(tableFromTopLevel);
      }
    }
  }

  return [
    ...declarations,
    ...collectFallbackAttributeDeclarations(source, declarations),
    ...collectFallbackTableDeclarations(source, declarations),
  ].sort((left, right) => left.line - right.line || left.column - right.column);
};
