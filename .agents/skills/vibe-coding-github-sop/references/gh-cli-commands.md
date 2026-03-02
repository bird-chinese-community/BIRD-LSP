# GitHub CLI 命令参考

更多请参考 Skills:GH CLI Commands (ID: `gh-cli`)，如有不同，请参考本文档为主。

## Issue 操作

### 创建 Issue

````bash
gh issue create \
  --title "标题" \
  --label "type/feat" \
  --assignee "@me" \
  --project "Project Name" \
  --milestone "v1.0" \
  --body-file - <<'EOF'
## 背景

这里可以随便写 Markdown。

- 支持 `code`
- 支持 ```代码块```
- 支持 $变量不会被展开
- 支持引号 " '
- 支持反斜杠 \

```bash
echo "hello world"
````

### 编辑 Issue

```bash
# 添加标签
gh issue edit <ID> --add-label "type/feat,priority/P1"

# 移除标签
gh issue edit <ID> --remove-label "agent/wip"

# 分配
gh issue edit <ID> --add-assignee "@me"

# 修改标题
gh issue edit <ID> --title "新标题"
```

### 评论 Issue

```bash
gh issue comment <ID> --body "评论内容"
```

### 关闭 Issue

```bash
gh issue close <ID>
```

### 列出 Issues

```bash
# 列出所有 open issues
gh issue list

# 按标签过滤
gh issue list --label "type/feat"

# 按状态过滤
gh issue list --state closed
```

## PR 操作

### 创建 PR

````bash
gh pr create \
  --title "标题" \
  --label "type/feat" \
  --assignee "@me" \
  --project "Project Name" \
  --milestone "v1.0" \
  --body-file - <<'EOF'
## 背景

这里可以随便写 Markdown。

- 支持 `code`
- 支持 ```代码块```
- 支持 $变量不会被展开
- 支持引号 " '
- 支持反斜杠 \

```bash
echo "hello world"
````

### 检出 PR

```bash
gh pr checkout <PR_NUMBER>
```

### 列出 PRs

```bash
gh pr list
```

### 查看 PR 详情

```bash
gh pr view <PR_NUMBER>
```

### 合并 PR

```bash
# Squash 合并
gh pr merge <PR_NUMBER> --squash

# 普通合并
gh pr merge <PR_NUMBER>

# 合并并删除分支
gh pr merge <PR_NUMBER> --squash --delete-branch
```

## Project 操作

### 列出 Projects

```bash
gh project list --owner "@me"
```

### 查看 Project 字段

```bash
gh project field-list <PROJECT_NUMBER> --owner "@me"
```

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

# 修改规模
gh project item-edit --project-number $PJ_NUM \
  --field "Size" --single-select-option "M" \
  --issue-number <ID>
```

## Label 操作

### 创建标签

```bash
gh label create "type/feat" --color "a2eeef" --description "新功能"
```

### 列出标签

```bash
gh label list
```

## 快捷组合命令

### Agent 开始工作

```bash
gh issue edit <ID> --add-label "agent/wip" --add-assignee "@me"
gh project item-edit --project-number $PJ_NUM \
  --field "Status" --single-select-option "In progress" \
  --issue-number <ID>
```

### Agent 标记受阻

```bash
gh issue edit <ID> --add-label "agent/blocked,help wanted"
gh issue comment <ID> --body "⚠️ **Agent Blocked**: 缺少上下文"
```

### 任务完成

```bash
gh issue edit <ID> --remove-label "agent/wip" --add-label "status/done"
gh project item-edit --project-number $PJ_NUM \
  --field "Status" --single-select-option "Done" \
  --issue-number <ID>
```
