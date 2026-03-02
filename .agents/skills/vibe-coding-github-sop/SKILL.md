---
name: vibe-coding-github-sop
description: Vibe Coding 与 GitHub 项目管理标准化操作流程 (SOP)，适用于 GitHub Org & Repo + 多 Agent 协作场景。在需要规范开源项目任务拆解、元信息管理、Issue/PR 工作流、标签体系、GitHub Projects v2 操作时使用。
---

# Vibe Coding GitHub SOP

规范开源项目的任务拆解、元信息管理及开发流程，针对 GitHub Org & Repo + 多 Agent 协作场景优化。

## 使用场景

- 创建和管理 GitHub Issues / Epic
- 拆分任务为 Sub-Issues
- 配置 GitHub Projects v2 看板
- 管理 Issue/PR 标签体系
- 规范分支命名和提交信息
- 协调人类维护者与 AI Agent 协作

## 角色与工具

**角色**：
- **Maintainer (人类)**：架构决策、Code Review、合并代码
- **Agent (AI)**：代码生成、单元测试、文档编写、元信息维护

**工具栈**：GitHub CLI (`gh`), Git (`git`), GitHub Projects v2

## 核心工作流

### 第一步：创建 Epic Issue

针对大型功能或专项任务，创建总 Issue 作为跟踪点：

```bash
gh issue create --title "[Epic] 任务名称" --body "## 任务描述" --label "type/epic"
```

详见：[references/issue-workflow.md](references/issue-workflow.md)

### 第二步：拆分 Sub-Issues

将总任务拆解为 Agent 可独立执行的原子任务：

1. **关联父 Issue**：在 Body 中明确 `Part of #PARENT_ID`
2. **设置元信息**：`Assignees`, `Project`, `Milestone`
3. **打上类型标签**：根据任务性质选择 `type/*` 标签

详见：[references/label-system.md](references/label-system.md)

### 第三步：分支开发与 PR

1. **创建分支**：`issue/<ID>/<type>-<short-desc>`
2. **提交 PR**：标题遵循 Conventional Commits，正文包含 `Closes #ISSUE_NUMBER`
3. **更新状态**：提交 PR 后自动将 Project 状态改为 `In review`

详见：[references/git-workflow.md](references/git-workflow.md)

### 第四步：评审与合并

1. **CI 检查**：必须通过自动化检查
2. **评审标记**：`status/changes-requested` 或 `status/approved`
3. **合并**：仅 Maintainer 或授权 Agent 执行

## 标签体系

详见：[references/label-system.md](references/label-system.md)

## GitHub CLI 快捷操作

详见：[references/gh-cli-commands.md](references/gh-cli-commands.md)

### 修改 Project 字段

```bash
export PJ_NUM=1

# 修改状态
gh project item-edit --project-number $PJ_NUM \
  --field "Status" --single-select-option "In progress" \
  --issue-number <ID>

# 修改优先级
gh project item-edit --project-number $PJ_NUM \
  --field "Priority" --single-select-option "P1" \
  --issue-number <ID>
```

详见：[references/gh-cli-commands.md](references/gh-cli-commands.md)

## 项目字段配置

创建 GitHub Project 时需配置的自定义字段：

详见：[references/project-fields.md](references/project-fields.md)

## Agent 自我修正机制

Agent 发现缺少信息时：

1. **不要**盲目编写代码
2. 添加标签 `agent/blocked` 和 `help wanted`
3. 在 Issue 中评论说明缺失信息

```bash
gh issue edit <ID> --add-label "agent/blocked,help wanted"
gh issue comment <ID> --body "⚠️ **Agent Blocked**: 缺少 API 文档"
```

## 参考文档

| 主题 | 路径 |
|------|------|
| Issue 工作流 | [references/issue-workflow.md](references/issue-workflow.md) |
| 标签体系详解 | [references/label-system.md](references/label-system.md) |
| Git 工作流 | [references/git-workflow.md](references/git-workflow.md) |
| GitHub CLI 命令 | [references/gh-cli-commands.md](references/gh-cli-commands.md) |
| Project 字段配置 | [references/project-fields.md](references/project-fields.md) |
| 状态对应表 | [references/status-mapping.md](references/status-mapping.md) |
