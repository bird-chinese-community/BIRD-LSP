# 状态对应关系表

## Project Status vs Issue Label

| 项目 Status     | 对应 Issue Label | 开发阶段 | Agent 行为准则               |
| --------------- | ---------------- | -------- | ---------------------------- |
| **To triage**   | `status/triage`  | 待分拣   | 等待 User 分类，Agent 不处理 |
| **Backlog**     | `status/backlog` | 积压     | 已进入队列，等待排期         |
| **Ready**       | `status/ready`   | 准备就绪 | **Agent 可领取 (Check out)** |
| **In progress** | `agent/wip`      | 开发中   | Agent 正在编码，其他人勿动   |
| **In review**   | `status/review`  | 评审中   | 等待 Review，Agent 监控 CI   |
| **Done**        | `status/done`    | 已完成   | 任务结束，上下文归档         |

## 状态流转

```
To triage
    ↓ (User 分类)
Backlog
    ↓ (排期完成)
Ready
    ↓ (Agent 领取)
In progress
    ↓ (开发完成，提交 PR)
In review
    ↓ (Review 通过)
Done
```

## 状态变更操作

### User 操作

| 操作       | 命令/步骤                                          |
| ---------- | -------------------------------------------------- |
| 分类 Issue | 修改 Status → Backlog/Ready                        |
| 分配任务   | 添加 Assignee，修改 Status → Ready                 |
| Review PR  | 添加评论，修改 Status → changes-requested/approved |
| 关闭任务   | 合并 PR，Status 自动变为 Done                      |

### Agent 操作

| 操作     | 命令/步骤                                                                    |
| -------- | ---------------------------------------------------------------------------- |
| 领取任务 | `gh issue edit <ID> --add-assignee "@me" --add-label "agent/wip"`            |
| 开始编码 | `gh project item-edit --field "Status" --single-select-option "In progress"` |
| 提交 PR  | `gh pr create ...`，自动修改 Status → "In review"                            |
| 标记受阻 | `gh issue edit <ID> --add-label "agent/blocked,help wanted"`                 |
| 完成任务 | 等待 Maintainer 合并                                                         |

## 状态与标签同步

建议保持 Status 字段与 Label 同步：

```bash
# 状态改变时同时更新标签
gh project item-edit --project-number $PJ_NUM \
  --field "Status" --single-select-option "In progress" \
  --issue-number <ID>
gh issue edit <ID> --add-label "agent/wip"
```

## 常见问题

**Q: Status 和 Label 有什么区别？**

A: Status 是 Project 字段，用于看板视图；Label 是 Issue 属性，用于过滤和搜索。两者应保持一致。

**Q: Agent 可以同时处理多个 In progress 任务吗？**

A: 不建议，避免上下文切换。同一时间只应有一个 `agent/wip` 任务。

**Q: 任务被 block 了怎么办？**

A: Agent 添加 `agent/blocked` 和 `help wanted` 标签，Maintainer 协助解决后改回 `Ready`。
