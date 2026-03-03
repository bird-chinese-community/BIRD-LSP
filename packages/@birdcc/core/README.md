# @birdcc/core & @birdcc/linter

<div align="center">

<p>
  <strong>🦅 BIRD2 配置语义分析引擎与可插拔规则系统</strong>
</p>

<p>
  <a href="#核心功能">核心功能</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#自定义规则">自定义规则</a> •
  <a href="#api-参考">API 参考</a>
</p>

<p>
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/TypeScript-5.9+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="typescript">
</p>

</div>

---

## 📦 包介绍

本目录包含 BIRD-LSP 工具链的两个核心包：

| 包名               | 职责                           | 依赖                             |
| ------------------ | ------------------------------ | -------------------------------- |
| **@birdcc/core**   | 符号表构建、语义检查、诊断信息 | `@birdcc/parser`                 |
| **@birdcc/linter** | 可插拔规则引擎、协议规则检查   | `@birdcc/core`, `@birdcc/parser` |

```
┌─────────────────┐
│  @birdcc/linter │  ← 规则引擎 (protocol/*, security/*)
│   (本包依赖)     │
└────────┬────────┘
         │
┌────────▼────────┐
│  @birdcc/core   │  ← 语义分析 (semantic/*)
│   (当前包)      │
└────────┬────────┘
         │
┌────────▼────────┐
│ @birdcc/parser  │  ← 语法解析 (syntax/*)
└─────────────────┘
```

---

## ✨ 核心功能

### @birdcc/core - 语义分析层

- **🔍 符号表构建**: 自动收集 `protocol` / `template` / `filter` / `function` 定义
- **⚠️ 语义检查**: 检测重复定义、未定义的模板引用
- **📋 统一诊断**: 标准化的诊断格式，支持 `error` / `warning` / `info` 三级

### @birdcc/linter - 规则引擎层

- **🧩 可插拔规则**: 基于 `BirdRule` 类型的灵活规则系统
- **🌐 协议规则**: BGP 配置完整性检查（`local as`、`neighbor` 等）
- **🔌 无缝集成**: 自动整合 core 层的语义检查结果

---

## 🚀 快速开始

### 安装

```bash
# 使用 pnpm (推荐)
pnpm add @birdcc/core @birdcc/linter

# 或使用 npm
npm install @birdcc/core @birdcc/linter
```

### 基础用法

#### 1. 仅使用 Core 进行语义分析

```typescript
import { buildCoreSnapshot } from "@birdcc/core";

const config = `
protocol bgp upstream {
    local as 65001;
    neighbor 192.168.1.1 as 65002;
}

protocol bgp upstream {  // ← 重复定义！
    local as 65001;
}
`;

const snapshot = buildCoreSnapshot(config);

console.log(snapshot.symbols);
// [
//   { kind: "protocol", name: "upstream", line: 2, column: 12 },
//   { kind: "protocol", name: "upstream", line: 7, column: 12 }
// ]

console.log(snapshot.diagnostics);
// [
//   {
//     code: "semantic/duplicate-definition",
//     message: "protocol 'upstream' 重复定义",
//     severity: "error",
//     ...
//   }
// ]
```

#### 2. 使用 Linter 进行完整检查

```typescript
import { lintBirdConfig } from "@birdcc/linter";

const config = `
protocol bgp upstream {
    # 缺少 local as
    neighbor 192.168.1.1 as 65002;
}
`;

const result = lintBirdConfig(config);

console.log(result.diagnostics);
// [
//   {
//     code: "protocol/bgp-missing-local-as",
//     message: "BGP 协议 'upstream' 缺少 local as 配置",
//     severity: "warning",
//     ...
//   }
// ]
```

---

## 🛠️ 自定义规则

### 规则类型定义

```typescript
type BirdRule = (context: RuleContext) => BirdDiagnostic[];

interface RuleContext {
  text: string; // 原始配置文本
  parsed: ParsedBirdDocument; // 解析后的 AST
  core: CoreSnapshot; // 符号表与语义信息
}
```

### 编写自定义规则示例

```typescript
import type { BirdRule, BirdDiagnostic } from "@birdcc/linter";

// 检查 protocol 名称是否符合命名规范
const namingConventionRule: BirdRule = ({ parsed, core }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const symbol of core.symbols) {
    if (symbol.kind === "protocol") {
      // 要求 protocol 名称使用小写字母和连字符
      if (!/^[a-z][a-z0-9-]*$/.test(symbol.name)) {
        diagnostics.push({
          code: "structure/invalid-protocol-name",
          message: `Protocol 名称 '${symbol.name}' 应仅包含小写字母、数字和连字符`,
          severity: "warning",
          source: "linter",
          range: {
            line: symbol.line,
            column: symbol.column,
            endLine: symbol.line,
            endColumn: symbol.column + symbol.name.length,
          },
        });
      }
    }
  }

  return diagnostics;
};

// 使用自定义规则
const customLint = (text: string) => {
  const parsed = parseBirdConfig(text);
  const core = buildCoreSnapshotFromParsed(parsed);
  const context = { text, parsed, core };

  // 合并默认规则与自定义规则
  const allRules = [...defaultRules, namingConventionRule];
  const diagnostics = allRules.flatMap((rule) => rule(context));

  return { parsed, core, diagnostics };
};
```

---

## ⚙️ 配置示例

### birdcc.config.json

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/birdcc-tooling.schema.json",
  "linter": {
    "rules": {
      "semantic/*": "error",
      "protocol/*": "warning",
      "security/*": "error",
      "structure/*": "warning",
      "performance/*": "info"
    }
  }
}
```

### 规则分级参考

| 分类            | 规则代码示例                    | 默认级别   | CI 策略 | 说明         |
| --------------- | ------------------------------- | ---------- | ------- | ------------ |
| `syntax/*`      | `syntax/parse-error`            | 🔴 error   | 阻塞    | 语法解析错误 |
| `semantic/*`    | `semantic/duplicate-definition` | 🔴 error   | 阻塞    | 语义错误     |
| `security/*`    | `security/insecure-auth`        | 🔴 error   | 阻塞    | 安全问题     |
| `structure/*`   | `structure/invalid-name`        | 🟡 warning | 非阻塞  | 结构建议     |
| `protocol/*`    | `protocol/bgp-missing-local-as` | 🟡 warning | 非阻塞  | 协议配置     |
| `performance/*` | `performance/redundant-filter`  | 🔵 info    | 非阻塞  | 性能优化     |

---

## 📚 API 参考

### @birdcc/core

#### `buildCoreSnapshot(text: string): CoreSnapshot`

从原始文本构建语义分析快照。

```typescript
import { buildCoreSnapshot } from "@birdcc/core";

const snapshot = buildCoreSnapshot(birdConfigText);
// snapshot.symbols      → 符号定义列表
// snapshot.references   → 模板引用列表
// snapshot.diagnostics  → 诊断信息列表
```

#### `buildCoreSnapshotFromParsed(parsed: ParsedBirdDocument): CoreSnapshot`

从已解析的 AST 构建语义分析快照（适用于已有 parse 结果的场景）。

```typescript
import { parseBirdConfig } from "@birdcc/parser";
import { buildCoreSnapshotFromParsed } from "@birdcc/core";

const parsed = parseBirdConfig(text);
const snapshot = buildCoreSnapshotFromParsed(parsed);
```

### CoreSnapshot 结构

```typescript
interface CoreSnapshot {
  /** 所有符号定义 */
  symbols: SymbolDefinition[];
  /** 模板引用信息 */
  references: SymbolReference[];
  /** 语义检查诊断 */
  diagnostics: BirdDiagnostic[];
}

interface SymbolDefinition {
  kind: "protocol" | "template" | "filter" | "function";
  name: string;
  line: number;
  column: number;
}
```

### @birdcc/linter

#### `lintBirdConfig(text: string): LintResult`

执行完整的 lint 检查（包含 core 层语义分析 + linter 层规则检查）。

```typescript
import { lintBirdConfig } from "@birdcc/linter";

const result = lintBirdConfig(birdConfigText);
// result.parsed      → 解析后的 AST
// result.core        → 语义分析快照
// result.diagnostics → 所有诊断信息（已排序）
```

### 内置诊断代码

#### Core 层 (semantic/\*)

| 代码                            | 说明                                          | 级别  |
| ------------------------------- | --------------------------------------------- | ----- |
| `semantic/duplicate-definition` | 重复定义（protocol/template/filter/function） | error |
| `semantic/undefined-reference`  | 引用了未定义的模板                            | error |

#### Linter 层 (protocol/\*)

| 代码                            | 说明                         | 级别    |
| ------------------------------- | ---------------------------- | ------- |
| `protocol/bgp-missing-local-as` | BGP 协议缺少 `local as` 配置 | warning |
| `protocol/bgp-missing-neighbor` | BGP 协议缺少 `neighbor` 配置 | warning |

---

## 🏗️ 架构关系

```
┌─────────────────────────────────────────────────────────┐
│                     你的应用程序                          │
│              (CLI / LSP Server / Web UI)                 │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 @birdcc/linter                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  规则引擎 (BirdRule[])                          │   │
│  │  • protocol/bgp-missing-local-as               │   │
│  │  • protocol/bgp-missing-neighbor               │   │
│  │  • (可扩展自定义规则)                           │   │
│  └─────────────────────────────────────────────────┘   │
│                    lintBirdConfig()                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  @birdcc/core                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  语义分析引擎                                    │   │
│  │  • 符号表构建 (Symbol Table)                    │   │
│  │  • 重复定义检测                                  │   │
│  │  • 未定义引用检测                                │   │
│  └─────────────────────────────────────────────────┘   │
│          buildCoreSnapshot() / buildCoreSnapshotFromParsed()│
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 @birdcc/parser                          │
│              parseBirdConfig()                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🤝 贡献

欢迎提交 Issue 和 PR！请确保：

1. 代码通过 `pnpm lint` 和 `pnpm test`
2. 新功能附带测试用例
3. 更新相关文档

---

## 📄 许可证

MIT License © 2026 BIRD-LSP Contributors
