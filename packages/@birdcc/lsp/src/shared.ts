import {
  CompletionItemKind,
  SymbolKind,
  type Range,
  type Position,
} from "vscode-languageserver/node.js";
import type { BirdDeclaration, SourceRange } from "@birdcc/parser";

export const KEYWORD_DOCS: Record<string, string> = {
  protocol: "Define a protocol instance. Example: `protocol bgp edge { ... }`.",
  template: "Define a reusable protocol template.",
  filter: "Define route filtering logic.",
  function: "Define reusable logic callable from filters.",
  define: "Define a reusable constant. Example: `define ASN = 65001;`.",
  include: "Include another configuration file.",
  table: "Define a routing table resource for protocol/channel usage.",
  import: "Control import policy for routes.",
  export: "Control export policy for routes.",
  neighbor: "Configure protocol neighbor endpoint and ASN.",
  "local as": "Configure local ASN via `local as <asn>;`.",
  "router id": "Set explicit router ID or select from runtime source.",
  ipv4: "IPv4 address family/channel/table scope keyword.",
  ipv6: "IPv6 address family/channel/table scope keyword.",
};

export interface LspDeclarationMetadata {
  symbolName: string;
  selectionRange: SourceRange;
  symbolKind: SymbolKind;
  detail: string;
  hoverMarkdown: string;
  completionLabel?: string;
  completionKind?: CompletionItemKind;
  completionDetail?: string;
}

export const toLspRange = (range: SourceRange): Range => ({
  start: {
    line: Math.max(range.line - 1, 0),
    character: Math.max(range.column - 1, 0),
  },
  end: {
    line: Math.max(range.endLine - 1, 0),
    character: Math.max(range.endColumn - 1, 0),
  },
});

export const isPositionInRange = (position: Position, range: SourceRange): boolean => {
  const line = position.line + 1;
  const character = position.character + 1;

  if (line < range.line || line > range.endLine) {
    return false;
  }

  if (line === range.line && character < range.column) {
    return false;
  }

  if (line === range.endLine && character > range.endColumn) {
    return false;
  }

  return true;
};

export const declarationMetadata = (
  declaration: BirdDeclaration,
): LspDeclarationMetadata | null => {
  const escapeMarkdownCode = (text: string): string =>
    text.replaceAll("\\", "\\\\").replaceAll("`", "\\`");

  switch (declaration.kind) {
    case "protocol": {
      const fromTemplate = declaration.fromTemplate
        ? ` from \`${escapeMarkdownCode(declaration.fromTemplate)}\``
        : "";
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Module,
        detail: `protocol ${declaration.protocolType}`,
        hoverMarkdown: `**protocol** \`${escapeMarkdownCode(declaration.name)}\`\n\nType: \`${escapeMarkdownCode(declaration.protocolType)}\`${fromTemplate}`,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: `protocol ${declaration.protocolType}`,
      };
    }
    case "template":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Class,
        detail: `template ${declaration.templateType}`,
        hoverMarkdown: `**template** \`${escapeMarkdownCode(declaration.name)}\`\n\nType: \`${escapeMarkdownCode(declaration.templateType)}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: `template ${declaration.templateType}`,
      };
    case "filter":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Method,
        detail: "filter",
        hoverMarkdown: `**filter** \`${escapeMarkdownCode(declaration.name)}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: "filter",
      };
    case "function":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Function,
        detail: "function",
        hoverMarkdown: `**function** \`${escapeMarkdownCode(declaration.name)}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Reference,
        completionDetail: "function",
      };
    case "define":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Constant,
        detail: "define",
        hoverMarkdown: `**define** \`${escapeMarkdownCode(declaration.name)}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Constant,
        completionDetail: "define",
      };
    case "table":
      return {
        symbolName: declaration.name,
        selectionRange: declaration.nameRange,
        symbolKind: SymbolKind.Object,
        detail: `table ${declaration.tableType}`,
        hoverMarkdown: `**table** \`${escapeMarkdownCode(declaration.name)}\`\n\nType: \`${escapeMarkdownCode(declaration.tableType)}\``,
        completionLabel: declaration.name,
        completionKind: CompletionItemKind.Variable,
        completionDetail: `table ${declaration.tableType}`,
      };
    case "include":
      return {
        symbolName: declaration.path,
        selectionRange: declaration.pathRange,
        symbolKind: SymbolKind.File,
        detail: "include",
        hoverMarkdown: `**include** \`${escapeMarkdownCode(declaration.path)}\``,
      };
    case "router-id": {
      const fromSource = declaration.fromSource ? ` (${declaration.fromSource})` : "";
      return {
        symbolName: `router id ${declaration.value}`,
        selectionRange: declaration.valueRange,
        symbolKind: SymbolKind.Property,
        detail: `router-id ${declaration.valueKind}`,
        hoverMarkdown: `**router id** \`${escapeMarkdownCode(declaration.value)}\`${fromSource}`,
      };
    }
    default:
      return null;
  }
};
