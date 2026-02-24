# 飞书对话 → 运营智能 (Team Pulse) 设计文档

## 目标

从已采集的飞书群聊消息中自动提取运营信号（风险、阻塞、升级、决策、待办、情绪），生成每日群聊摘要和团队脉搏仪表盘，帮助 COO 快速掌握团队运营状态。

## 核心价值

- **80%的运营信号埋在群聊中无人挖掘**，这是市场最大的空白
- 数据已有（FeishuMessage），只需加 AI 分析层
- 混合处理模式平衡成本和时效

## 架构

### 混合处理模式

```
实时层（feishu-listener 服务）        批量分析层（定时任务 8:30 AM）
─────────────────────────          ────────────────────────
每条消息 →                          按群聊聚合前24h消息 →
  signal-detector.ts:                chat-analyzer.ts:
  - 关键词模式匹配                    - LLM 深度分析
  - 匹配 → 创建 ChatSignal           - 提取 DECISION/ACTION/SENTIMENT
  - 高严重度 → 飞书通知COO            - 生成 ChatDigest（群聊摘要）
                                    - 计算 TeamPulse 指标
                                    - 推送每日运营脉搏到飞书
```

### 6类运营信号

| 类型 | 说明 | 处理层 | 告警 |
|------|------|-------|------|
| RISK | 项目/业务风险 | 实时 | 是 |
| BLOCKER | 进度被卡住 | 实时 | 是 |
| ESCALATION | 需要上级关注 | 实时 | 是 |
| DECISION | 已做出的决策 | 批量 | 否 |
| ACTION | 需要跟进的事 | 批量 | 否 |
| SENTIMENT | 团队情绪信号 | 批量 | 否 |

## 数据模型

### ChatSignal — 运营信号

```prisma
model ChatSignal {
  id          String   @id @default(cuid())
  chatId      String
  signalType  String                    // RISK/BLOCKER/ESCALATION/DECISION/ACTION/SENTIMENT
  severity    String   @default("MEDIUM") // LOW/MEDIUM/HIGH/CRITICAL
  title       String
  summary     String   @db.Text
  messageIds  String[]                  // 关联的消息ID
  relatedUser String?
  isResolved  Boolean  @default(false)
  resolvedAt  DateTime?
  source      String   @default("batch") // realtime / batch
  detectedAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  chat        FeishuChat @relation(fields: [chatId], references: [chatId])

  @@index([chatId])
  @@index([signalType])
  @@index([detectedAt])
  @@index([isResolved])
}
```

### ChatDigest — 每日群聊摘要

```prisma
model ChatDigest {
  id           String   @id @default(cuid())
  chatId       String
  date         DateTime @db.Date
  summary      String   @db.Text
  keyTopics    String[]
  messageCount Int
  activeUsers  String[]
  signalCount  Json?                    // {RISK:1, ACTION:2, ...}
  createdAt    DateTime @default(now())

  chat         FeishuChat @relation(fields: [chatId], references: [chatId])

  @@unique([chatId, date])
  @@index([date])
}
```

### TeamPulse — 团队活跃度/情绪

```prisma
model TeamPulse {
  id              String   @id @default(cuid())
  chatId          String
  date            DateTime @db.Date
  messageCount    Int      @default(0)
  activeUserCount Int      @default(0)
  sentimentScore  Float?                // -1 to 1
  avgResponseTime Float?                // 平均回复间隔（分钟）
  peakHour        Int?                  // 消息最多的小时
  createdAt       DateTime @default(now())

  chat            FeishuChat @relation(fields: [chatId], references: [chatId])

  @@unique([chatId, date])
  @@index([date])
}
```

## 实时层：信号检测器

### 位置

`services/feishu-listener/src/signal-detector.ts`

### 工作方式

每条消息存储后，调用 `detectSignals(message)`:
1. 遍历关键词规则表
2. 匹配命中 → 创建 ChatSignal (source=realtime)
3. 严重度 >= HIGH → 推送飞书通知给 COO

### 关键词规则

```typescript
const REALTIME_RULES = [
  { patterns: ['CRITICAL', '严重', '崩溃', '宕机', '故障'], type: 'RISK', severity: 'CRITICAL' },
  { patterns: ['报警', '异常', '风险', '警告'], type: 'RISK', severity: 'HIGH' },
  { patterns: ['延期', '卡住', '阻塞', '等待审批'], type: 'BLOCKER', severity: 'MEDIUM' },
  { patterns: ['紧急', '急需', '尽快处理'], type: 'ESCALATION', severity: 'HIGH' },
];
```

后续可将规则存入数据库（Config 或独立模型），支持在设置页动态配置。

## 批量分析层

### 触发时间

每天 8:30 AM（通过 scheduler 注册）

### 流程

1. 查询所有非黑名单群聊
2. 对每个群获取前24h的消息
3. 过滤掉消息数 < 3 的群（太少无需分析）
4. 将消息发送给 LLM (GPT-4o-mini)，Prompt 要求：
   - 生成群聊摘要（3-5句话）
   - 提取 DECISION / ACTION / SENTIMENT 信号
   - 每个信号：类型、标题、摘要、相关人员
5. 存储 ChatDigest 和 ChatSignal
6. 计算 TeamPulse 指标（纯数据聚合，不需LLM）
7. 推送"每日运营脉搏"到飞书

### LLM Prompt 设计

```
你是一个运营分析助手。以下是某工作群聊在过去24小时的对话记录。

请分析这些对话并提取以下信息：

1. 群聊摘要：用3-5句话总结今天的主要讨论内容
2. 关键话题：列出2-5个关键话题标签
3. 运营信号提取：
   - DECISION: 群里做出了哪些决策？
   - ACTION: 有哪些事项需要跟进/待办？
   - SENTIMENT: 从对话语气中感受到的团队情绪如何？

对话记录：
[消息列表]
```

## UI 设计

### 路由

`/feishu/pulse` — 飞书模块子页面

### 页面布局

```
┌────────────────────────────────────────────────┐
│  团队脉搏                    日期选择器  刷新   │
├──────────────────────┬─────────────────────────┤
│                      │                         │
│  信号流              │  群聊健康度             │
│  ┌──────────────┐   │  ┌──────┐ ┌──────┐     │
│  │ 🔴 RISK      │   │  │客诉群│ │PM群  │     │
│  │ 服务器报警..  │   │  │12条  │ │8条   │     │
│  │ 客诉监控群    │   │  │😊+0.3│ │😐-0.1│     │
│  │ 2h前         │   │  └──────┘ └──────┘     │
│  ├──────────────┤   │  ┌──────┐ ┌──────┐     │
│  │ 🟡 BLOCKER   │   │  │运营群│ │三人行│     │
│  │ 审批等待中..  │   │  │5条   │ │3条   │     │
│  │ EM运营群      │   │  │😊+0.5│ │😊+0.2│     │
│  │ 5h前         │   │  └──────┘ └──────┘     │
│  ├──────────────┤   │                         │
│  │ 🟢 DECISION  │   │  趋势图（7天）         │
│  │ 确认使用方案A │   │  📈 消息量/情绪/信号数  │
│  │ PM沟通群      │   │                         │
│  │ 昨天         │   │                         │
│  └──────────────┘   │                         │
│                      │                         │
│  [已处理] [全部]     │                         │
├──────────────────────┴─────────────────────────┤
│  今日摘要 — 客诉监控群                          │
│  "今日客诉邮件23封，主要集中在..."              │
│  关键话题: #丢失资源 #卡登陆 #服务器报警        │
└────────────────────────────────────────────────┘
```

### 功能

1. **信号流**：按时间倒序列出所有信号，可按类型/严重度筛选，支持标记"已处理"
2. **群聊健康度**：卡片式展示，显示消息数、情绪分、信号数
3. **趋势图**：7天消息量、情绪分、信号数趋势
4. **群聊摘要**：点击群聊卡片查看当日AI生成的摘要

## Phase 1 实现范围

1. Prisma 模型 (ChatSignal, ChatDigest, TeamPulse)
2. 实时信号检测器 (signal-detector.ts in feishu-listener)
3. 批量分析器 (chat-analyzer.ts) + 定时任务
4. API 路由 (信号CRUD, 摘要查询, 脉搏数据)
5. UI 仪表盘 (/feishu/pulse)
6. 飞书通知推送（紧急信号 + 每日脉搏）

## 后续扩展

- 信号关键词规则可在设置页配置
- 信号 → 自动创建任务
- 跨群聊关联分析（同一问题在多个群被讨论）
- 人员维度分析（某人在哪些群活跃、负责哪些信号）
