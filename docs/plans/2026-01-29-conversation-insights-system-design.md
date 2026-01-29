# 对话洞察系统 - 详细设计文档

**创建日期:** 2026-01-29
**项目:** POA Master - 对话文本结构化提取模块
**目标:** 将负责人对话文本自动提炼为 6 维度结构化条目，支持审核、管理和推送到 ToDo 系统

---

## 目录

1. [背景与目标](#背景与目标)
2. [整体架构](#整体架构)
3. [数据库设计](#数据库设计)
4. [核心业务逻辑](#核心业务逻辑)
5. [API 设计](#api-设计)
6. [前端组件设计](#前端组件设计)
7. [实施计划](#实施计划)
8. [风险与对策](#风险与对策)
9. [验收标准](#验收标准)

---

## 背景与目标

### 问题陈述

COO 与各负责人对话后获得转写文本（txt/pdf/word），存在以下痛点：
- 信息散落在长文本中，复盘成本高
- 容易遗漏"需要拍板/需要介入"的关键事项
- 负责人画像缺乏结构化沉淀，历史信息难维护
- 行动项无法快速进入执行系统（自研 ToDo）

### 产品目标（V1）

1. **快速结构化：** 上传文本 → 自动按固定 6 维度提炼条目
2. **可控入库：** 必须经过审核确认后才写入数据库
3. **持续可维护：** 管理界面可长期编辑条目（增删改/移动维度）
4. **可执行：** 行动项支持一键推送到自研 ToDo

### 成功标准

- 审核成本下降：从读全文变为"看条目 + 少量编辑"
- 拍板/介入事项漏掉频率下降
- 行动项进入 ToDo 的转化率提升

---

## 整体架构

### 系统分层

```
┌─────────────────────────────────────────────────┐
│           展示层 (Presentation Layer)            │
│  - 负责人列表页（卡片上传入口）                    │
│  - 负责人详情页（完整上传界面）                    │
│  - 审核页（左右对照）                              │
│  - 洞察管理页（历史条目维护）                      │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│               API 层 (API Routes)                │
│  /api/insights/upload                           │
│  /api/insights/extract                          │
│  /api/insights/dedupe                           │
│  /api/insights/confirm                          │
│  /api/insights/smart-check                      │
│  /api/insights/push-to-todo                     │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│          业务逻辑层 (Business Logic)              │
│  - FileParser: 文件解析（txt/docx/pdf）          │
│  - InsightsExtractor: LLM 提取（混合策略）        │
│  - InsightsDeduplicator: 语义去重                │
│  - SmartAnalyzer: 智能检测重复/过时               │
│  - TodoPusher: ToDo 集成                         │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│             数据层 (Data Layer)                  │
│  Prisma Models:                                 │
│  - Artifact (上传文件元信息)                      │
│  - DraftItem (草稿条目)                          │
│  - ConfirmedItem (确认入库条目)                   │
└─────────────────────────────────────────────────┘
```

### 端到端数据流

```
用户上传文件
  ↓
POST /api/insights/upload
  → FileParser 解析文本
  → 创建 Artifact (status: parsing)
  ↓
POST /api/insights/extract
  → InsightsExtractor 判断文本长度
    - 短文本（<5000字）：单次 LLM 调用
    - 长文本（>5000字）：分段提取 + 汇总
  → 生成 6 维度 DraftItem[]
  ↓
POST /api/insights/dedupe
  → InsightsDeduplicator 同维度语义去重
  → 更新 DraftItem（合并相似条目）
  → Artifact.status = 'ready'
  ↓
跳转到审核页
  → 左侧：ConfirmedItem (Existing)
  → 右侧：DraftItem (Draft)
  → 拍板事项置顶高亮
  ↓
用户审核编辑/勾选推送
  ↓
POST /api/insights/confirm
  → DraftItem → ConfirmedItem（增量追加）
  → 勾选项 → POST /api/insights/push-to-todo
  → 清理 Draft 数据
  ↓
跳转回负责人详情页
```

---

## 数据库设计

### Prisma Schema

```prisma
// ========== 对话洞察相关模型 ==========

// Artifact: 一次上传的对话文件
model Artifact {
  id           String   @id @default(cuid())
  assigneeId   String

  // 文件信息
  fileName     String
  fileType     String   // txt/docx/pdf
  filePath     String   // 存储路径
  charCount    Int
  pageCount    Int?     // PDF 页数

  // 处理状态
  status       String   @default("uploading")
  // uploading/parsing/extracting/deduping/ready/confirmed/failed
  errorMessage String?

  // LLM 提取信息
  modelName    String?  // gpt-4o
  promptVersion String? // 用于追溯不同 prompt 版本
  latencyMs    Int?     // 处理耗时

  // 时间戳
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // 关系
  assignee         Assignee @relation(fields: [assigneeId], references: [id], onDelete: Cascade)
  draftItems       DraftItem[]
  confirmedItems   ConfirmedItem[]

  @@index([assigneeId])
  @@index([status])
  @@index([createdAt])
}

// DraftItem: 提取后的草稿条目（审核阶段）
model DraftItem {
  id           String   @id @default(cuid())
  artifactId   String

  // 维度信息
  dimension    String   // focus/goal/obstacle/decision/risk/action
  sortOrder    Int      // 同维度内排序

  // 条目内容
  content      String   @db.Text
  evidence     String?  @db.Text  // 证据句子（仅 Draft 保留，入库后删除）

  // 拍板维度专属字段
  decisionType String?  // must_decide/need_intervene（仅 decision 维度）

  // 行动项维度专属字段
  action       String?  @db.Text  // 行动项描述（仅 action 维度）
  etaText      String?  // ETA 原文（仅 action 维度）

  // 编辑追踪
  isEdited     Boolean  @default(false)
  isDeleted    Boolean  @default(false)
  movedFrom    String?  // 原始维度（如果被移动）

  // 去重元信息
  mergedFrom   Json?    // 被合并的条目ID列表 [id1, id2]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // 关系
  artifact     Artifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([artifactId])
  @@index([dimension])
}

// ConfirmedItem: 确认入库的条目（长期维护）
model ConfirmedItem {
  id           String   @id @default(cuid())
  assigneeId   String
  artifactId   String   // 来源追溯

  // 维度信息
  dimension    String
  sortOrder    Int

  // 条目内容（与 DraftItem 类似，但无 evidence）
  content      String   @db.Text
  decisionType String?
  action       String?  @db.Text
  etaText      String?

  // 状态管理
  status       String   @default("active") // active/completed/archived

  // 智能分析标记
  smartFlags   Json?
  // { isDuplicate: bool, isOutdated: bool, relatedIds: [], confidence: float }

  // ToDo 推送信息
  pushedToTodo Boolean  @default(false)
  todoTaskId   String?  // 关联的 ToDo 任务 ID
  pushError    String?  // 推送失败原因

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // 关系
  assignee     Assignee @relation(fields: [assigneeId], references: [id], onDelete: Cascade)
  artifact     Artifact @relation(fields: [artifactId], references: [id])

  @@index([assigneeId])
  @@index([dimension])
  @@index([status])
  @@index([createdAt])
  @@index([pushedToTodo])
}
```

### 关键设计决策

1. **三表分离：** Artifact 记录元信息，DraftItem 临时草稿，ConfirmedItem 长期存储
2. **证据仅 Draft 保留：** 入库后删除 evidence 字段，节省存储
3. **smartFlags JSON：** 灵活扩展智能分析标记
4. **增量追加：** 旧条目不覆盖，新条目追加

### 维度枚举

```typescript
export const DIMENSIONS = {
  FOCUS: 'focus',           // 负责人的关注点
  GOAL: 'goal',             // 负责人的目标
  OBSTACLE: 'obstacle',     // 负责人困扰
  DECISION: 'decision',     // 本次需要我拍板的事情
  RISK: 'risk',             // 负责人感觉到的风险
  ACTION: 'action',         // 负责人的行动项和 ETA
} as const;

export const DECISION_TYPES = {
  MUST_DECIDE: 'must_decide',       // 必须拍板
  NEED_INTERVENE: 'need_intervene', // 需要介入
} as const;
```

---

## 核心业务逻辑

### 1. 文件解析器 (FileParser)

**职责：** 将 txt/docx/pdf 转换为纯文本

**支持格式：**
- `.txt` - 直接读取
- `.docx` - 使用 mammoth 库
- `.pdf` - 使用现有 pdf-parse 库

**输出：**
```typescript
interface ParseResult {
  text: string;
  charCount: number;
  pageCount?: number;
  metadata: { fileType: string; fileName: string; }
}
```

### 2. LLM 提取引擎 (InsightsExtractor)

**职责：** 混合策略提取 - 短文本单次调用，长文本分段处理

**策略选择：**
- 文本 ≤ 5000 字：单次 LLM 调用
- 文本 > 5000 字：分段（3000字/段）→ 并发提取 → LLM 汇总合并

**System Prompt 核心要求：**
```
你是资深 COO 助手，从对话记录中提取关键信息。

## 6 个维度：
1. focus - 负责人的关注点
2. goal - 负责人的目标
3. obstacle - 负责人困扰
4. decision - 本次需要我拍板的事情（含 must_decide/need_intervene 两档）
5. risk - 负责人感觉到的风险
6. action - 负责人的行动项和 ETA

## 输出格式：JSON
{
  "focus": [{ "content": "...", "evidence": "原文句子" }],
  "decision": [{
    "content": "...",
    "evidence": "...",
    "decisionType": "must_decide" 或 "need_intervene"
  }],
  "action": [{
    "action": "行动项描述",
    "etaText": "ETA 原文",
    "evidence": "原文句子"
  }],
  ...
}

## 重要原则：
- 条目简洁清晰，避免冗长背景描述
- 同一维度内不要输出语义重复的条目
- evidence 必须是原文中的一句话
```

**模型配置：**
- Model: `gpt-4o`
- Temperature: `0.3`
- Response Format: `json_object`

### 3. 语义去重引擎 (InsightsDeduplicator)

**职责：** 同次上传内部的语义去重，确保同维度条目不重复

**算法流程：**
```
1. 按维度分组
2. 对每个维度内的条目：
   a. 使用 OpenAI text-embedding-3-small 获取 Embeddings
   b. 计算 Cosine Similarity
   c. 相似度 ≥ 0.85 的条目聚类
   d. 每个聚类用 LLM 合并为一条代表条目
3. 记录 mergedFrom 元信息
```

**关键参数：**
- 相似度阈值：`0.85`（保守策略）
- 仅同维度内去重
- 合并后保留所有原始证据（用 ` | ` 连接）

### 4. 智能分析器 (SmartAnalyzer)

**职责：** 检测历史条目中的重复和过时内容

**检测逻辑：**

**重复检测：**
- 使用 Embedding 计算条目间相似度
- 相似度 ≥ 0.90 标记为疑似重复
- 记录 relatedIds

**过时检测：**
- 规则：创建时间 > 90 天
- 进一步用 LLM 判断内容是否过时
- 返回置信度 0-1

**输出格式：**
```typescript
interface SmartFlags {
  isDuplicate: boolean;
  isOutdated: boolean;
  relatedIds: string[];
  confidence: number;  // 0-1
  reason: string;
  checkedAt: string;
}
```

### 5. ToDo 推送器 (TodoPusher)

**职责：** 将行动项批量推送到自研 ToDo 系统

**推送内容：**
```typescript
{
  title: `[${负责人名}] ${行动项}`,
  description: `
    **ETA:** ${etaText}
    **来源:** 负责人对话洞察 (${日期})
    **条目ID:** ${itemId}
  `,
  status: 'pending',
  assignee: 负责人名
}
```

**错误处理：**
- 成功：记录 `todoTaskId`
- 失败：记录 `pushError`，支持重试

---

## API 设计

### 1. POST /api/insights/upload

上传文件并创建 Artifact

**请求：**
```typescript
FormData {
  file: File,
  assigneeId: string
}
```

**响应：**
```json
{ "artifactId": "clxxx" }
```

**流程：**
1. 验证文件类型（txt/docx/pdf）
2. 保存文件到私有存储
3. 创建 Artifact（status: parsing）
4. 异步触发解析

---

### 2. POST /api/insights/extract

解析文件并提取条目

**请求：**
```json
{ "artifactId": "clxxx" }
```

**流程：**
1. FileParser 解析文本
2. InsightsExtractor 提取（混合策略）
3. 创建 DraftItems
4. 更新 Artifact（modelName, latencyMs）
5. 触发去重

---

### 3. POST /api/insights/dedupe

同次语义去重

**请求：**
```json
{ "artifactId": "clxxx" }
```

**响应：**
```json
{ "success": true, "mergeCount": 3 }
```

**流程：**
1. 获取所有 DraftItems
2. InsightsDeduplicator 去重
3. 删除被合并的条目
4. 更新保留条目的 mergedFrom
5. Artifact.status = 'ready'

---

### 4. POST /api/insights/confirm

确认入库并推送

**请求：**
```json
{
  "artifactId": "clxxx",
  "draftItems": [...],        // 编辑后的 draft items
  "pushToTodoIds": ["id1", "id2"]  // 勾选的行动项
}
```

**流程（事务）：**
1. 创建 ConfirmedItems（证据不保存）
2. 删除 DraftItems
3. 更新 Artifact.status = 'confirmed'
4. （事务外）推送到 ToDo

---

### 5. POST /api/insights/smart-check

智能检测重复/过时

**请求：**
```json
{ "assigneeId": "clxxx" }
```

**响应：**
```json
{
  "checkedCount": 50,
  "flaggedCount": 8
}
```

**流程：**
1. 获取该负责人所有活跃条目
2. SmartAnalyzer 检测
3. 更新 smartFlags

---

### 6. POST /api/insights/push-to-todo

批量推送到 ToDo

**请求：**
```json
{ "itemIds": ["id1", "id2"] }
```

**响应：**
```json
{
  "successCount": 2,
  "failedCount": 0,
  "details": [
    { "itemId": "id1", "success": true, "todoTaskId": "todo1" },
    { "itemId": "id2", "success": true, "todoTaskId": "todo2" }
  ]
}
```

---

## 前端组件设计

### 页面路由结构

```
app/(dashboard)/assignees/
├── page.tsx                              # 负责人列表（卡片上传入口）
├── [id]/
│   ├── page.tsx                          # 负责人详情（完整上传界面）
│   └── insights/
│       ├── page.tsx                      # 洞察管理页
│       └── review/[artifactId]/page.tsx  # 审核页（核心）
```

### 核心组件：审核页（左右对照）

**布局：**
```
┌────────────────────────────────────────────────────┐
│  顶部工具栏：文件信息 | [确认入库] [放弃草稿]        │
├─────────────────────┬──────────────────────────────┤
│  左侧：Existing     │  右侧：Draft                  │
│                     │                              │
│  ▼ 拍板事项 (3)     │  ▼ 拍板事项 (2) 🔴           │
│    • 条目1          │    🔴 必须拍板               │
│    • 条目2          │      • 新条目1 [编辑][删除]  │
│                     │    🟡 需要介入               │
│  ▼ 关注点 (5)       │      • 新条目2 [查看证据]    │
│    • ...            │                              │
│                     │  ▼ 行动项 (3)                │
│                     │    ☑ 推送到 ToDo              │
│                     │      📋 行动项1               │
│                     │      ⏰ ETA: 下周五前         │
└─────────────────────┴──────────────────────────────┘
```

**关键交互：**
1. **拍板事项置顶 + 高亮：**
   - 🔴 必须拍板（红色）
   - 🟡 需要介入（黄色）
   - 可切换类型（ToggleButtonGroup）

2. **条目编辑：**
   - 双击内联编辑
   - 支持删除、新增、移动维度

3. **证据展示：**
   - 点击"查看证据"展开 Alert
   - 仅 Draft 可见

4. **推送勾选：**
   - 仅行动项维度显示 Checkbox
   - 勾选后一键批量推送

### 洞察管理页

**功能：**
- 搜索条目（关键词）
- 过滤（维度、状态）
- 智能检测按钮
- 条目状态管理（active/completed/archived）

**智能标记展示：**
```
⚠️ 警告框：
   疑似与历史条目重复 - 创建于 120 天前，目标已达成
   [查看重复项] [归档]
```

---

## 实施计划

### Phase 1: 核心基础（2-3 周）

**Week 1-2:**
- [ ] 数据库 migration（Artifact/DraftItem/ConfirmedItem）
- [ ] FileParser 实现（txt/docx/pdf）
- [ ] InsightsExtractor 单次策略
- [ ] 上传 API + 提取 API

**Week 3:**
- [ ] 审核页 UI（左右对照布局）
- [ ] DimensionList 组件
- [ ] ItemCard 组件（含编辑/删除）
- [ ] 确认入库 API

### Phase 2: 增强功能（1-2 周）

**Week 4:**
- [ ] InsightsDeduplicator（Embedding + 去重）
- [ ] InsightsExtractor 长文本分段策略
- [ ] 去重 API

**Week 5:**
- [ ] TodoPusher 实现
- [ ] 推送 API
- [ ] 洞察管理页 UI（搜索/过滤）

### Phase 3: 智能分析（1-2 周）

**Week 6:**
- [ ] SmartAnalyzer 重复检测
- [ ] SmartAnalyzer 过时检测
- [ ] 智能检测 API

**Week 7:**
- [ ] 管理页智能标记展示
- [ ] 归档功能
- [ ] 状态管理

### Phase 4: 优化迭代（持续）

- [ ] Prompt 调优
- [ ] UI/UX 优化
- [ ] 性能优化（Embedding 缓存）
- [ ] 埋点数据分析

---

## 风险与对策

| 风险 | 影响 | 对策 |
|-----|------|-----|
| **LLM 提取质量不稳定** | 条目不准确，影响使用体验 | • Prompt 迭代优化<br>• 人工审核环节兜底<br>• 记录 promptVersion 便于 A/B 测试 |
| **同次去重误伤** | 信息损失，重要条目被合并 | • 保守阈值（0.85）<br>• 仅同维度去重<br>• 保留 mergedFrom 可追溯 |
| **智能分析误报** | 误标记导致误归档 | • 仅标记提示，不自动操作<br>• 展示置信度<br>• 用户最终决策 |
| **推送 ToDo 失败** | 行动项丢失，执行中断 | • 记录 pushError<br>• 支持重试<br>• 推送在事务外，不影响入库 |
| **长文本处理超时** | 用户体验差 | • 分段处理<br>• 进度提示（Server-Sent Events）<br>• 超长文本提示拆分上传 |
| **历史条目膨胀** | 界面混乱，查找困难 | • 搜索/过滤功能<br>• 智能提示清理<br>• 状态管理（active/archived） |

---

## 验收标准

### 核心用例

**用例 1：快速上传**
- ✅ 从负责人卡片点击"上传对话"
- ✅ 上传 3000 字 txt 文件
- ✅ 30 秒内完成解析和提取
- ✅ 跳转到审核页展示 6 维度条目

**用例 2：审核编辑**
- ✅ 审核页左右对照显示历史和新条目
- ✅ 拍板事项置顶且高亮区分两档
- ✅ 可编辑、删除、新增、移动维度
- ✅ 证据可展开查看

**用例 3：批量推送**
- ✅ 勾选 3 个行动项
- ✅ 点击确认入库
- ✅ 成功推送到 ToDo 系统
- ✅ ToDo 任务标题包含负责人名和行动描述

**用例 4：智能管理**
- ✅ 在管理页点击"智能检测"
- ✅ 系统标记 2 条疑似重复的条目
- ✅ 展示相关条目链接
- ✅ 可一键归档

**用例 5：语义去重**
- ✅ 上传包含 10 条类似"产品迭代速度慢"的对话
- ✅ 系统自动合并为 1-2 条代表条目
- ✅ mergedFrom 记录被合并的 ID

### 质量指标（3 个月后评估）

1. **使用频率：** 每周至少使用 3 次
2. **审核效率：** 从"读全文 20 分钟"降到"审核条目 5 分钟"
3. **拍板事项捕获：** 0 次漏掉重要决策点（主观评估）
4. **ToDo 推送率：** 行动项推送率 > 80%
5. **条目质量：** LLM 提取准确率 > 85%（人工抽样）

---

## 技术栈与依赖

### 新增依赖

```json
{
  "dependencies": {
    "mammoth": "^1.6.0"  // Word 文档解析
  }
}
```

### OpenAI API 使用量估算

- **提取：** 每次对话 ~5000 tokens（短文本）/ ~15000 tokens（长文本）
- **去重：** 每次 ~2000 tokens（Embedding + 合并）
- **智能分析：** 每个条目 ~1000 tokens
- **月度成本估算：** 假设每天 3-5 次对话，约 $20-50

### 性能优化建议

1. **Embedding 缓存：** 对已计算的 Embedding 缓存到数据库
2. **分页加载：** 洞察管理页使用虚拟滚动
3. **异步处理：** 文件解析和提取使用后台队列（可选）
4. **索引优化：** 已在 Prisma schema 中标注

---

## 数据安全与隐私

1. **文件存储：** 上传文件存储在私有目录，仅服务端可访问
2. **敏感数据：** 证据句子仅审核阶段可见，入库后删除
3. **审计日志：** Artifact 表保留所有上传记录，可追溯
4. **访问控制：** 当前单用户，未来可扩展为 RBAC

---

## 附录：关键决策总结

### 设计原则

1. **三表分离架构** - 职责清晰，易于维护和审计
2. **混合提取策略** - 兼顾效果和成本
3. **保守去重策略** - 高阈值 + 人工审核，避免信息损失
4. **智能标记而非自动操作** - AI 辅助，人工决策
5. **增量追加而非覆盖** - 历史条目永久保留

### 技术亮点

- **OpenAI Embeddings** 实现语义去重和重复检测
- **左右对照 UI** 提供直观的新旧条目对比
- **拍板事项置顶 + 双档高亮** 聚焦决策优先级
- **证据句子审核阶段可见** 平衡透明度与存储

---

**文档版本:** 1.0
**最后更新:** 2026-01-29
**下一步:** 开始 Phase 1 实施
