# 智能关键字引擎设计

> 日期: 2026-02-14
> 状态: 已批准

## 背景

当前洞察系统的话题关键字完全由用户手动填写，AI 只是被动执行搜索。核心问题：
1. 搜索质量依赖用户的关键字质量
2. 关键字不会随时间演化
3. 用户反馈（👍👎）存储了但不影响后续搜索

## 目标

让 AI 自主生成、演化、淘汰搜索关键字组合，通过用户反馈形成闭环学习。

## 核心概念

**KeywordCombo（关键字搭配）**：2-4 个关键字的组合，挂在话题下。AI 生成，用户通过对报告卡片的 👍/👎 间接评价搭配质量。

## 方案：关键字搭配池 + 反馈闭环

### 1. 数据模型

新增 `KeywordCombo` 表：

```prisma
model KeywordCombo {
  id         String   @id @default(cuid())
  topicId    String
  keywords   String[]    // ["AI芯片", "英伟达", "2026出货量"]
  score      Int      @default(50)    // 0-100
  status     String   @default("active") // active | retired | new
  usedCount  Int      @default(0)
  lastUsedAt DateTime?
  feedback   Int?        // 最近反馈: 1=👍, -1=👎
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  topic InsightTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)
  cards InsightCard[]

  @@index([topicId])
  @@index([status, score])
}
```

修改 `InsightCard`：新增 `comboId` 字段关联搭配。

### 2. 关键字生成引擎

**触发**：每晚 22:00 自动执行

**流程**：
1. 收集话题上下文：名称、active 搭配、被赞搭配（正面示例）、被踩搭配（负面示例）
2. LLM 生成 1-2 个新搭配（2-4 个关键字/组）
3. 存入 KeywordCombo（status='new', score=50）

**Prompt 策略**：
- 输入：话题名称 + 正面/负面示例
- 输出：新搭配，要求有时效性、新角度、不重复
- 负面示例告诉 AI "不要生成类似的"

### 3. 搭配选取策略

每个话题选 1-2 个搭配搜索：
- 优先 score 最高的 active 搭配
- 必须包含至少 1 个 status='new' 的搭配（保证新鲜度）
- 排除 retired 和最近 24h 已用过的

### 4. 反馈闭环

**👍 处理**：
- Card.feedback = 1
- combo.score += 10（上限 100）

**👎 处理**：
- Card.feedback = -1
- combo.status = 'retired'（直接废弃）

**话题权重联动**：
- 连续 3 个搭配被踩 → 话题 weight -10
- 搭配被赞 → 话题 weight +5（上限 100）
- 话题 weight < 20 时不再研究

**搭配池清理**：retired 搭配保留 30 天供 LLM 参考，之后删除。

### 5. 定时调度

使用 node-cron：

| 时间 | 任务 |
|------|------|
| 22:00 | 关键字生成：为每个 active 话题生成 1-2 个新搭配 |
| 22:05 | 简报研究：选取搭配 → Serper 搜索 → LLM 分析 → 生成卡片 |
| 22:15 | 简报编排：汇总卡片 → executive summary → status='ready' |

### 6. 代码改动范围

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 KeywordCombo，InsightCard 加 comboId |
| `lib/insights/keyword-engine.ts` | 新增：关键字生成引擎 |
| `lib/insights/scheduler.ts` | 新增：cron 调度器 |
| `lib/insights/researcher.ts` | 改造：接收 KeywordCombo 而非 Topic.keywords |
| `app/api/insights/briefing/generate/route.ts` | 改造：选搭配 → 搜索 → 关联 comboId |
| `app/api/insights/cards/[id]/feedback/route.ts` | 改造：反馈闭环逻辑 |
| `app/(dashboard)/insights/topics/page.tsx` | 改造：移除手动关键字输入，显示搭配池状态 |

### 7. 话题管理变化

- 创建话题只需名称，不再手动填关键字
- AI 自动生成初始搭配
- UI 显示搭配池概览（active/retired 数量）
