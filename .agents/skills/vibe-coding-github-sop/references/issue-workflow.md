# Issue 工作流详解

## Epic 创建

大型功能或专项任务需要创建 Epic Issue 作为跟踪点。

```bash
gh issue create --title "[Epic] 任务名称" --body "## 任务描述内容" --label "type/epic"
```

## Sub-Issue 拆分原则

将总任务拆解为 Agent 可独立执行的原子任务：

1. **关联父 Issue**
   - 在 Body 中明确提及 `Part of #PARENT_ID`
   - 使用 `Ref #PARENT_ID` 在评论中引用

2. **设置基础元信息**
   - `Assignees`: 分配给 Agent 或 Maintainer
   - `Project`: 关联到 GitHub Project v2
   - `Milestone`: 关联到版本里程碑

3. **打上类型标签**
   - 根据任务性质选择 `type/*` 标签
   - 必须选一个类型标签

## Issue 模板示例

### 功能开发模板

```markdown
Part of #61

## 描述

实现基于 Email 的用户注册功能。

## 验收标准

- [ ] 校验邮箱格式
- [ ] 密码加密存储
- [ ] 发送验证邮件
- [ ] 错误处理

## 技术方案

- 使用 bcrypt 加密
- 使用 sendgrid 发送邮件

## 参考文档

- API 设计: `docs/api.md`
```

### Bug 修复模板

```markdown
Part of #42

## 问题描述

数据库连接偶发超时。

## 复现步骤

1. 启动应用
2. 等待 5 分钟
3. 执行查询

## 期望行为

正常返回结果

## 实际行为

连接超时错误

## 日志
```

[Error] Connection timeout

```

```

## 关联关系

```
Epic (#61)
├── Sub-Issue #63 (Phase 1)
├── Sub-Issue #64 (Phase 2)
└── Sub-Issue #65 (Phase 3)
    └── Implementation PR
```
