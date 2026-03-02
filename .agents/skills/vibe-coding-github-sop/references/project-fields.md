# Project 字段配置指南

## 创建 Project

推荐使用 `Bug tracker` 模板创建 GitHub Project v2。

## 必填字段

### 修改状态 (Status)

**类型**: Single select

**选项**:

- `To triage` - 待分拣
- `Backlog` - 积压
- `Ready` - 准备就绪
- `In progress` - 进行中
- `In review` - 评审中
- `Done` - 已完成

### 优先级 (Priority)

**类型**: Single select

**选项**:

- `P0` - 紧急，最高优先级
- `P1` - 高优，本周内完成
- `P2` - 正常，按计划排期
- `P3` - 低优，有空再做
- `P4` - 可选，非必要功能

**注意**: 模板默认只有 P0-P2，需手动添加 P3, P4

### 预估规模 (Size)

**类型**: Single select

**选项**:

- `XS` - 极简单 (< 1小时)
- `S` - 简单 (1-2小时)
- `M` - 中等 (2-4小时)
- `L` - 复杂 (4-8小时)
- `XL` - 很复杂 (1-2天)
- `XXL` - 非常复杂 (2-5天)
- `XXXL` - 极复杂 (> 1周)

**注意**: 模板默认只有 XS-XL，需手动添加 XXL, XXXL

## 可选字段

### 预估工时 (Estimate)

**类型**: Number

**单位**: 小时

用于精确估算工时。

### 实际工时 (Actual)

**类型**: Number

**单位**: 小时

用于记录实际花费时间，便于后续估算优化。

## 视图配置建议

### Board View (看板视图)

按 Status 分组：

- To triage
- Backlog
- Ready
- In progress
- In review
- Done

### Roadmap View (路线图视图)

按 Milestone 分组，显示时间线。

### Table View (表格视图)

显示所有字段，便于批量编辑。

## 自动化建议

### 建议的 Workflow

1. **Issue 创建时**
   - 自动设置为 `To triage`

2. **分配给 Agent 时**
   - 自动设置为 `Ready`

3. **PR 创建时**
   - 自动设置为 `In review`

4. **PR 合并时**
   - 自动设置为 `Done`
   - 自动关闭 Issue
