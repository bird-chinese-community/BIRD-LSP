# @birdcc/parser

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/your-org/bird-lsp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)

> BIRD Internet Routing Daemon 配置文件的词法分析与语法解析器

## 简介

`@birdcc/parser` 是 BIRD-LSP 工具链的底层解析模块，基于 TypeScript 实现，专为 BIRD2 路由守护进程的配置文件提供强大的词法分析和语法解析能力。

## 特性

- 🔤 **词法分析** — 将 BIRD 配置文本解析为结构化的 Token 流
- 🔗 **多词短语检测** — 智能识别 `local as`、`next hop self`、`router id` 等复合关键字
- 🌳 **语法解析** — 支持顶层声明解析（include/define/protocol/template/filter/function）
- ⚠️ **错误报告** — 检测未闭合花括号、缺失符号等常见语法错误
- 📐 **精确位置** — 每个 Token 和 AST 节点都包含准确的行号列号信息

## 安装

```bash
# 使用 pnpm
pnpm add @birdcc/parser

# 使用 npm
npm install @birdcc/parser

# 使用 yarn
yarn add @birdcc/parser
```

## 使用示例

### 基础解析

```typescript
import { parseBirdConfig } from "@birdcc/parser";

const config = `
protocol bgp edge_peer {
  local as 65001;
  neighbor 192.168.1.1 as 65002;
  next hop self;
}
`;

const result = parseBirdConfig(config);

console.log(result.tokens); // Token 流
console.log(result.phraseMatches); // 多词短语匹配
console.log(result.program); // AST 语法树
console.log(result.issues); // 语法错误列表
```

### 词法分析

```typescript
import { tokenizeBird } from "@birdcc/parser";

const tokens = tokenizeBird(`
include "base.conf";
router id 192.168.1.1;
`);

// tokens: [
//   { kind: "keyword", value: "include", line: 2, column: 1, ... },
//   { kind: "string", value: ""base.conf"", line: 2, column: 9, ... },
//   { kind: "symbol", value: ";", line: 2, column: 20, ... },
//   { kind: "keyword", value: "router", line: 3, column: 1, ... },
//   { kind: "keyword", value: "id", line: 3, column: 8, ... },
//   { kind: "number", value: "192.168.1.1", line: 3, column: 11, ... },
//   { kind: "symbol", value: ";", line: 3, column: 22, ... }
// ]
```

### 多词短语检测

```typescript
import { tokenizeBird, detectMultiWordPhrases } from "@birdcc/parser";

const tokens = tokenizeBird(`
protocol bgp edge {
  local as 65001;
  source address 192.168.1.1;
  next hop self;
}
`);

const phrases = detectMultiWordPhrases(tokens);

// phrases: [
//   { phrase: "local as", tokens: ["local", "as"], line: 3, column: 3, ... },
//   { phrase: "source address", tokens: ["source", "address"], line: 4, column: 3, ... },
//   { phrase: "next hop self", tokens: ["next", "hop", "self"], line: 5, column: 3, ... }
// ]
```

### 声明解析

```typescript
import { parseBirdConfig } from "@birdcc/parser";

const config = `
include "base.conf";

template bgp edge_tpl {
  local as 65001;
}

protocol bgp edge from edge_tpl {
  neighbor 192.168.1.1 as 65002;
}

filter export_policy {
  accept;
}

function is_valid() -> bool {
  return true;
}
`;

const { program } = parseBirdConfig(config);

// program.declarations:
// [
//   { kind: "include", path: "base.conf", ... },
//   { kind: "template", templateType: "bgp", name: "edge_tpl", ... },
//   { kind: "protocol", protocolType: "bgp", name: "edge", fromTemplate: "edge_tpl", ... },
//   { kind: "filter", name: "export_policy", ... },
//   { kind: "function", name: "is_valid", ... }
// ]
```

## API 文档

### 核心函数

| 函数                     | 签名                                              | 描述                                             |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| `parseBirdConfig`        | `(input: string) => ParsedBirdDocument`           | 完整的配置解析入口，返回 Token、短语、AST 和错误 |
| `tokenizeBird`           | `(input: string) => LexToken[]`                   | 词法分析，将文本转为 Token 流                    |
| `detectMultiWordPhrases` | `(tokens: LexToken[], phrases?) => PhraseMatch[]` | 检测多词短语匹配                                 |

### Token 类型

| 类型         | 描述   | 示例                             |
| ------------ | ------ | -------------------------------- |
| `keyword`    | 关键字 | `protocol`, `bgp`, `local`, `as` |
| `identifier` | 标识符 | 自定义名称、变量名               |
| `number`     | 数字   | `65001`, `192.168.1.1`           |
| `string`     | 字符串 | `"base.conf"`                    |
| `symbol`     | 符号   | `{`, `}`, `;`, `->`              |
| `comment`    | 注释   | `# 这是一行注释`                 |

### 接口定义

```typescript
interface LexToken {
  kind: TokenKind; // token 类型
  value: string; // 原始文本
  index: number; // token 索引
  line: number; // 起始行号 (1-based)
  column: number; // 起始列号 (1-based)
  endLine: number; // 结束行号
  endColumn: number; // 结束列号
}

interface PhraseMatch {
  phrase: string; // 匹配的短语，如 "local as"
  tokens: string[]; // 组成短语的 token 值
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface ParsedBirdDocument {
  tokens: LexToken[]; // 所有 token
  phraseMatches: PhraseMatch[]; // 短语匹配结果
  program: BirdProgram; // AST 语法树
  issues: ParseIssue[]; // 解析错误和警告
}
```

### 内置多词短语

```typescript
const DEFAULT_MULTI_WORD_PHRASES = [
  ["local", "as"],
  ["next", "hop", "self"],
  ["router", "id"],
  ["source", "address"],
  ["import", "all"],
  ["import", "filter"],
  ["export", "all"],
  ["export", "filter"],
];
```

## 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm vitest run test/parser.test.ts

# 监视模式
pnpm vitest
```

### 测试覆盖

- **parser.test.ts** — 单元测试：多词短语检测、DSL 声明解析、错误报告
- **fixtures.test.ts** — 集成测试：使用真实 BIRD 配置文件样本

### Fixture 样本

测试使用以下配置文件样本：

| 文件                    | 描述           |
| ----------------------- | -------------- |
| `basic.conf`            | 基础配置示例   |
| `bgp_advanced.conf`     | 高级 BGP 配置  |
| `bogon.conf`            | Bogon 过滤规则 |
| `protocol_phrases.conf` | 协议短语测试   |

## 错误处理

解析器会检测并报告以下错误：

| 错误代码                  | 描述                             |
| ------------------------- | -------------------------------- |
| `parser/unbalanced-brace` | 花括号不匹配或未闭合             |
| `parser/missing-symbol`   | 声明缺少必要符号（如名称、路径） |

```typescript
const result = parseBirdConfig(`
protocol bgp {  // 缺少名称
  local as 65001;
`); // 未闭合的花括号

console.log(result.issues);
// [
//   { code: "parser/missing-symbol", message: "Missing name for protocol declaration", ... },
//   { code: "parser/unbalanced-brace", message: "Unclosed block at end of file", ... }
// ]
```

## 技术栈

- [TypeScript](https://www.typescriptlang.org/) — 类型安全的 JavaScript 超集
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) — 增量解析框架（规划中）
- [Vitest](https://vitest.dev/) — 极速单元测试框架

## 架构位置

```
Editors (VSCode/Neovim)
         |
         v
    @birdcc/lsp
         |
         v
  @birdcc/linter
         |
         v
   @birdcc/core
         |
         v
  @birdcc/parser  ← 你在这里
         |
         v
    BIRD Config
```

`@birdcc/parser` 作为 BIRD-LSP 工具链的底层基础，为上层模块提供可靠的解析服务。

## 许可证

MIT © BIRD-LSP Contributors
