# 标签体系详解

## 类型标签 (Type) - 必选其一

_颜色建议：使用柔和色系区分_

| Label           | 含义     | 触发 Agent 行为            |
| --------------- | -------- | -------------------------- |
| `type/epic`     | 总任务   | 仅用于追踪，不直接编写代码 |
| `type/feat`     | 新功能   | 生成功能代码及对应测试     |
| `type/fix`      | Bug 修复 | 分析错误日志，修复逻辑     |
| `type/docs`     | 文档     | 更新 README 或 Wiki        |
| `type/refactor` | 重构     | 优化代码结构，不改变行为   |
| `type/test`     | 测试     | 补充单元测试或集成测试     |
| `type/chore`    | 杂项     | 依赖升级、配置修改         |

## 优先级标签 (Priority) - 辅助视图

_虽然 Project 中有字段，但 Label 可视化更强_

| Label         | 含义                         |
| ------------- | ---------------------------- |
| `priority/P0` | 紧急，阻碍主流程，最高优先级 |
| `priority/P1` | 高优，本周内完成             |
| `priority/P2` | 正常，按计划排期             |
| `priority/P3` | 低优，有空再做               |
| `priority/P4` | 可选，非必要功能             |

## Agent 协作标签 - 核心

_用于 Agent 之间的信号传递或请求人类介入_

| Label              | 含义             | 适用场景                     |
| ------------------ | ---------------- | ---------------------------- |
| `agent/wip`        | Agent 正在处理中 | 避免多 Agent 撞车            |
| `agent/blocked`    | Agent 受阻       | 缺少上下文或依赖未完成       |
| `help wanted`      | 需要人类介入     | Agent 无法决策或逻辑过于复杂 |
| `good first issue` | 适合 Agent 入门  | 上下文简单，独立性强         |

## 状态标签 (Status) - 可选

_用于与 Project 状态同步_

| Label                      | 含义     |
| -------------------------- | -------- |
| `status/triage`            | 待分拣   |
| `status/backlog`           | 积压     |
| `status/ready`             | 准备就绪 |
| `status/review`            | 评审中   |
| `status/approved`          | 已批准   |
| `status/changes-requested` | 需要修改 |
| `status/done`              | 已完成   |

## 组件/领域标签 (Area) - 可选

_用于限定上下文范围 (Context Window)_

- `area/frontend`: 前端相关
- `area/backend`: 后端相关
- `area/database`: 数据库/Schema 变更
- `area/api`: 接口定义
- `area/docs`: 文档相关
- `area/ci`: CI/CD 相关

## 标签组合示例

| 场景       | 标签组合                                   |
| ---------- | ------------------------------------------ |
| 新功能开发 | `type/feat`, `priority/P1`, `area/backend` |
| Bug 修复   | `type/fix`, `priority/P0`, `agent/wip`     |
| 文档更新   | `type/docs`, `priority/P2`                 |
| Agent 受阻 | `agent/blocked`, `help wanted`             |
