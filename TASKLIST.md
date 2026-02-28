# BIRD2 LSP + Formatter（dprint 优先）实施报告（防翻车版）

## 执行摘要

本报告给出 BIRD2 配置语言工具链的落地方案，目标是“平滑推进、可持续演进、避免一次性翻车”：

- Parser 层：`Tree-sitter` + 参考 BIRD 官方语法设计
- 语义层：自定义 `Symbol Table + Type Checker`（TypeScript）
- Linter 层：`@birdcc/linter`（Rules/Diagnostics）
- LSP 层：`vscode-languageserver-node`
- Formatter：`dprint` 插件
- BIRD 集成：MVP 采用 `bird -p` 子进程，后续渐进到 `birdc`

核心判断：BIRD2 的 Filter 层不是普通配置 DSL，而是接近完整编程语言。必须将“语法解析”和“语义验证”分层，先稳住语法与诊断，再逐步提高语义覆盖。

### 审查修订说明

1. 工期口径改为双轨：`16-20 周 MVP` / `24-30 周完整版`。
2. Formatter 主线保持 `dprint`，`Prettier` 仅保留兼容通道。
3. Parser 方案明确为 `Tree-sitter` 主导，不直接复用 BIRD 官方 parser。
4. 新增守护进程集成路线、错误恢复处理器与类型系统分期方案。
5. 包职责拆分为 `@birdcc/core`（语言核心）与 `@birdcc/linter`（业务规则）。
6. npm scope 与 CLI 名统一为 `birdcc`。

---

## 1. 报告目标与范围

### 1.1 目标

1. 给出能直接执行的 LSP + Formatter + Linter + BIRD 验证总体架构。
2. 明确 MVP 与完整版工期、阶段交付物与验收标准。
3. 形成低风险演进路径（单文件优先，跨文件能力后置）。
4. 与现有语法资产及协议分析报告建立可追踪闭环。

### 1.2 非目标

1. 本报告不直接修改 `grammars/` 或 `external/` 语法文件。
2. 本报告不覆盖 JetBrains 插件实现细节。
3. 本报告不承诺首期完成所有 Filter 高级语义能力。

---

## 2. 当前基础能力盘点

### 2.1 可复用资产

| 资产          | 路径                                  | 可复用方向          |
| ------------- | ------------------------------------- | ------------------- |
| TextMate 语法 | `grammars/bird2.tmLanguage.json`      | 关键字与短语词表    |
| Vim 语法      | `external/bird2.vim/syntax/bird2.vim` | 历史兼容短语        |
| 样例配置      | `sample/*.conf`                       | fixtures 与回归样本 |
| 协议分析      | `docs/protocol_analysis_report.md`    | 规则来源与协议缺口  |
| 文档快照      | `BIRD.docs.md`                        | hover 与诊断文案    |

### 2.2 当前缺口

| 能力                | 现状 | 影响                     |
| ------------------- | ---- | ------------------------ |
| Parser/CST/AST      | 缺失 | 无法做稳定格式化与诊断   |
| Symbol/Type Checker | 缺失 | 无法做定义跳转与类型规则 |
| LSP Server          | 缺失 | 无补全、无语义诊断       |
| Formatter           | 缺失 | 无统一格式化标准         |
| BIRD 原生验证集成   | 缺失 | 无法与生产语义校验对齐   |

---

## 3. 技术选型结论

### 3.1 Parser 技术对比结论

| 方案              | 综合结论                     | 工期预估               | 风险 | 推荐度    |
| ----------------- | ---------------------------- | ---------------------- | ---- | --------- |
| Tree-sitter       | 增量解析、错误恢复、生态成熟 | 9-13 周（Parser层）    | 低   | ✅ 首选   |
| BIRD 官方源码复用 | 适合参考设计，不适合直接嵌入 | 3-4 周（独立进程集成） | 中高 | ⚠️ 参考   |
| 手写递归下降      | 可控但开发/维护成本过高      | 17-25 周               | 高   | ❌ 不推荐 |
| ANTLR4            | 工程化可行，生态次优         | 9-12 周                | 中   | ⚠️ 备选   |

### 3.2 LSP 与 Formatter 选型

| 领域      | 方案                         | 结论            | 说明                         |
| --------- | ---------------------------- | --------------- | ---------------------------- |
| LSP       | `vscode-languageserver-node` | ✅ 首选         | 与当前生态最贴合             |
| LSP       | `pygls`                      | ⚠️ 可行但非主线 | 可作为实验分支，不作为主交付 |
| Formatter | `dprint-plugin-birdcc`       | ✅ 首选         | 性能高，WASM 易分发          |
| Formatter | `Topiary`                    | ⚠️ 备选         | 适合快速 PoC                 |
| Formatter | `Prettier`                   | ⚠️ 兼容层       | 仅前端生态强依赖时启用       |

### 3.3 BIRD 官方 parser 复用策略

结论：**参考逻辑，不直接复用实现**。

1. 参考项：符号表组织、作用域规则、类型语义。
2. 不做项：直接将 Flex/Bison/M4 parser 编译进 Node/WASM。
3. 首期集成：通过 `bird -p` 作为外部校验金标准。

---

## 4. 混合分层架构

### 4.1 架构图

```text
        Editors (VSCode/Neovim)
                 |
                 v
            @birdcc/lsp
     (diagnostics/hover/completion)
         |                      \
         v                       v
      @birdcc/linter        @birdcc/formatter
   (Rules/Diagnostics)      (dprint plugin)
         ^                       ^
         |                       |
      @birdcc/core  <-----------+
  (AST/Symbol/TypeChecker)
         ^
         |
      @birdcc/parser
 (tree-sitter + wasm adapter)
         |
         v
  bird -p / birdc adapter (渐进集成)
```

### 4.2 精简包结构（避免过度工程）

```text
packages/
  @birdcc/parser/      # Tree-sitter + WASM + JS adapter
  @birdcc/core/        # AST / Symbol / Type Checker（纯语言核心）
  @birdcc/linter/      # Rules / Diagnostics（业务规则层）
  @birdcc/lsp/         # LSP server
  @birdcc/formatter/   # dprint plugin
  @birdcc/cli/         # birdcc lint/fmt/lsp 聚合命令
shared/
  config/
tests/
  fixtures/
  snapshots/
```

---

## 5. Parser 与语义层设计

### 5.1 双层语言模型

1. 配置声明层（Config DSL）：`protocol/template/filter/function` 结构。
2. Filter 表达式层（高复杂度）：15+ 类型、控制流、运算符重载、方法调用。

原则：`Tree-sitter` 负责结构稳定解析；类型与符号语义交给 `@birdcc/core`；协议与安全等规则交给 `@birdcc/linter`。

### 5.2 多词短语处理策略（三阶段）

1. 语法层：Tree-sitter 识别结构，不在 grammar 中过度绑定语义。
2. 语义层：构建 `protocol_name -> protocol_type` 上下文。
3. 协议验证器：由 `@birdcc/linter` 按 BGP/OSPF/Babel/BFD 分模块验证短语合法性。

实施细则：

1. 高频且语义稳定短语可使用复合 token。
2. 变体较多短语保持分离，在语义层做组合校验。

### 5.3 错误恢复与诊断处理

`Tree-sitter` 产出 `ERROR`/`MISSING` 节点后，交由 BIRD2 专用错误处理层：

1. 语法节点转 LSP Diagnostics（含范围修正）。
2. 关键字拼写建议（模糊匹配）。
3. 智能同步点恢复（`;`、`}`、block 边界）。
4. 未闭合括号/字符串专项诊断。

### 5.4 include 与模板继承路线

1. Phase 1（MVP）：单文件完整能力；`include/template` 仅语法识别，不展开。
2. Phase 2：支持 include 展开（不含通配符）和跨文件引用。
3. Phase 3：支持模板继承链与覆盖语义验证。

---

## 6. Type Checker 分期

| 阶段 | 内容                                | 工时   |
| ---- | ----------------------------------- | ------ |
| P1   | 基础架构、变量声明与引用检查        | 1-2 周 |
| P2   | 表达式类型推导                      | 2-3 周 |
| P3   | `~` 运算符重载 + `bgppath` 方法语义 | 2-3 周 |
| P4   | Set 语义与高级特性                  | 2-3 周 |

---

## 7. LSP 功能路线

### 7.1 里程碑功能矩阵

| 功能                                | M2      | M3      | M4          |
| ----------------------------------- | ------- | ------- | ----------- |
| `textDocument/publishDiagnostics`   | ✅      | ✅      | ✅          |
| `textDocument/completion`（关键字） | ✅      | ✅      | ✅          |
| `textDocument/hover`                | ✅      | ✅      | ✅          |
| `textDocument/documentSymbol`       | ❌      | ✅      | ✅          |
| `textDocument/definition`           | ❌      | ✅      | ✅          |
| `textDocument/formatting`           | ✅ 基础 | ✅ 稳定 | ✅ 语义保护 |
| `textDocument/codeAction`           | ❌      | ⚠️ 部分 | ✅          |

### 7.2 诊断来源

| 诊断类型           | 来源                          |
| ------------------ | ----------------------------- |
| 词法/语法错误      | `@birdcc/parser` + 错误处理器 |
| 类型与符号诊断     | `@birdcc/core`                |
| 协议/安全/性能规则 | `@birdcc/linter`              |
| 原生 BIRD 校验错误 | `bird -p` 适配器              |

---

## 8. 与 BIRD 守护进程集成

### 8.1 渐进式集成（含里程碑映射）

| 集成阶段   | 方式                 | 里程碑映射 | 工作量 | 能力                       |
| ---------- | -------------------- | ---------- | ------ | -------------------------- |
| MVP-PoC    | `bird -p` 子进程调用 | M2         | ~2 周  | 原生语法校验接入与诊断转译 |
| MVP-Stable | `bird -p` 阻塞校验   | M3         | ~2 周  | CI/LSP 稳定校验通路        |
| Enhanced   | `birdc` 只读集成     | M4         | ~6 周  | 运行时信息与上下文增强     |
| Long-term  | Socket 直连（评估）  | Post-M4    | ~14 周 | 高性能交互与重载能力       |

### 8.2 MVP 推荐实现要点

1. 默认只读校验，不触发配置写入或重载。
2. 解析 `stderr`，统一转换为 LSP/CLI 诊断格式。
3. 为缺少 `bird` 二进制的环境提供降级提示与跳过策略。
4. M2 仅做 `bird -p` 非阻塞验证，M3 才进入默认阻塞链路。

---

## 9. dprint Formatter 设计

### 9.1 设计原则

1. 默认优先 `--check`，先观测再改写。
2. 对高风险 Filter 表达式默认跳过重排。
3. 结构格式化与语义保护分层实现，避免大规模误改。

### 9.2 兼容策略

1. `Prettier` 仅保留兼容入口，不作为默认引擎。
2. 兼容入口复用同一 parser，避免格式化语义分叉。

---

## 10. Linter 规则体系

### 10.1 规则分级

| 分类            | 默认级别 | CI 策略 |
| --------------- | -------- | ------- |
| `syntax/*`      | error    | 阻塞    |
| `structure/*`   | warning  | 非阻塞  |
| `semantic/*`    | error    | 阻塞    |
| `protocol/*`    | warning  | 非阻塞  |
| `security/*`    | error    | 阻塞    |
| `performance/*` | info     | 非阻塞  |
| `style/*`       | info     | 非阻塞  |

### 10.2 首批 12 条规则

1. `syntax/missing-semicolon`
2. `syntax/unbalanced-brace`
3. `structure/invalid-statement-in-protocol`
4. `semantic/duplicate-definition`
5. `semantic/undefined-reference`
6. `semantic/circular-template`
7. `protocol/bgp-next-hop-form`
8. `protocol/ospf-area-required`
9. `protocol/bgp-missing-local-as`
10. `protocol/bgp-missing-neighbor`
11. `security/missing-authentication`
12. `performance/large-filter-expression`

---

## 11. CLI 与配置契约

### 11.1 CLI 形态

主入口采用聚合命令，降低包拆分与发布复杂度：

```bash
birdcc lint sample/basic.conf --format json --max-warnings 0
birdcc fmt sample/basic.conf --check
birdcc fmt sample/basic.conf --write
birdcc lsp --stdio
```

迁移期可选提供 `bird2` 别名，但文档与发布主命令统一为 `birdcc`。

### 11.2 配置示例

```json
{
  "$schema": "https://birdcc.link/schemas/birdcc-tooling.schema.json",
  "formatter": {
    "engine": "dprint",
    "safeMode": true
  },
  "linter": {
    "rules": {
      "security/*": "error",
      "performance/*": "info",
      "style/*": "off"
    }
  },
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

---

## 12. 测试与质量保障

### 12.1 测试层次

| 层次          | 内容                           |
| ------------- | ------------------------------ |
| 单元测试      | parser/core/linter/formatter   |
| fixtures 测试 | `sample/*.conf` + 协议缺口样本 |
| 快照测试      | 格式化输出稳定性               |
| 端到端测试    | LSP + CLI + `bird -p` 适配器   |

### 12.2 CI 建议

1. `tooling-lint`：`birdcc lint`。
2. `tooling-format-check`：`birdcc fmt --check`。
3. `tooling-test`：单测 + 快照 + 集成。
4. 初期仅阻塞 `syntax/*`、`semantic/*`、`security/*`。

---

## 13. 里程碑与工期基线

### 13.1 MVP 路径（16-20 周）

| 阶段 | 周期   | 关键目标                                                         |
| ---- | ------ | ---------------------------------------------------------------- |
| M1   | 4-5 周 | Tree-sitter grammar（配置 DSL 主干）+ fixtures                   |
| M2   | 6-7 周 | LSP 基础能力 + 错误恢复处理器 + `bird -p` PoC（非阻塞）          |
| M3   | 6-8 周 | Symbol/Type Checker 基础 + include 简化支持 + `bird -p` 阻塞校验 |

### 13.2 完整版路径（24-30 周）

在 MVP 基础上增加 M4：

| 阶段 | 周期    | 关键目标                                                   |
| ---- | ------- | ---------------------------------------------------------- |
| M4   | 8-10 周 | 协议规则完善 + dprint 稳定化 + `birdc` 只读集成 + 发布体系 |

### 13.3 与第 8 章集成映射对齐

1. M2：`bird -p` 接入为 PoC，默认非阻塞。
2. M3：`bird -p` 进入稳定阻塞链路（CLI/LSP/CI）。
3. M4：新增 `birdc` 只读集成。
4. Post-M4：再评估 Socket 直连。

---

## 14. 风险与缓解

| 风险                    | 概率 | 影响 | 平滑策略                              |
| ----------------------- | ---- | ---- | ------------------------------------- |
| Filter 语义复杂度被低估 | 高   | 高   | 配置 DSL 优先，Filter 语义分期上线    |
| 多词短语冲突            | 中   | 中   | 语法识别与语义验证分离，强化 fixtures |
| 上下文敏感规则误报      | 中   | 高   | 复杂判断后移到 `@birdcc/linter`       |
| BIRD 版本更新           | 高   | 中   | 版本探测 + 适配层                     |
| 格式化误改生产配置      | 中   | 高   | `--check` 默认 + safe mode + 备份     |
| 大文件性能退化          | 中   | 中   | 基准测试 + 增量解析 + 性能阈值报警    |

---

## 15. 发布与文档同步策略

### 15.1 npm 发布

1. 包策略：精简 6 包并行发布（`parser/core/linter/lsp/formatter/cli`）。
2. 版本策略：主版本同步，允许 `@birdcc/parser` 小版本先行。
3. 标签策略：`alpha`、`beta`、`latest`。
4. 版本号示例：`v0.1.0-alpha.1` -> `v0.1.0-beta.1` -> `v0.1.0`。

### 15.2 文档同步

每个里程碑发布需同步更新：

1. 本报告（架构、工期、风险）。
2. `README.zh-CN.md`（用户命令、安装与用法）。
3. `docs/protocol_analysis_report.md`（规则依据与覆盖范围）。

---

## 16. 立即行动建议

本周：

1. 启动 `tree-sitter-birdcc` 原型并验证多词短语策略。
2. 定义 `@birdcc/core` 与 `@birdcc/linter` 的接口边界。
3. 完成 `bird -p` 诊断解析器最小实现。

本月：

1. 完成配置 DSL 主干 grammar 与 fixtures 覆盖。
2. 打通 `birdcc lint/fmt/lsp` 聚合 CLI 骨架。
3. 发布 `@birdcc/parser` alpha 版用于生态验证。

---

## 17. 最终建议

避免翻车的关键不是“单点最优技术”，而是“可控分层与可回退交付”：

1. Parser 用 `Tree-sitter`，语义用自定义 `Type Checker/Symbol Table`，严格分层。
2. MVP 以单文件与 `bird -p` 校验为边界，先交付稳定体验。
3. 以 `16-20 周 MVP / 24-30 周完整版` 管理预期，避免低估工期造成返工。

该方案在风险、工期与可维护性之间更平衡，适合作为下一阶段实施依据。

---

## 18. 执行进展（2026-03-01）

本轮已按 `vibe-coding-github-sop` 与 `turborepo` 原则启动落地，完成“16. 立即行动建议”中的本周事项：

- [x] 启动 `@birdcc/parser` 原型，并完成多词短语识别（`local as`、`next hop self` 等）与单测验证。
- [x] 定义 `@birdcc/core` 与 `@birdcc/linter` 的接口边界，落地最小语义诊断与协议规则诊断。
- [x] 完成 `bird -p` 诊断解析器最小实现（支持 `file:line:col` 与 `Parse error ..., line N:` 两类输出）。

配套工程化已就绪：

- [x] Turborepo + pnpm monorepo 基础结构（根脚本仅 `turbo run`，任务逻辑均在包内）。
- [x] 自动化检查可执行：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm format`。
- [x] 配置 DSL 主干声明解析已接入 parser（`include/define/protocol/template/filter/function`）。
- [x] `sample/*.conf` fixtures 已接入 parser 测试覆盖（`basic/bgp_advanced/bogon/protocol_phrases`）。
- [x] `birdcc` 聚合 CLI 已打通 `lint/fmt/lsp --stdio`，其中 `lsp --stdio` 已可启动最小诊断服务。
