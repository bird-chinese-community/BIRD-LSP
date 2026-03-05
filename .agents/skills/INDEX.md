# Skills 索引与选择指南

本索引帮助 Agent 根据用户请求快速选择合适的 Skills。

---

## 快速选择

| 用户请求类型          | 推荐 Skill                                              |
| --------------------- | ------------------------------------------------------- |
| 分析参考项目/技术选型 | [`reference-analyzer`](#reference-analyzer)             |
| 设计系统架构          | [`architecture-designer`](#architecture-designer)       |
| 规划项目实施          | [`implementation-planner`](#implementation-planner)     |
| 代码/设计审查         | [`review-coordinator`](#review-coordinator)             |
| 组织项目文档          | [`project-indexer`](#project-indexer)                   |
| Rust 开发             | [`rust-engineer`](#rust-engineer)                       |
| Monorepo 管理         | [`turborepo`](#turborepo)                               |
| TypeScript E2E 测试   | [`typescript-e2e-testing`](#typescript-e2e-testing)     |
| 单元测试              | [`vitest`](#vitest)                                     |
| VS Code 扩展开发      | [`vscode-extension-builder`](#vscode-extension-builder) |
| GitHub 项目管理       | [`vibe-coding-github-sop`](#vibe-coding-github-sop)     |
| PR 评论处理           | [`pr-address-comments`](#pr-address-comments)           |
| npm 版本升级          | [`bumpp-npm-versioning`](#bumpp-npm-versioning)         |

---

## 技能分类

### 📐 软件开发通用（5 skills）

覆盖软件开发生命周期的通用方法论技能，与技术栈无关。

| Skill                                               | 主要职责                             | 触发场景                         |
| --------------------------------------------------- | ------------------------------------ | -------------------------------- |
| [`reference-analyzer`](#reference-analyzer)         | 分析参考项目，提取架构模式和技术选型 | 技术调研、评估多个参考项目       |
| [`architecture-designer`](#architecture-designer)   | 设计系统架构，定义模块和组件交互     | 新系统设计、架构重构             |
| [`implementation-planner`](#implementation-planner) | 制定实施计划，包括代码结构和构建流程 | 规划开发阶段、设计代码组织       |
| [`project-indexer`](#project-indexer)               | 生成项目索引，链接任务和文档         | 创建分析报告索引、组织多阶段项目 |
| [`review-coordinator`](#review-coordinator)         | 多维度审查（架构/逻辑/安全/性能）    | 全面设计审查、代码评审           |

### 🛠️ 技术栈专项（4 skills）

特定技术领域的深度专业知识。

| Skill                                               | 技术领域            | 核心能力                                         |
| --------------------------------------------------- | ------------------- | ------------------------------------------------ |
| [`rust-engineer`](#rust-engineer)                   | Rust 语言           | 所有权/借用/生命周期、异步编程 (tokio)、内存安全 |
| [`turborepo`](#turborepo)                           | Monorepo 构建       | 任务管道、缓存策略、包过滤、CI 优化              |
| [`typescript-e2e-testing`](#typescript-e2e-testing) | TypeScript E2E 测试 | Jest、Docker 基础设施、GWT 模式、真实服务测试    |
| [`vitest`](#vitest)                                 | 单元测试框架        | Vite 原生、Mock、Coverage、并发测试              |

### 🔧 工具平台（4 skills）

特定平台/工具的使用指南。

| Skill                                                   | 平台/工具                | 主要功能                                          |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| [`vscode-extension-builder`](#vscode-extension-builder) | VS Code Extension API    | 扩展脚手架、命令/webview/语言支持、打包发布       |
| [`vibe-coding-github-sop`](#vibe-coding-github-sop)     | GitHub (Issues/Projects) | Epic 管理、Sub-Issues 拆分、标签体系、Projects v2 |
| [`pr-address-comments`](#pr-address-comments)           | GitHub PR                | PR 评论处理、代码审查反馈                         |
| [`bumpp-npm-versioning`](#bumpp-npm-versioning)         | bumpp + npm + gh         | Monorepo npm 包版本升级与发布可见性检查           |

---

## 技能详情

### reference-analyzer

**描述**: 分析现有软件项目作为参考实现，提取架构模式、技术选型、最佳实践和设计决策。

**使用场景**:

- 技术选型调研
- 比较多个参考实现
- 评估架构模式
- 识别功能差距
- 规划新项目开发

**触发关键词**: 技术选型、参考项目、对比分析、最佳实践、架构模式

**输出**: 对比矩阵、架构推荐、技术选型决策树、最佳实践清单

---

### architecture-designer

**描述**: 设计软件系统的完整架构，包括模块结构、组件交互、配置管理和扩展策略。

**使用场景**:

- 新系统的架构设计
- 现有系统的架构重构
- 定义模块边界和接口
- 设计配置管理系统
- 规划技术演进路线

**触发关键词**: 架构设计、模块边界、组件接口、系统结构、扩展策略

**输出**: 系统结构图、模块依赖图、组件交互图、决策日志（ADR）

---

### implementation-planner

**描述**: 创建软件项目的详细实施计划，包括代码结构、类型定义、构建流程和测试策略。

**使用场景**:

- 规划开发阶段和里程碑
- 设计代码组织结构
- 创建类型定义和接口
- 设置构建和部署流程
- 建立测试策略

**触发关键词**: 实施计划、代码结构、类型定义、构建流程、里程碑

**输出**: 项目结构文档、类型定义文档、构建工作流、测试策略

---

### review-coordinator

**描述**: 使用多个子代理协调软件系统的多维审查，分析架构质量、逻辑正确性、安全漏洞和性能瓶颈。

**使用场景**:

- 系统架构设计审查
- 代码安全和合规审计
- 性能特征分析
- 识别逻辑缺陷和边界情况
- 实施前的最终审查

**触发关键词**: 代码审查、安全审计、性能分析、逻辑缺陷、技术债务

**输出**: 4 份审查报告（架构/逻辑/安全/性能）+ 综合索引

---

### project-indexer

**描述**: 为软件项目生成全面的索引文档，链接任务、文档和代码，提供项目导航。

**使用场景**:

- 创建分析报告的索引
- 组织多阶段项目文档
- 链接 Issues 到实施任务
- 建立项目知识库
- 管理复杂的技术调研

**触发关键词**: 文档索引、项目导航、知识库、任务链接

**输出**: 项目索引文档、任务追踪结构、快速参考指南

---

### rust-engineer

**描述**: 构建需要内存安全、系统编程或零成本抽象的 Rust 应用。

**使用场景**:

- Rust 项目开发
- 系统编程任务
- WASM 模块开发
- 异步服务开发

**触发关键词**: Rust、Cargo、ownership、borrowing、lifetimes、tokio

---

### turborepo

**描述**: Turborepo monorepo 构建系统指导，包括任务管道、依赖管理、缓存和远程缓存。

**使用场景**:

- Monorepo 配置
- 任务流水线优化
- 构建缓存策略
- CI/CD 集成

**触发关键词**: turbo.json、monorepo、dependsOn、caching、--filter

---

### typescript-e2e-testing

**描述**: TypeScript/NestJS 项目的完整 E2E 和集成测试技能，使用 Jest、Docker 真实基础设施和 GWT 模式。

**使用场景**:

- E2E 测试架构设计
- 集成测试编写
- Docker 测试环境
- Kafka/DB/Redis 测试

**触发关键词**: E2E 测试、integration test、docker-compose、GWT、Kafka

---

### vitest

**描述**: Vitest 快速单元测试框架，支持 Vite、Jest 兼容 API、mock、coverage。

**使用场景**:

- 单元测试编写
- Mock 和 Stub
- 测试覆盖率
- 并发测试

**触发关键词**: 单元测试、mock、snapshot、coverage、test filter

---

### vscode-extension-builder

**描述**: 从头创建 VS Code 扩展的完整指南，包括项目脚手架、API 使用和打包。

**使用场景**:

- VS Code 扩展开发
- Language Server 集成
- Webview 开发
- 扩展打包发布

**触发关键词**: VS Code 扩展、plugin、Language Server、webview

---

### vibe-coding-github-sop

**描述**: Vibe Coding 与 GitHub 项目管理标准化操作流程 (SOP)。

**使用场景**:

- GitHub Issue 管理
- Epic/Sub-Issue 拆分
- Projects v2 配置
- 标签体系管理

**触发关键词**: GitHub Projects、Issue 管理、标签体系、Epic/Sub-issue

---

### pr-address-comments

**描述**: 帮助用户处理当前分支的 GitHub PR 评论。

**使用场景**:

- PR 评论处理
- 审查反馈响应
- 代码修改建议

**触发关键词**: PR comments、review feedback、address comments

---

### bumpp-npm-versioning

**描述**: 使用 bumpp 在 monorepo 中统一提升 npm 包版本，并执行发布前后可见性检查。

**使用场景**:

- 发版前统一 bump npm 包版本
- 需要排除特定包（例如 vscode、intel）
- 校验 npm/gh 上的发布状态

**触发关键词**: bumpp、npm version、pre-release、发布检查、npm view、gh run

---

## 常见工作流组合

### 1. 新项目启动

```
reference-analyzer → architecture-designer → implementation-planner → project-indexer
```

- 分析参考项目，避免重复造轮子
- 设计系统架构
- 制定实施计划
- 创建项目索引

### 2. 代码审查

```
review-coordinator [→ pr-address-comments]
```

- 并行执行 4 维度审查
- 处理 PR 评论（如适用）

### 3. GitHub 项目管理

```
vibe-coding-github-sop [→ pr-address-comments → project-indexer]
```

- Issue/PR 工作流管理
- 处理审查反馈
- 更新项目索引

### 4. 完整开发生命周期

```
reference-analyzer → architecture-designer → implementation-planner
        ↓
vibe-coding-github-sop (项目管理)
        ↓
[技术栈特定技能] (开发实现)
        ↓
review-coordinator (审查)
        ↓
pr-address-comments (反馈处理)
        ↓
project-indexer (文档归档)
```

---

## 技能依赖关系

```
软件开发通用层
├── reference-analyzer
├── architecture-designer
├── implementation-planner
├── project-indexer
└── review-coordinator
         │
         ▼
技术栈专项层
├── rust-engineer
├── turborepo
├── typescript-e2e-testing
└── vitest
         │
         ▼
工具平台层
├── vscode-extension-builder
├── vibe-coding-github-sop
└── pr-address-comments
```

---

## 索引维护

### 添加新 Skill

1. 在相应分类下添加条目
2. 更新快速选择表格
3. 更新技能详情部分
4. 考虑更新工作流组合

### 更新 Skill 信息

修改对应技能的详情部分，保持描述和触发关键词准确。

---

_最后更新: 2026-03-02_
