# 实施规划模板

## 文档结构

```markdown
# 实施计划

## 项目结构

### 目录树
```
[完整目录结构]
```

### 模块依赖
```
core/
├── adapters/
└── infrastructure/
```

## 类型定义

```typescript
// 领域类型
interface User {
  id: string;
  name: string;
}

// API 类型
type CreateUserRequest = {
  name: string;
  email: string;
};
```

## 构建配置

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "strict": true
  }
}
```

### 构建脚本
```javascript
// 构建配置
```

## 测试策略

### 单元测试
- 框架: Vitest/Jest
- 目标: 80%+

### 集成测试
- 框架: Supertest
- 覆盖: API 端点

## 阶段规划

### 阶段 1: 基础
| 任务 | 工时 | 依赖 |
|------|------|------|
| 项目初始化 | 4h | 无 |
| 类型定义 | 8h | 初始化 |

### 阶段 2: 核心
...

## 文件规模估算

| 模块 | 预估 LOC |
|------|----------|
| core | 500 |
| adapters | 300 |
| ... | ... |
```

## 规划检查清单

### 代码结构
- [ ] 目录清晰
- [ ] 职责明确
- [ ] 依赖合理

### 类型系统
- [ ] 领域模型完整
- [ ] API 契约清晰
- [ ] 错误类型定义

### 测试覆盖
- [ ] 单元测试策略
- [ ] 集成测试策略
- [ ] E2E 测试策略
