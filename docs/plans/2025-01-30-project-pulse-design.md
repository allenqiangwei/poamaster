# Project Pulse V1.0 设计文档

> 周报/日报 PDF 智能分析与项目状态条目库

## 1. 概述

### 1.1 产品定位
COO 快速掌握多项目状态的工具。上传周报/日报 PDF，AI 自动提取 12 维度结构化条目，用户审核后入库，形成可维护的项目状态库。

### 1.2 核心原则
1. **只有入库内容算官方状态** - 主页只展示数据库条目，不展示未入库分析结果
2. **条目型管理** - 以条目粒度入库，而非整份快照
3. **用户是唯一闸门** - 只有用户能上传、分析并决定入库
4. **无生命周期** - 条目不维护 Open/Closed，不再适用时直接删除
5. **数据安全优先** - 证据追加保留历史，删除可撤销

### 1.3 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 更新策略 | 证据追加 | 保留历史，不丢失数据 |
| 与 Insights 关系 | 完全独立 | 独立演进，复用底层工具 |
| 去重匹配 | 关键词 + Embedding 混合 | 兼顾精确匹配和语义相似 |
| 删除机制 | 软删除 + 5秒撤销 | 防止误删 |

---

## 2. 数据模型

### 2.1 Prisma Schema

```prisma
// 报告类型
enum ReportType {
  DAILY
  WEEKLY
  OTHER
}

// 解析状态
enum ParseStatus {
  PENDING
  SUCCESS
  FAILED
}

// 分析会话状态
enum SessionStatus {
  PENDING
  COMPLETED
  FAILED
}

// 12 维度枚举
enum EntryDimension {
  OVERALL_HEALTH      // 总体健康度
  SCHEDULE            // 进度与里程碑
  SCOPE               // 交付物与范围变化
  RISKS               // 风险
  BLOCKERS            // 问题与阻塞
  DEPENDENCIES        // 依赖与外部协作
  QUALITY             // 质量与稳定性
  RESOURCING          // 资源与产能
  DECISIONS           // 决策与需要支持
  KPI                 // 目标指标与结果
  PLAN_CREDIBILITY    // 计划可信度
  ALIGNMENT           // 沟通与对齐风险
}

// 项目
model PulseProject {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  reports   PulseReport[]
  entries   PulseEntry[]

  @@index([updatedAt])
}

// 上传的报告
model PulseReport {
  id          String      @id @default(cuid())
  projectId   String
  project     PulseProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  fileName    String
  filePath    String
  reportType  ReportType
  reportDate  DateTime
  parsedText  String?     @db.Text
  parseStatus ParseStatus @default(PENDING)
  parseError  String?

  uploadedAt  DateTime    @default(now())
  sessions    PulseAnalysisSession[]

  @@index([projectId])
}

// 分析会话
model PulseAnalysisSession {
  id          String        @id @default(cuid())
  reportId    String
  report      PulseReport   @relation(fields: [reportId], references: [id], onDelete: Cascade)

  aiOutputRaw Json
  status      SessionStatus @default(PENDING)
  createdAt   DateTime      @default(now())

  @@index([reportId])
}

// 条目
model PulseEntry {
  id              String         @id @default(cuid())
  projectId       String
  project         PulseProject   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  dimension       EntryDimension
  title           String
  evidenceCurrent String         @db.Text
  sourceCurrent   Json           // {reportType, reportDate, fileName, page?}
  evidenceHistory Json[]         // [{evidence, source, addedAt}]
  embedding       Float[]        // 1536 维向量

  deletedAt       DateTime?      // 软删除
  deleteToken     String?        // 撤销令牌

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([projectId, dimension])
  @@index([deletedAt])
}
```

### 2.2 类型定义

```typescript
// lib/pulse/types.ts

export interface Source {
  reportType: 'DAILY' | 'WEEKLY' | 'OTHER';
  reportDate: string;  // ISO 8601
  fileName: string;
  page?: number;
}

export interface EvidenceHistoryItem {
  evidence: string;
  source: Source;
  addedAt: string;  // ISO 8601
}

export interface AICandidate {
  dimension: string;
  title: string;
  evidence_quote: string;
  confidence: number;
}

export interface AIExtractionResult {
  candidates: AICandidate[];
  empty_dimensions: string[];
  warnings: string[];
}
```

---

## 3. 12 维度定义

```typescript
// lib/pulse/constants.ts

export const ENTRY_DIMENSIONS = {
  OVERALL_HEALTH: 'OVERALL_HEALTH',
  SCHEDULE: 'SCHEDULE',
  SCOPE: 'SCOPE',
  RISKS: 'RISKS',
  BLOCKERS: 'BLOCKERS',
  DEPENDENCIES: 'DEPENDENCIES',
  QUALITY: 'QUALITY',
  RESOURCING: 'RESOURCING',
  DECISIONS: 'DECISIONS',
  KPI: 'KPI',
  PLAN_CREDIBILITY: 'PLAN_CREDIBILITY',
  ALIGNMENT: 'ALIGNMENT',
} as const;

export const DIMENSION_LABELS: Record<string, string> = {
  OVERALL_HEALTH: '总体健康度',
  SCHEDULE: '进度与里程碑',
  SCOPE: '交付物与范围',
  RISKS: '风险',
  BLOCKERS: '问题与阻塞',
  DEPENDENCIES: '依赖与外部协作',
  QUALITY: '质量与稳定性',
  RESOURCING: '资源与产能',
  DECISIONS: '决策与需要支持',
  KPI: '目标指标与结果',
  PLAN_CREDIBILITY: '计划可信度',
  ALIGNMENT: '沟通与对齐风险',
};

// 显示顺序（关键维度优先）
export const DIMENSION_ORDER = [
  'RISKS',
  'BLOCKERS',
  'DECISIONS',
  'SCHEDULE',
  'SCOPE',
  'DEPENDENCIES',
  'QUALITY',
  'RESOURCING',
  'KPI',
  'OVERALL_HEALTH',
  'PLAN_CREDIBILITY',
  'ALIGNMENT',
];
```

---

## 4. API 结构

### 4.1 路由概览

```
/api/pulse/
  projects/
    route.ts              GET 列表, POST 创建
    [id]/route.ts         GET 详情, PATCH 更新, DELETE 删除
    [id]/stats/route.ts   GET 条目统计

  reports/
    upload/route.ts       POST 上传 PDF
    [id]/route.ts         GET 报告详情

  analysis/
    extract/route.ts      POST 触发 AI 提取
    [sessionId]/route.ts  GET 分析结果

  entries/
    route.ts              GET 列表, POST 创建
    [id]/route.ts         GET, PATCH, DELETE
    [id]/undo/route.ts    POST 撤销删除
    similar/route.ts      POST 查找相似条目
    batch/route.ts        POST 批量入库
```

### 4.2 关键 API 定义

#### POST /api/pulse/projects
```typescript
// Request
{ name: string }

// Response 201
{
  success: true,
  data: { id, name, createdAt, updatedAt }
}
```

#### POST /api/pulse/reports/upload
```typescript
// Request (multipart/form-data)
{
  file: File,           // PDF
  projectId: string,
  reportType: 'DAILY' | 'WEEKLY' | 'OTHER',
  reportDate: string    // ISO 8601
}

// Response 201
{
  success: true,
  data: { id, fileName, parseStatus, parsedText? }
}
```

#### POST /api/pulse/analysis/extract
```typescript
// Request
{ reportId: string }

// Response 201
{
  success: true,
  data: {
    sessionId: string,
    candidates: AICandidate[],
    empty_dimensions: string[],
    warnings: string[]
  }
}
```

#### POST /api/pulse/entries/similar
```typescript
// Request
{
  projectId: string,
  dimension: string,
  title: string,
  evidence: string
}

// Response 200
{
  success: true,
  data: Array<{
    entryId: string,
    title: string,
    evidenceCurrent: string,
    sourceCurrent: Source,
    score: number,
    keywordScore: number,
    embeddingScore: number
  }>
}
```

#### POST /api/pulse/entries/batch
```typescript
// Request
{
  projectId: string,
  sessionId: string,
  operations: Array<{
    action: 'create' | 'update' | 'ignore',
    targetEntryId?: string,
    dimension: string,
    title: string,
    evidence: string,
    source: Source
  }>
}

// Response 200
{
  success: true,
  data: {
    created: number,
    updated: number,
    ignored: number,
    projectUpdatedAt: string
  }
}
```

#### DELETE /api/pulse/entries/[id]
```typescript
// Response 200
{
  success: true,
  data: {
    undoToken: string,
    undoExpiresIn: 5000
  }
}
```

#### POST /api/pulse/entries/[id]/undo
```typescript
// Request
{ undoToken: string }

// Response 200
{ success: true }

// Response 400 (过期或无效)
{ success: false, error: '撤销已过期' }
```

---

## 5. 页面结构

### 5.1 路由规划

```
/app/(dashboard)/
  page.tsx                    # 首页 - 添加"项目管理"卡片

  pulse/
    page.tsx                  # 项目列表
    new/page.tsx              # 创建项目
    [projectId]/
      page.tsx                # 项目详情（条目库）
      upload/page.tsx         # 上传 PDF
      review/[sessionId]/
        page.tsx              # 分析结果审核
      entries/
        new/page.tsx          # 手动新增条目
        [entryId]/page.tsx    # 编辑条目
```

### 5.2 首页卡片

```tsx
<Card>
  <CardContent>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
      <FolderKanban size={24} style={{ marginRight: 8 }} />
      <Typography variant="h5">项目管理</Typography>
    </Box>
    <Typography variant="body2" color="text.secondary">
      上传周报/日报 PDF，AI 自动提取 12 维度项目状态条目
    </Typography>
  </CardContent>
  <CardActions>
    <Button onClick={() => router.push('/pulse')}>进入</Button>
  </CardActions>
</Card>
```

### 5.3 项目列表页

- 项目卡片按 updatedAt 倒序排列
- 每个卡片显示：项目名、最后更新时间、条目统计（风险/阻塞/决策/总计）
- 超过 7 天未更新显示警告标识

### 5.4 项目详情页

- 顶部：项目名 + [上传分析] + [新增条目]
- 筛选栏：维度下拉 + 关键词搜索
- 条目列表：按维度分组折叠，每条显示标题、证据摘要、来源、操作按钮

### 5.5 审核页

- 顶部：警告信息（empty_dimensions, warnings）
- 候选列表：按维度分组
- 每条候选：可编辑字段 + 操作选择（入库新建/更新已有/忽略）
- 底部：取消 + 确认入库

---

## 6. AI 提取设计

### 6.1 Prompt

```typescript
const SYSTEM_PROMPT = `你是一个专业的项目状态分析助手。你的任务是从周报/日报中提取关键信息，归类到 12 个维度。

## 输出要求
1. 每条必须有【原文证据】- 从报告中摘录的原文（限 200 字内）
2. 不要编造 - 报告未提及的信息不得推断为事实
3. 同维度去冗余 - 高度相似的表述合并为一条，但保留所有证据

## 12 个维度定义
1. OVERALL_HEALTH: 总体健康度
2. SCHEDULE: 进度与里程碑
3. SCOPE: 交付物与范围
4. RISKS: 风险
5. BLOCKERS: 问题与阻塞
6. DEPENDENCIES: 依赖
7. QUALITY: 质量
8. RESOURCING: 资源
9. DECISIONS: 决策
10. KPI: 指标
11. PLAN_CREDIBILITY: 计划可信度
12. ALIGNMENT: 对齐风险

## 输出格式 (JSON)
{
  "candidates": [
    {
      "dimension": "RISKS",
      "title": "一句话标题",
      "evidence_quote": "报告原文摘录...",
      "confidence": 0.9
    }
  ],
  "empty_dimensions": ["KPI", "QUALITY"],
  "warnings": ["报告未提及里程碑时间节点"]
}`;
```

### 6.2 Embedding

- 模型：text-embedding-3-small
- 维度：1536
- 用途：去重匹配的语义相似度计算

---

## 7. 去重匹配算法

### 7.1 混合策略

```typescript
async function findSimilarEntries(
  projectId: string,
  dimension: string,
  candidateTitle: string,
  candidateEvidence: string,
  candidateEmbedding: number[]
): Promise<SimilarityResult[]> {
  // 1. 预筛选：同项目、同维度
  const entries = await getEntriesByDimension(projectId, dimension);

  // 2. 计算双重相似度
  const results = entries.map(entry => {
    const keywordScore = jaccardSimilarity(
      tokenize(candidateTitle + candidateEvidence),
      tokenize(entry.title + entry.evidenceCurrent)
    );

    const embeddingScore = entry.embedding
      ? cosineSimilarity(candidateEmbedding, entry.embedding)
      : 0;

    // 加权：关键词 40% + 语义 60%
    const score = keywordScore * 0.4 + embeddingScore * 0.6;

    return { ...entry, score, keywordScore, embeddingScore };
  });

  // 3. 过滤 + 排序 + 取 Top 3
  return results
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
```

### 7.2 相似度函数

```typescript
// Jaccard 相似度（关键词）
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

// 余弦相似度（向量）
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}
```

---

## 8. 删除与撤销机制

### 8.1 流程

1. 用户点击删除 → 弹出确认对话框
2. 确认后调用 DELETE API → 软删除（设置 deletedAt + deleteToken）
3. 前端显示 5 秒 Snackbar，带撤销按钮
4. 点击撤销 → 调用 POST undo API → 清除 deletedAt
5. 定时任务每小时清理超过 1 分钟的软删除记录

### 8.2 项目删除

- 需要输入项目名称确认
- 级联删除所有报告、会话、条目
- 不提供撤销

---

## 9. 复用现有能力

| 能力 | 现有模块 | 复用方式 |
|------|---------|---------|
| PDF 解析 | lib/insights/parser.ts | 直接调用 FileParser |
| 文件存储 | lib/insights/storage.ts | 调用 FileStorage，存储目录改为 uploads/pulse |
| OpenAI 客户端 | lib/openai.ts | 直接调用 getOpenAIClient |
| 认证中间件 | middleware.ts | 自动生效 |
| UI 组件 | Material-UI | 统一使用 |

---

## 10. 验收清单

- [ ] 首页显示"项目管理"卡片，点击进入 /pulse
- [ ] 可创建/删除项目，列表按最后更新时间排序
- [ ] 项目卡片显示条目统计（风险/阻塞/决策/总计）
- [ ] 超过 7 天未更新的项目显示警告
- [ ] 可上传 PDF 并选择报告类型/日期
- [ ] AI 提取生成 12 维度候选条目（含证据+置信度）
- [ ] 审核页可编辑候选、选择入库/更新/忽略
- [ ] 去重匹配返回 Top 3 相似条目（关键词+语义混合）
- [ ] 更新条目时追加证据到历史（不覆盖）
- [ ] 条目库支持维度筛选和关键词搜索
- [ ] 条目可编辑/删除，删除有确认+5秒撤销
- [ ] 所有条目操作更新项目的 updatedAt
- [ ] Header 导航包含"项目管理"链接

---

## 11. 后续版本规划

### V1.1
- 证据历史 UI（折叠展开查看历史）
- 更强的候选排序（attention_score）
- 最近 30 天删除记录查看

### V1.2
- PDF 原文定位（点击证据跳转）
- 分析结果差异对比
- 批量操作优化
