# @birdcc/linter

> **注意**：此包的详细文档已包含在 [@birdcc/core README](../core/README.md) 中。

## 快速链接

📖 **[查看完整文档 →](../core/README.md)**

## 简介

`@birdcc/linter` 是 BIRD-LSP 工具链的规则引擎层，提供可插拔的 Lint 规则系统，用于检查 BIRD2 配置文件的协议合规性、安全性和性能问题。

## 核心功能

- 🧩 **可插拔规则** — 基于 `BirdRule` 类型的灵活规则系统
- 🌐 **协议规则** — BGP 配置完整性检查
- 🔒 **安全规则** — 配置安全最佳实践
- ⚡ **性能规则** — 性能优化建议

## 安装

```bash
pnpm add @birdcc/linter
```

## 基本用法

```typescript
import { lintBirdConfig } from "@birdcc/linter";

const result = lintBirdConfig(`
protocol bgp example {
  neighbor 192.168.1.1 as 65001;
}
`);

console.log(result.diagnostics);
// [{ code: "protocol/bgp-missing-local-as", message: "BGP 协议缺少 local as 配置", severity: "warning" }]
```

## 规则分级

| 分类     | 默认级别 | CI 策略 |
| -------- | -------- | ------- |
| `sym/*`  | error    | 阻塞    |
| `cfg/*`  | error    | 阻塞    |
| `net/*`  | error    | 阻塞    |
| `type/*` | error    | 阻塞    |
| `bgp/*`  | warning  | 非阻塞  |
| `ospf/*` | warning  | 非阻塞  |

---

**📖 查看完整文档：[../core/README.md](../core/README.md)**
