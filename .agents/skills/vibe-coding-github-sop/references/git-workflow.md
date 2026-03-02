# Git 工作流详解

## 分支命名规范

格式：`issue/<ID>/<type>-<short-desc>`

示例：

- `issue/42/feat-user-login`
- `issue/43/fix-db-timeout`
- `issue/44/docs-api-update`

## 提交信息规范 (Conventional Commits)

格式：`<type>(<scope>): <description>`

| 类型       | 对应 Label      | 示例                                  |
| ---------- | --------------- | ------------------------------------- |
| `feat`     | `type/feat`     | `feat(auth): add jwt login support`   |
| `fix`      | `type/fix`      | `fix(db): resolve connection timeout` |
| `docs`     | `type/docs`     | `docs(readme): update install guide`  |
| `refactor` | `type/refactor` | `refactor(user): simplify validation` |
| `test`     | `type/test`     | `test(api): add integration tests`    |
| `chore`    | `type/chore`    | `chore(deps): upgrade typescript`     |

## PR 创建流程

### 1. 创建分支

```bash
git checkout -b issue/42/feat-user-login
```

### 2. 开发与提交

```bash
git add .
git commit -m "feat(auth): implement user login"
```

### 3. 推送分支

```bash
git push -u origin issue/42/feat-user-login
```

### 4. 创建 PR

请参考：[gh CLI 命令参考](references/gh-cli-commands.md) 中的 PR 创建命令示例。

## PR 正文模板

```markdown
Closes #ISSUE_NUMBER

## 描述

简要描述变更内容。

## 变更

- 变更 1
- 变更 2

## 检查清单

- [ ] 代码遵循项目规范
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 文档已更新

## 截图（如适用）

## 其他说明
```

## 评审流程

1. **提交 PR 后**
   - 自动触发 CI
   - Agent 将 Project 状态改为 `In review`

2. **评审反馈**
   - `status/changes-requested`: 需要修改
   - `status/approved`: 审查通过

3. **修改后**
   - 推送新提交
   - 回复评论说明修改内容

4. **合并**
   - 仅 Maintainer 或授权 Agent 执行
   - 使用 Squash Merge 保持历史整洁
