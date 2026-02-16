# 飞书预警设置中心 设计文档

## 目标

在飞书集成内新建 `/feishu/alerts` 预警设置页面，提供关键词规则管理、黑白名单管理、通知偏好和阈值配置的统一界面，替代当前硬编码的 signal-detector 规则和分散的黑名单页面。

## 架构

Tab 式单页面 (`/feishu/alerts`)，4 个标签页各对应一个功能区域。数据通过新增 `AlertRule` 和 `AlertSenderWhitelist` Prisma 模型持久化，通知/阈值配置复用现有 `Config` 表。`signal-detector` 启动时从数据库加载规则，替代硬编码数组。

## 技术栈

Next.js App Router + MUI + Prisma + PostgreSQL，遵循项目现有模式（session 验证 → Prisma 查询 → JSON 响应）。

---

## 数据模型

### 新增: `AlertRule`

```prisma
model AlertRule {
  id         String   @id @default(cuid())
  keyword    String                          // 触发关键词
  signalType String                          // RISK / BLOCKER / ESCALATION
  severity   String   @default("MEDIUM")     // CRITICAL / HIGH / MEDIUM / LOW
  isSystem   Boolean  @default(false)        // 系统预设 vs 用户自定义
  isEnabled  Boolean  @default(true)         // 启用/禁用
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([isEnabled])
  @@index([signalType])
}
```

### 新增: `AlertSenderWhitelist`

```prisma
model AlertSenderWhitelist {
  id         String   @id @default(cuid())
  senderId   String   @unique              // Feishu sender ID
  senderName String                        // 显示名称
  reason     String?                       // 白名单原因（如"机器人"）
  createdAt  DateTime @default(now())

  @@index([senderId])
}
```

### 修改: `FeishuChat`

新增字段:
```prisma
isWhitelisted   Boolean  @default(false)
whitelistedAt   DateTime?
```

### Config 表键值

| key | 默认值 | 说明 |
|-----|--------|------|
| `alert.minNotifySeverity` | `HIGH` | 最低通知等级 |
| `alert.notifyTargetChat` | (现有 feishu.chatId) | 通知目标群聊 |
| `alert.silentStart` | `22:00` | 静默开始时间 |
| `alert.silentEnd` | `08:00` | 静默结束时间 |
| `alert.cooldownMinutes` | `30` | 同群重复预警冷却（分钟） |
| `alert.batchIntervalMinutes` | `5` | 批量分析间隔（分钟） |

---

## 页面结构

### `/feishu/alerts` — 预警设置中心

顶部: 返回按钮 + "预警设置" 标题
Tab 栏: 关键词规则 | 黑白名单 | 通知设置 | 阈值设置

#### Tab 1: 关键词规则

- 列表展示所有规则，每行: 关键词 | 信号类型(Chip) | 严重等级(Chip) | 系统预设标记 | 启用开关 | 编辑/删除按钮
- 顶部 "添加规则" 按钮 → 弹出 Dialog: 关键词(TextField) + 类型(Select) + 等级(Select)
- 系统预设规则不可删除，仅可禁用
- 支持按信号类型筛选

#### Tab 2: 黑白名单

两个区域（Accordion 或子 Tab）:

**群聊名单:**
- 黑名单列表（从现有 blacklist 页面迁移）— 群名 + 拉黑时间 + 移除按钮
- 白名单列表 — 群名 + 添加时间 + 移除按钮
- "添加白名单" 按钮 → 从非黑名单群聊中选择

**发送人白名单:**
- 列表: 发送人名称 + ID + 原因 + 移除按钮
- "添加发送人" 按钮 → 搜索并选择发送人

#### Tab 3: 通知设置

表单布局:
- 最低通知等级: Select (CRITICAL / HIGH / MEDIUM / LOW)
- 通知目标群聊: 当前值显示 + 说明（从系统设置同步）
- 静默时段: 两个 TimePicker (开始 + 结束)

#### Tab 4: 阈值设置

表单布局:
- 重复预警冷却时间: NumberField + "分钟"
- 批量分析间隔: NumberField + "分钟"

---

## API 路由

### `GET/POST /api/feishu/alert-rules`
- GET: 获取所有规则，支持 `?type=RISK` 筛选
- POST: 创建新规则 `{ keyword, signalType, severity }`

### `PATCH/DELETE /api/feishu/alert-rules/[id]`
- PATCH: 更新规则 `{ keyword?, signalType?, severity?, isEnabled? }`
- DELETE: 删除规则（仅非系统预设）

### `GET/POST/DELETE /api/feishu/alert-whitelist`
- GET: 获取白名单 `?type=chat|sender`
- POST: 添加白名单 `{ type: 'chat'|'sender', id, name, reason? }`
- DELETE: 移除白名单 `{ type, id }`

### `GET/PUT /api/feishu/alert-config`
- GET: 获取所有 `alert.*` 配置
- PUT: 批量更新配置 `{ minNotifySeverity?, silentStart?, silentEnd?, cooldownMinutes?, batchIntervalMinutes? }`

---

## signal-detector 改造

现有 `RULES` 硬编码数组改为数据库加载:

```ts
let rules: SignalRule[] = [];

export async function loadRules() {
  const dbRules = await prisma.alertRule.findMany({ where: { isEnabled: true } });
  rules = dbRules.map(r => ({
    patterns: [r.keyword],
    type: r.signalType,
    severity: r.severity,
  }));
}
```

`detectSignals()` 新增检查:
1. 检查群聊是否在白名单 → 跳过
2. 检查发送人是否在白名单 → 跳过
3. 检查冷却时间 → 同群同类型信号在冷却期内不重复创建
4. 发送通知前检查静默时段和最低通知等级

---

## 入口与导航

1. `/feishu` 主页: 增加 "预警设置" 按钮（与现有 "对话列表"、"团队脉搏" 并列）
2. `/feishu/pulse`: 顶部增加 "预警设置" 入口链接
3. `/feishu/chats`: "黑名单管理" 按钮改为跳转 `/feishu/alerts?tab=blacklist`
4. `/feishu/blacklist`: 重定向到 `/feishu/alerts?tab=blacklist`（保持旧链接兼容）

---

## 数据迁移

创建 Prisma migration:
1. 新增 `AlertRule` 和 `AlertSenderWhitelist` 表
2. `FeishuChat` 新增 `isWhitelisted` 和 `whitelistedAt` 字段
3. 数据迁移 SQL: 将现有硬编码规则写入 `AlertRule` 表作为系统预设 (`isSystem: true`)

预设规则（对应当前 signal-detector.ts 中的 RULES）:

| keyword | signalType | severity | isSystem |
|---------|------------|----------|----------|
| CRITICAL | RISK | CRITICAL | true |
| 严重 | RISK | CRITICAL | true |
| 崩溃 | RISK | CRITICAL | true |
| 宕机 | RISK | CRITICAL | true |
| 故障 | RISK | CRITICAL | true |
| 事故 | RISK | CRITICAL | true |
| 报警 | RISK | HIGH | true |
| 异常 | RISK | HIGH | true |
| 风险 | RISK | HIGH | true |
| 警告 | RISK | HIGH | true |
| 告警 | RISK | HIGH | true |
| 延期 | BLOCKER | MEDIUM | true |
| 卡住 | BLOCKER | MEDIUM | true |
| 阻塞 | BLOCKER | MEDIUM | true |
| 等待审批 | BLOCKER | MEDIUM | true |
| 搞不定 | BLOCKER | MEDIUM | true |
| 无法推进 | BLOCKER | MEDIUM | true |
| 紧急 | ESCALATION | HIGH | true |
| 急需 | ESCALATION | HIGH | true |
| 尽快处理 | ESCALATION | HIGH | true |
| 升级处理 | ESCALATION | HIGH | true |
