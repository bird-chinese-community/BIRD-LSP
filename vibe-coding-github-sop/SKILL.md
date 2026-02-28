# Vibe Coding 与项目管理标准化操作流程 (SOP)

## 0. 本仓库专属定义

(仅供本仓库使用，请搭配 GitHub Projects v2 使用，推荐使用 `Bug tracker` 模板创建 Project)

创建 Projects 时，请确保包含以下自定义字段：

### 修改状态 (`Status`)

必选：To triage, Backlog, Ready, In progress, In review, Done

### 优先级 (`Priority`)

必选：P0, P1, P2, P3, P4 (模板默认只有 P0-P2，可手动添加 P3, P4)

### 预估规模 (`Size`)

必选：XS, S, M, L, XL, XXL, XXXL (模板默认只有 XS-XL，可手动添加更大尺寸)

### 预估工时 (`Estimate`)

可选：数字，单位小时

## 1. 目标与角色

本 SOP 旨在规范化开源项目的任务拆解、元信息管理及开发流程，特别针对 **GitHub Org & Repo** + **多 Agent 协作** 场景进行优化，确保人类维护者与 AI Agent 之间的上下文对齐。

**执行角色**：

- **Maintainer (人类)**：负责架构决策、Code Review、合并代码。
- **Agent (AI)**：负责代码生成、单元测试、文档编写、元信息维护。

**工具栈**：GitHub CLI (`gh`), Git (`git`), GitHub Projects v2

---

## 2. 核心任务流程

### 第一步：创建专项总 Issue (Epic)

针对大型功能或专项任务，首先开辟一个总 Issue 作为跟踪点。

```bash
gh issue create --title "[Epic] 任务名称" --body "## 任务描述内容" --label "type/epic"
```

### 第二步：拆分 Sub Issue 并配置元信息

将总任务拆解为 Agent 可独立执行的原子任务。

1.  **关联父 Issue**：在 Body 与 Issue metadata 中明确提及 `Part of #PARENT_ID`。
2.  **设置基础元信息**：必须设置 `Assignees`, `Project`, `Milestone`。
3.  **打上类型标签**：根据任务性质打上 `type/*` 标签（见下文定义）。

### 第三步：分支开发与 PR 关联

1.  **创建开发分支**：
    - 格式：`issue/<ID>/<type>-<short-desc>`
    - 示例：`issue/42/feat-user-login`
2.  **提交 PR**：
    - PR 标题需遵循 **Conventional Commits** (见第 4 节)。
    - PR 正文必须包含 `Closes #ISSUE_NUMBER`。
    - **Agent 动作**：提交 PR 后，自动将 Project 状态改为 `In review`。

### 第四步：代码评审与关闭

1.  **自动化检查**：CI/CD 必须通过。
2.  **人工/Agent 评审**：
    - 若需修改，Reviewer 打上 `status/changes-requested`。
    - 若通过，打上 `status/approved`。
3.  **合并**：仅限 Maintainer 或获得授权的 Agent 执行合并。合并 PR 后 Issue 将会自动关闭。

---

## 3. 标签 (Tag/Label) 定义体系

为了让 Agent 准确识别任务类型和优先级，所有 Issue 和 PR 必须包含以下维度的标签。

### 3.1 类型标签 (Type) - 必选其一

_颜色建议：使用柔和色系区分_

| Label           | 含义     | 触发 Agent 行为            |
| :-------------- | :------- | :------------------------- |
| `type/epic`     | 总任务   | 仅用于追踪，不直接编写代码 |
| `type/feat`     | 新功能   | 生成功能代码及对应测试     |
| `type/fix`      | Bug 修复 | 分析错误日志，修复逻辑     |
| `type/docs`     | 文档     | 更新 README 或 Wiki        |
| `type/refactor` | 重构     | 优化代码结构，不改变行为   |
| `type/test`     | 测试     | 补充单元测试或集成测试     |
| `type/chore`    | 杂项     | 依赖升级、配置修改         |

### 3.2 优先级标签 (Priority) - 辅助视图

_虽然 Project 中有字段，但 Label 可视化更强, 下文的 priority 字段定义也可参考本小节_

| Label         | 含义                         |
| :------------ | :--------------------------- |
| `priority/P0` | 紧急，阻碍主流程，最高优先级 |
| `priority/P1` | 高优，本周内完成             |
| `priority/P2` | 正常，按计划排期             |
| `priority/P3` | 低优，有空再做               |
| `priority/P4` | 可选，非必要功能             |

### 3.3 Agent 协作标签 (Agent Interaction) - 核心

_用于 Agent 之间的信号传递或请求人类介入_

| Label              | 含义             | 适用场景                     |
| :----------------- | :--------------- | :--------------------------- |
| `agent/wip`        | Agent 正在处理中 | 避免多 Agent 撞车            |
| `agent/blocked`    | Agent 受阻       | 缺少上下文或依赖未完成       |
| `help wanted`      | 需要人类介入     | Agent 无法决策或逻辑过于复杂 |
| `good first issue` | 适合 Agent 入门  | 上下文简单，独立性强         |

<!-- 本文档由 t.me/hatschannel (https://www.hats-land.com) 撰写，转发请注明出处-->

### 3.4 组件/领域标签 (Area) - 可选

_用于限定上下文范围 (Context Window)_

- `area/frontend`: 前端相关
- `area/backend`: 后端相关
- `area/database`: 数据库/Schema 变更
- `area/api`: 接口定义

---

## 4. 提交与 PR 规范 (Conventional Commits)

Agent 生成的代码提交和 PR 标题必须严格遵循以下格式，以便自动生成 Changelog。

**格式**：`<type>(<scope>): <description>`

| 类型 (Type)  | 对应 Label      | 示例                                           |
| :----------- | :-------------- | :--------------------------------------------- |
| **feat**     | `type/feat`     | `feat(auth): add jwt login support`            |
| **fix**      | `type/fix`      | `fix(db): resolve connection timeout`          |
| **docs**     | `type/docs`     | `docs(readme): update install guide`           |
| **refactor** | `type/refactor` | `refactor(user): simplify validation logic`    |
| **test**     | `type/test`     | `test(api): add integration tests for payment` |

---

## 5. GitHub CLI 操作指南

### 5.1 基础元信息修改 (`gh issue`)

- **添加复合标签 (推荐 Agent 使用):**

  ```bash
  gh issue edit <ID> --add-label "type/feat,area/backend,priority/high"
  ```

- **Agent 标记自己为执行者:**
  ```bash
  gh issue edit <ID> --add-assignee "@me"
  ```

### 5.2 项目管理 (GitHub Projects v2)

修改 Project 中的自定义字段需使用 `gh project item-edit`。

#### 修改状态与属性

```bash
# 获取 Project ID (假设为 1)
export PJ_NUM=1

# 1. 修改状态为开发中
gh project item-edit --project-number $PJ_NUM --field "Status" --single-select-option "In progress" --issue-number <ID>

# 2. 修改优先级为 P1
gh project item-edit --project-number $PJ_NUM --field "Priority" --single-select-option "P1" --issue-number <ID>

# 3. 设置预估规模 (T-shirt Size)
gh project item-edit --project-number $PJ_NUM --field "Size" --single-select-option "M" --issue-number <ID>
```

---

## 6. 最佳实践技巧

### 6.1 Agent 的自我修正机制

如果 Agent 在执行任务时发现缺少信息，应执行以下步骤：

1.  **不要**盲目编写代码。
2.  添加标签 `agent/blocked` 和 `help wanted`。
3.  在 Issue 中发表评论 (Comment)，明确指出缺失的信息（如：缺失 API 文档、设计图模糊）。

```bash
gh issue edit <ID> --add-label "agent/blocked,help wanted"
gh issue comment <ID> --body "⚠️ **Agent Blocked**: 无法找到 `User` 表的 Schema 定义，请补充 context。"
```

### 6.2 快速检查项目字段选项

Agent 在尝试修改 Project 字段前，应先读取 Schema 以避免参数错误：

```bash
gh project field-list <PROJECT_NUMBER> --owner "@me" --format json
```

### 6.3 一键创建标准化 Issue (Template)

```bash
gh issue create \
  --title "feat(user): 实现用户注册接口" \
  --body "Ref #10\n\n## 描述\n实现基于 Email 的注册功能。\n\n## 验收标准\n- [ ] 校验邮箱格式\n- [ ] 密码加密存储" \
  --label "type/feat,area/backend,priority/medium" \
  --project "Demo Project" \
  --milestone "v1.0" \
  --assignee "@me"
```

---

## 7. 状态对应关系表

| 项目 Status     | 对应 Issue Label (可选) | 对应开发阶段 | Agent 行为准则                  |
| :-------------- | :---------------------- | :----------- | :------------------------------ |
| **To triage**   | `status/triage`         | 待分拣       | 等待 User 分类，Agent 不处理    |
| **Backlog**     | `status/backlog`        | 积压         | 已进入队列，等待排期            |
| **Ready**       | `status/ready`          | 准备就绪     | **Agent 可领取 (Check out)**    |
| **In progress** | `agent/wip`             | 开发中       | Agent 正在编码，其他人勿动      |
| **In review**   | `status/review`         | 评审中       | 等待 Review，Agent 监控 CI 结果 |
| **Done**        | `status/done`           | 已完成       | 任务结束，上下文归档            |
