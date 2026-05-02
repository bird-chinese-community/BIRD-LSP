# Changelog 🕊️

<!-- markdownlint-disable MD024 -->

All notable changes to `@birdcc/vscode` will be documented in this file.

## [0.5.1] - 2026-05-02

### 🐛 Fixed / 修复

- 🧩 **ASN 上下文误报修复** / **ASN Context False Positives** (#134, PR #136)

将 ASN 正则模式分类为「确保上下文」（`local as`、`neighbor as`、`bgp_path` 操作及数组）和「启发式上下文」（`define`、`community.add`）。确保上下文接受任意正整数——BIRD 语法保证这些位置一定是 ASN 值。短 ASN（如 `local as 44`）不再被错误过滤，补全、hover、inlay hints 行为保持一致。

Categorized ASN regex patterns into **guaranteed** contexts (`local as`, `neighbor as`, `bgp_path` operations/arrays) and **heuristic** contexts (`define`, `community.add`). Guaranteed contexts now accept any positive integer, since BIRD grammar ensures these positions are ASNs. Short ASNs (e.g. `local as 44`) are no longer incorrectly excluded from completions, hovers, and inlay hints.

- 🩺 **Fragment / Include 文件误报修复** / **Fragment/Include False Positives** (#132, PR #137)

`inferLintDocumentRole` 的目录检测逻辑调整至内容检测之前执行。位于 `peers/`、`snippets/` 等 fragment 目录下、同时包含 `include` 指令的文件，不再被误判为 entry 文件，消除 `sym/*` 系列规则的误报。

Reordered `inferLintDocumentRole` so directory-based role detection runs **before** content-based entry detection. Fragment files with `include` directives are now correctly classified instead of being forced to `"entry"`, eliminating `sym/*` false positives.

- 📐 **Formatter `[= ... =]` 缩进修复** / **Set Literal Indentation** (#132, PR #137)

`countLeadingCloseTokens` 新增识别 BIRD `[= ... =]` set literal 语法中的 `=]` 闭合符，多行 AS-path filter 等 set literal 内容现在正确缩进。Builtin 和 dprint 引擎同步修复。

`countLeadingCloseTokens` now recognizes `=]` as a structural close token for BIRD's `[= ... =]` set literal syntax. Multiline set literal bodies are properly indented in both the builtin and dprint formatter engines.

- 🐦 **`bird -p` 相对路径修复** / **Relative Include Resolution** (PR #138)

`runBirdValidation` 将 `bird -p` 的工作目录设为配置文件所在目录，相对 `include` 路径正确解析。`filePath` 自动 resolve 为绝对路径，避免相对路径双前缀问题。

The working directory for `bird -p` validation is now set to the config file's directory so that relative `include` paths resolve correctly. The file path is automatically resolved to absolute to prevent double-prefix issues.

### ✨ Added / 新增

- 🏷️ **`router id` 支持 define 常量** / **Router ID Constant Resolution** (#133, PR #135)

`router id <IDENTIFIER>` 先尝试从 `define` 常量表中查找再验证值合法性（IPv4 地址 / AS 号码 / `from routing` / `from dynamic`）。链式定义（`define A = B; define B = 192.0.2.1; router id A;`）迭代解析，最大深度 64 层。

`router id <IDENTIFIER>` now resolves against `define`d constants before validating the resolved value. Chained definitions (`define A = B; define B = 192.0.2.1; router id A;`) are resolved iteratively up to a depth of 64.

### 📖 Documentation / 文档

- 📜 新增 `CODE_OF_CONDUCT.md` 和 `SECURITY.md`，含漏洞报告渠道、安全响应目标和协调披露指南。
- 📜 Added `CODE_OF_CONDUCT.md` and `SECURITY.md` with vulnerability reporting channels, response targets, and coordinated disclosure guidelines.

---

## [0.5.0] - 2026-03-07

### ✨ Added / 新增

#### 🛰️ ASN Intelligence / ASN 智能感知

![ASN Intelligence Screenshot](https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/refs/heads/main/.github/assets/screenshots/asn-hint-hover.png)

基于内置 `@birdcc/intel` 数据集，新增 ASN 感知的自动补全、悬停提示和内联提示。改进了 BGP 上下文中的 ASN 识别，为保留/私有 ASN 提供回退显示，新增 `bird2-lsp.intel.*` 设置项用于开关功能。

ASN-aware autocompletion, hover, and inlay hints using the bundled `@birdcc/intel` dataset. Improved ASN recognition in BGP contexts, with fallback for reserved/private ASNs, and new `bird2-lsp.intel.*` settings to toggle features.

- 🧭 **`bird.config.json` 感知的项目分析** / **Config-Aware Project Analysis**

  Language server 现在理解 `bird.config.json` / `birdcc.config.json`，能自动检测 monorepo 中的入口文件，并在需要时建议创建配置文件。

  Language server now understands `bird.config.json` / `birdcc.config.json`, auto-detects entry files in monorepos, and suggests config files when beneficial.

- ⏳ **项目分析进度通知** / **Analysis Progress Notifications**

  长时间分析任务显示进度提示，让用户知道工具正在工作中。

  Long-running analysis shows progress notifications so users know the tool is working.

- 🌍 **更广泛的真实环境覆盖** / **Broader Real-World Coverage**

  扩展了 parser、core、linter 对生产环境 BIRD 语法的支持：`local as`、更多 `neighbor` 形式、ASPA 表、更丰富的 filter/log 语法，以及健壮的 wildcard `include` 解析。

  Expanded parser, core, and linter support for production BIRD syntax: `local as`, more `neighbor` forms, ASPA tables, richer filter/log grammar, and resilient wildcard `include` resolution.

### 🐛 Fixed / 修复

- 🧠 **大文件类型提示卡顿** / **Large-File Type Hint Stalls** — 修复了大文件上类型推断导致的卡顿。
  Fixed stalls in type-hint inference on large files.

- 🔗 **工作空间入口检测** / **Workspace Entry Detection** — 修复了嵌套工作空间和混合路径风格下的入口初始化可靠性。
  Reliable workspace entry initialization across nested workspaces and mixed path styles.

- 🗺️ **深层项目回退** / **Deep Project Fallback** — 保留全扫描回退机制，确保不遗漏任何项目根目录。
  Retained full-scan fallback to ensure no project root is missed.

- 🩺 **减少误报** / **Reduced False Positives** — 消除了多个 linter 边界情况：include-only 文件片段、router ID 检查、函数符号、可迭代推断、模板 BGP 会话、符号 AS 变体、路由限制验证。
  Squashed linter edge cases: include-only fragments, router ID checks, function symbols, iterable inference, template BGP sessions, symbolic AS variants, and route-limit validation.

- 🧩 **Parser 恢复改进** / **Parser Recovery Improvements** — 改进了匿名协议、拆分 IPv6 neighbor 尾部、接口/端口作用域、匿名声明等场景的错误恢复。
  Better recovery from anonymous protocols, split IPv6 neighbor tails, interface/port scoping, and anonymous declarations.

### ⚡ Performance / 性能

- 🚀 **工作空间作用域 Include** / **Workspace-Scoped Includes** — Include 展开限制在工作空间边界内，避免触及禁止的系统根目录。
  Include expansion limited to workspace boundaries, avoiding forbidden system roots.

- 🎯 **更智能的跨文件检测** / **Smarter Cross-File Detection** — 改进入口点自动检测，实现更有针对性的分析。
  Improved entry-point auto-detection for more targeted analysis.

- 🪶 **更紧凑的 ASN 过滤** / **Tighter ASN Filtering** — 将 ASN 查找缩小到相关上下文，减少噪音。
  Narrowed ASN lookups to relevant contexts, reducing noise.

---

## [0.3.2] - 2026-03-04

### ✨ Added / 新增

- 📋 **改进的反馈与支持** / **Improved Feedback & Support**

  README 新增 "Feedback & Support" 板块，直接链接到 Bug Report 和 Feature Request 模板、GitHub Discussions 及 Task Index。

  Added "Feedback & Support" section in README with direct links to Bug Report and Feature Request templates, GitHub Discussions, and Task Index.

### 🔧 Improved / 改进

- 🐛 **更好的 Issue 报告体验** / **Better Issue Reporting**

  更新扩展内 "Report Issue" 按钮，直接打开预设了错误上下文（faqId、环境信息）的结构化 Bug Report 模板。

  Updated in-extension "Report Issue" button to directly open the structured Bug Report template with pre-filled error context (faqId, environment info).

## [0.3.1] - 2026-03-04

### 🐛 Fixed / 修复

- 📦 **OpenVSX 打包修复** / **OpenVSX Packaging Fix**

  修复了 VSIX 重新打包时 `zip` 命令添加 Unix 特有扩展字段（UID/GID、权限）导致 OpenVSX 审核拒绝 v0.3.0 的问题。添加 `-X` 标志排除额外字段。

  Fixed VSIX repackaging issue where the `zip` command added Unix-specific extra fields (UID/GID, permissions) that caused OpenVSX moderation to reject version 0.3.0. Added `-X` flag to exclude extra fields.

### 🔧 Improved / 改进

- 🔄 **OpenVSX 验证** / **OpenVSX Verification**

  CI 新增发布后验证步骤，轮询 OpenVSX API 确认扩展可用性，提前发现异步审核失败。

  Added post-publish verification step in CI to poll OpenVSX API and confirm extension availability, detecting async moderation failures early.

## [0.3.0] - 2026-03-04

### ✨ Added / 新增

- 📦 **Extension Pack / 扩展包**

  引入 `@birdcc/vscode-pack` 扩展包，专有图标和 CI 构建/发布工作流，支持一键安装全部 BIRD2 工具链。

  Introduced `@birdcc/vscode-pack` extension bundle with a dedicated icon and CI build/publish workflows, allowing users to install all BIRD2 tooling in one click.

- 🧠 **上下文感知悬停系统** / **Context-Aware Hover System**

  完全重建了悬停解析器，采用上下文感知流水线，根据光标位置（如 protocol 级别 vs area 级别 vs interface 级别）解析对应的用法片段。同一解析器在 LSP server 和 VS Code 扩展间共享。

  Completely rebuilt hover resolution with a context-aware pipeline that resolves usage snippets based on cursor position (e.g., protocol level vs. area level vs. interface level). The same resolver is shared between the LSP server and the VS Code extension.

- 📚 **BGP 悬停文档全覆盖** / **Comprehensive BGP Hover Docs**

  新增 30+ 条 hover-doc 条目，覆盖 session、policy、timer、authentication、confederation、route reflector 和 channel 选项；用法示例现在展示完整的层级上下文。

  Added 30+ hover-doc entries covering session, policy, timer, authentication, confederation, route reflector, and channel options; usage examples now show full hierarchical context.

- 📚 **OSPF 悬停文档全覆盖** / **Comprehensive OSPF Hover Docs**

  新增 28 条 hover-doc 条目，覆盖 protocol/area/interface 三个层级，包括 RFC 1583 兼容、stub/NSSA 区域、virtual link 和 timer；用法示例从 9 条扩展到 40+ 条。

  Added 28 hover-doc entries for protocol/area/interface levels, covering RFC 1583 compat, stub/NSSA areas, virtual links, and timers; usage examples expanded from 9 to 40+.

- 📚 **BFD / Babel / RIP 悬停文档** / **BFD / Babel / RIP Hover Docs**

  新增 BFD 间隔、Babel rxcost 和 hello/update 间隔、RIP timer、split horizon 和 version 设置的逐项文档。

  Added per-option documentation for BFD intervals, Babel rxcost and hello/update intervals, and RIP timers, split horizon, and version settings.

- 📚 **Kernel / Static / Device / Direct / Pipe 悬停文档** / **Kernel / Static / Device / Direct / Pipe Hover Docs**

  新增 scan time、check link、kernel table、merge paths 和 peer table 等选项的文档覆盖。

  Added coverage for scan time, check link, kernel table, merge paths, and peer table options.

- 📚 **RAdv / RPKI / 扩展协议悬停文档** / **RAdv / RPKI / Extended Protocol Hover Docs**

  新增 Aggregator、BMP、L3VPN、MRT、Perf、RAdv（prefix、RDNSS、DNSSL、RA 间隔）和 RPKI（TCP/SSH 传输、refresh/retry/expire 定时器）的文档。

  Added documentation for Aggregator, BMP, L3VPN, MRT, Perf, RAdv (prefix, RDNSS, DNSSL, RA intervals), and RPKI (TCP/SSH transport, refresh/retry/expire timers).

- 🔗 **全部协议子选项用法条目** / **Usage Entries for All Protocol Sub-Options**

  为每个主要协议的各类子选项新增约 80 条内联用法片段，填补编辑器内指引的最后空白。

  Added ~80 inline usage snippets for sub-options across every major protocol, filling the last gaps for in-editor guidance.

- 🌐 **全局和 Filter 关键字覆盖** / **Global & Filter Keyword Coverage**

  完成所有全局和 filter 语言关键字的 hover-doc 及用法覆盖。

  Completed hover-doc and usage coverage for all global and filter-language keywords.

### 🐛 Fixed / 修复

- 🖱️ **重复悬停抑制** / **Duplicate Hover Suppression**

  VS Code 扩展现在在 LSP server 活跃时从 hover provider 返回 `null`，防止两个悬停弹窗同时出现。

  The VS Code extension now returns `null` from its hover provider when the LSP server is active, preventing duplicate hover popups.

- 🔒 **`documentSymbol` 崩溃守卫** / **`documentSymbol` Crash Guard**

  在创建 `DocumentSymbol` 之前新增对 `metadata.symbolName` 的 falsy 检查，修复了由空符号名引起的 `vscode-languageclient` 崩溃。

  Added a falsy check on `metadata.symbolName` before creating a `DocumentSymbol`, fixing a `vscode-languageclient` crash caused by empty symbol names.

- 🎨 **Hover Markdown 布局** / **Hover Markdown Layout**

  悬停卡片现在以结构化标题 + 块引用描述 + 元数据区域的形式呈现；参数以 markdown 表格展示，参考链接区分 BIRD v2 和 v3。

  Hover cards now render with a structured heading + blockquote description + metadata section; parameters are displayed as a markdown table and reference links distinguish BIRD v2 vs v3.

- 📋 **命令失败 FAQ 引导** / **FAQ Guidance for Command Failures**

  当 `bird -p` 验证或扩展命令激活失败时，在扩展内状态栏和输出通道显示指向 FAQ 的提示。

  Added in-extension status bar and output channel hints directing users to the FAQ when `bird -p` validation or extension commands fail to activate.

- 🔧 **类型提示与大文件指导** / **Type Hints & Large-File Guidance**

  稳定了悬停类型提示的显示，改进大文件守卫的消息文本，降低困惑。

  Stabilized hover type-hint display and improved large-file guard messaging for a less confusing experience.

### ⚡ Performance / 性能

- 🚀 **并行跨文件 Lint** / **Parallel Cross-File Lint**

  `lintResolvedCrossFileGraph` 现在使用 `Promise.all` 并发运行所有逐文件 lint 任务，消除大量 `include` 指令工作空间中的顺序 await 瓶颈。

  `lintResolvedCrossFileGraph` now runs all per-file lint tasks concurrently with `Promise.all`, eliminating sequential await bottlenecks for workspaces with many `include` directives.

- 🧩 **LSP 请求去重** / **LSP Request Deduplication**

  `getGraphForDocument` 现在对进行中的跨文件分析 promise 进行去重，防止多个 LSP 请求（hover、completion、diagnostics）同时到达时冗余重建图谱。

  `getGraphForDocument` now deduplicates in-flight cross-file analysis promises, preventing redundant graph rebuilds when multiple LSP requests arrive simultaneously.

- ⌨️ **智能行级关键字匹配** / **Smart Line-Scoped Keyword Matching**

  悬停关键字提取改用 `getLineText()` 替代全文 `split()`，将每次按键的内存分配从 O(n) 降至 O(1)。

  Hover keyword extraction uses `getLineText()` instead of full-document `split()`, reducing per-keypress allocation from O(n) to O(1).

- ⏱️ **回退验证器防抖** / **Fallback Validator Debounce**

  将 `VALIDATION_DEBOUNCE_MS` 从 300ms 提高到 800ms，减少快速输入时不必要的 `bird -p` 子进程调用。

  Raised `VALIDATION_DEBOUNCE_MS` from 300ms to 800ms to cut down on unnecessary `bird -p` subprocess spawns during fast typing.

### 🔧 Improved / 改进

- 🛡️ **Beta 规则严重性下调** / **Beta Rule Severity Downgrade**

  所有 linter 规则严重性在 beta 期间下调一级（`sym/cfg/net/type`: error→warning; `bgp/ospf`: warning→info），在规则集稳定前降低噪音。

  All linter rule severities reduced by one level for the beta period to lower noise while the rule set stabilizes.

- 🧹 **共享 LSP 工具函数** / **Shared LSP Utilities**

  提取 `utils.ts`，包含规范 key 辅助函数、范围转换和行文本访问器；消除散布在多个文件中的重复实现。

  Extracted `utils.ts` with canonical key helpers, range conversion, and line-text accessors; eliminated duplicate implementations across multiple files.

- 📁 **Hover Docs 源重构** / **Hover Docs Source-of-Truth Refactor**

  将悬停文档拆分为按协议分类的数据目录，无需触碰无关文件即可添加或更新条目。

  Split hover documentation into per-protocol data directories, making it straightforward to add or update entries without touching unrelated files.

---

## [0.2.0] - 2026-03-03

### ✨ Added / 新增

- 🎯 **选区格式化** / **Format Selection** — 注册 `DocumentRangeFormattingEditProvider`，可直接格式化选中代码块。
  Registered `DocumentRangeFormattingEditProvider` so selected blocks can be formatted directly.

- 🖱️ **编辑器右键菜单命令** / **Editor Context Menu Commands** — 新增右键菜单操作：`BIRD2: Validate Active Document` 和 `BIRD2: Format Active Document`。
  Added right-click actions for `BIRD2: Validate Active Document` and `BIRD2: Format Active Document`.

- 📖 **关键字悬停文档** / **Keyword Hover Documentation** — 新增 YAML 驱动的 BIRD2 关键字 hover 文档。
  Added YAML-driven hover docs for BIRD2 keywords.

- ⚡ **实时回退验证** / **Real-time Fallback Validation** — 在回退模式下新增 `onDidChangeTextDocument` 验证。
  Added `onDidChangeTextDocument` validation in fallback mode.

### 🐛 Fixed / 修复

- 📦 **VSIX 运行时完整性** / **VSIX Runtime Completeness** — 打包了运行时依赖和必需的数据资产，避免激活/运行时缺少模块错误。
  Packaged runtime dependencies and required data assets to avoid missing module errors.

- 🚀 **内置 LSP 启动** / **Bundled LSP Startup** — 默认启动使用内置 `@birdcc/lsp`，消除对全局安装 `birdcc` 的硬依赖。
  Default startup now uses bundled `@birdcc/lsp`, removing hard dependency on globally installed `birdcc`.

- 🔌 **LSP stdio 传输** / **LSP stdio Transport** — 内置 server 启动现传 `--stdio`，修复连接流初始化和崩溃循环。
  Bundled server startup now passes `--stdio`, fixing connection stream initialization and crash loops.

- 🧩 **激活可靠性** / **Activation Reliability** — 添加显式 `onCommand:*` 激活事件，确保命令触发的激活可靠。
  Added explicit `onCommand:*` activation events to ensure command-triggered activation is reliable.

- 🖱️ **右键菜单可见性** / **Context Menu Visibility** — 修正 `menus.when` 表达式中的 `bird2` 语言上下文。
  Corrected `menus.when` expressions for `bird2` language context.

- 🌐 **远程工作空间支持** / **Remote Workspace Support** — 放宽了 provider 注册的选择器，支持非 `file` 文档（远程工作空间）。
  Relaxed provider registration selectors to work in non-`file` documents (remote workspaces).

### 🔧 Improved / 改进

- 🛡️ **状态栏稳定性** / **Status Bar Stability** — 加固状态/生命周期初始化，改进状态显示一致性。
  Hardened status/lifecycle initialization and improved status display consistency.

- 📝 **运行时日志** / **Runtime Logging** — 改进启动模式和生命周期诊断的输出通道日志。
  Improved output channel logging for startup mode and lifecycle diagnostics.

- 🚚 **打包工作流** / **Packaging Workflow** — 标准化 VSIX 产物输出到 `release/bird2-lsp.vsix`，清理遗留输出避免嵌套/过时产物。
  Standardized VSIX artifact output to `release/bird2-lsp.vsix` and cleaned legacy output.

- 🧭 **文档同步工作流** / **Docs Sync Workflow** — 标准化 hover 文档同步流程，增强可维护性。
  Standardized hover docs synchronization flow for maintainability.

- 🎨 **Marketplace 元数据** / **Marketplace Metadata** — 添加扩展图标，优化打包元数据以提升 marketplace 展示效果。
  Added extension icon and refined packaging metadata for cleaner marketplace display.

---

## [0.0.1-alpha.0] - 2025-02-28

### 🎉 Initial Release / 初始发布

- 🏗️ **Extension Scaffold / 扩展脚手架** — 初始 VS Code 扩展脚手架和激活生命周期。
  Initial VS Code extension scaffold and activation lifecycle.

- 🔒 **Security First / 安全优先** — 回退验证命令加固，含工作空间信任检查。
  Fallback validation command hardening with workspace trust checks.

- 📁 **Large File Support / 大文件支持** — 扩展端高开销功能的大文件守卫。
  Large-file guards for expensive extension-side features.

- 🧪 **Testing Foundation / 测试基础** — 真实环境性能和冒烟测试集成支持。
  Real-world performance and smoke-test integration support.

- ✅ **Unit Tests / 单元测试** — 初始单元测试基础（Vitest + 测试脚本 + 配置 + security/config parser 测试）。
  Initial unit-testing foundation with Vitest (test script + config + security/config parser tests).

- 📚 **Documentation / 文档** — 包级 README 和配置指南。
  Package-level README and configuration guide.

---

[0.5.1]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.5.0...vscode-v0.5.1
[0.5.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.3.2...vscode-v0.5.0
[0.3.2]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.3.1...vscode-v0.3.2
[0.3.1]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.3.0...vscode-v0.3.1
[0.3.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.2.0...vscode-v0.3.0
[0.2.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.6...vscode-v0.2.0
[0.0.1-alpha.0]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/vscode-v0.0.1-alpha.0
