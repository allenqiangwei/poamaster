# 对话洞察系统 - 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建对话文本结构化提取系统，将负责人对话自动提炼为 6 维度条目，支持审核、管理和推送到 ToDo

**Architecture:** 四层架构（展示层/API层/业务逻辑层/数据层），使用 Prisma ORM + OpenAI API，采用混合提取策略（短文本单次调用，长文本分段处理），智能去重基于 Embeddings

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, PostgreSQL, OpenAI GPT-4o, Material UI

---

## Phase 1: 数据库模型与基础设施

### Task 1: 数据库模型定义

**Files:**
- Modify: `prisma/schema.prisma` (添加新模型)

**Step 1: 添加 Artifact 模型**

在 `prisma/schema.prisma` 文件末尾添加：

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

**Step 2: 更新 Assignee 模型（添加关系）**

在 `Assignee` 模型中添加关系：

```prisma
model Assignee {
  id           String   @id @default(cuid())
  name         String   @unique
  feishuUserId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tasks        Task[]

  // 新增关系
  artifacts      Artifact[]
  confirmedItems ConfirmedItem[]

  @@index([name])
}
```

**Step 3: 创建 migration**

```bash
npx prisma migrate dev --name add_conversation_insights_models
```

Expected: Migration created successfully

**Step 4: 生成 Prisma Client**

```bash
npx prisma generate
```

Expected: Client generated successfully

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add conversation insights models (Artifact, DraftItem, ConfirmedItem)

- Artifact: stores uploaded file metadata
- DraftItem: temporary items during review
- ConfirmedItem: confirmed items for long-term storage
- Add relations to Assignee model"
```

---

### Task 2: TypeScript 类型定义

**Files:**
- Create: `lib/insights/types.ts`

**Step 1: 创建类型定义文件**

```typescript
// lib/insights/types.ts

// ========== 维度枚举 ==========

export const DIMENSIONS = {
  FOCUS: 'focus',           // 负责人的关注点
  GOAL: 'goal',             // 负责人的目标
  OBSTACLE: 'obstacle',     // 负责人困扰
  DECISION: 'decision',     // 本次需要我拍板的事情
  RISK: 'risk',             // 负责人感觉到的风险
  ACTION: 'action',         // 负责人的行动项和 ETA
} as const;

export type Dimension = typeof DIMENSIONS[keyof typeof DIMENSIONS];

export const DECISION_TYPES = {
  MUST_DECIDE: 'must_decide',       // 必须拍板
  NEED_INTERVENE: 'need_intervene', // 需要介入
} as const;

export type DecisionType = typeof DECISION_TYPES[keyof typeof DECISION_TYPES];

export const ITEM_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ItemStatus = typeof ITEM_STATUS[keyof typeof ITEM_STATUS];

// ========== 解析结果类型 ==========

export interface ParseResult {
  text: string;
  charCount: number;
  pageCount?: number;
  metadata: {
    fileType: string;
    fileName: string;
  };
}

// ========== LLM 提取结果类型 ==========

export interface DraftItemData {
  dimension: Dimension;
  content: string;
  evidence?: string;
  decisionType?: DecisionType;
  action?: string;
  etaText?: string;
}

export interface ExtractionResult {
  items: DraftItemData[];
  metadata: {
    strategy: 'single' | 'chunked';
    modelName: string;
    latencyMs: number;
  };
}

// ========== 去重结果类型 ==========

export interface DedupeResult {
  dedupedItems: DraftItemData[];
  mergeCount: number;
  mergeDetails: Array<{
    keptId: string;
    mergedIds: string[];
    reason: string;
  }>;
}

// ========== 智能分析类型 ==========

export interface SmartFlags {
  isDuplicate: boolean;
  isOutdated: boolean;
  relatedIds: string[];
  confidence: number;  // 0-1
  reason?: string;
  checkedAt: string;
}

export interface SmartAnalysisResult {
  itemId: string;
  flags: SmartFlags;
}

// ========== ToDo 推送类型 ==========

export interface PushResult {
  itemId: string;
  success: boolean;
  todoTaskId?: string;
  error?: string;
}
```

**Step 2: Commit**

```bash
git add lib/insights/types.ts
git commit -m "feat(insights): add TypeScript type definitions

- Dimension enums and types
- Parsing, extraction, deduplication types
- Smart analysis and push result types"
```

---

### Task 3: 常量与配置

**Files:**
- Create: `lib/insights/constants.ts`

**Step 1: 创建常量文件**

```typescript
// lib/insights/constants.ts

import { DIMENSIONS } from './types';

// ========== 文件处理配置 ==========

export const FILE_UPLOAD_CONFIG = {
  ALLOWED_TYPES: [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_DIR: 'uploads/insights',
} as const;

// ========== LLM 提取配置 ==========

export const EXTRACTION_CONFIG = {
  SHORT_TEXT_THRESHOLD: 5000, // 字符
  CHUNK_SIZE: 3000,
  MODEL_NAME: 'gpt-4o',
  TEMPERATURE: 0.3,
  PROMPT_VERSION: '1.0',
} as const;

// ========== 去重配置 ==========

export const DEDUP_CONFIG = {
  SIMILARITY_THRESHOLD: 0.85,
  EMBEDDING_MODEL: 'text-embedding-3-small',
} as const;

// ========== 智能分析配置 ==========

export const SMART_ANALYSIS_CONFIG = {
  DUPLICATE_THRESHOLD: 0.90,
  OUTDATED_DAYS_THRESHOLD: 90,
} as const;

// ========== 维度显示配置 ==========

export const DIMENSION_LABELS: Record<string, string> = {
  [DIMENSIONS.DECISION]: '需要我拍板的事情',
  [DIMENSIONS.FOCUS]: '负责人的关注点',
  [DIMENSIONS.GOAL]: '负责人的目标',
  [DIMENSIONS.OBSTACLE]: '负责人困扰',
  [DIMENSIONS.RISK]: '负责人感觉到的风险',
  [DIMENSIONS.ACTION]: '负责人的行动项和 ETA',
} as const;

export const DIMENSION_ORDER = [
  DIMENSIONS.DECISION,   // 置顶
  DIMENSIONS.FOCUS,
  DIMENSIONS.GOAL,
  DIMENSIONS.OBSTACLE,
  DIMENSIONS.RISK,
  DIMENSIONS.ACTION,
] as const;
```

**Step 2: Commit**

```bash
git add lib/insights/constants.ts
git commit -m "feat(insights): add configuration constants

- File upload limits and allowed types
- LLM extraction thresholds
- Deduplication similarity thresholds
- Smart analysis configuration
- Dimension display labels and order"
```

---

## Phase 2: 文件解析与 LLM 提取

### Task 4: 文件解析器 (FileParser)

**Files:**
- Create: `lib/insights/parser.ts`

**Step 1: 安装依赖**

```bash
npm install mammoth
```

**Step 2: 创建解析器**

```typescript
// lib/insights/parser.ts

import { ParseResult } from './types';

export class FileParser {
  async parse(file: File): Promise<ParseResult> {
    const fileType = this.detectFileType(file);

    switch (fileType) {
      case 'txt':
        return this.parseTxt(file);
      case 'docx':
        return this.parseDocx(file);
      case 'pdf':
        return this.parsePdf(file);
      default:
        throw new Error(`不支持的文件类型: ${file.type}`);
    }
  }

  private detectFileType(file: File): 'txt' | 'docx' | 'pdf' {
    const type = file.type;

    if (type === 'text/plain') return 'txt';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'docx';
    }
    if (type === 'application/pdf') return 'pdf';

    throw new Error('不支持的文件类型');
  }

  private async parseTxt(file: File): Promise<ParseResult> {
    const text = await file.text();

    return {
      text,
      charCount: text.length,
      metadata: {
        fileType: 'txt',
        fileName: file.name
      }
    };
  }

  private async parseDocx(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 mammoth 解析 Word 文档
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      charCount: result.value.length,
      metadata: {
        fileType: 'docx',
        fileName: file.name
      }
    };
  }

  private async parsePdf(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用现有的 pdf-parse
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const data = await parser.parse();

    return {
      text: data.text,
      charCount: data.text.length,
      pageCount: data.numpages,
      metadata: {
        fileType: 'pdf',
        fileName: file.name
      }
    };
  }

  async parseFromPath(filePath: string): Promise<ParseResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      const text = buffer.toString('utf-8');
      return {
        text,
        charCount: text.length,
        metadata: {
          fileType: 'txt',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        charCount: result.value.length,
        metadata: {
          fileType: 'docx',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const data = await parser.parse();

      return {
        text: data.text,
        charCount: data.text.length,
        pageCount: data.numpages,
        metadata: {
          fileType: 'pdf',
          fileName: path.basename(filePath)
        }
      };
    }

    throw new Error(`不支持的文件扩展名: ${ext}`);
  }
}
```

**Step 3: Commit**

```bash
git add lib/insights/parser.ts package.json package-lock.json
git commit -m "feat(insights): implement FileParser for txt/docx/pdf

- Support parsing text, Word, and PDF files
- Expose parse() for File objects
- Expose parseFromPath() for server-side file paths
- Use mammoth for Word, pdf-parse for PDF"
```

---

### Task 5: LLM Prompt 模板

**Files:**
- Create: `lib/insights/prompts.ts`

**Step 1: 创建 Prompt 模板**

```typescript
// lib/insights/prompts.ts

export const SYSTEM_PROMPT = `你是一位资深的 COO 助手，负责从与负责人的对话记录中提取关键信息。

你的任务是按照固定的 6 个维度提取结构化条目，帮助 COO 快速掌握负责人的状态、捕捉决策点、推动行动进入执行系统。

## 重要原则

1. **条目简洁清晰**：避免冗长背景描述，直接提炼核心信息
2. **同维度不重复**：同一维度内不要输出语义重复的条目
3. **证据必须原文**：evidence 字段必须是对话原文中的一句话
4. **准确分类**：确保条目归类到正确的维度`;

export function buildExtractionPrompt(text: string): string {
  return `
## 对话内容

${text}

## 提取要求

按以下 6 个维度提取结构化条目，输出 JSON 格式。

### 6 个维度

**1. focus（负责人的关注点）**
- 对方反复提及/最在意的主题、指标、依赖、约束等

**2. goal（负责人的目标）**
- 明确或隐含的目标（短中期均可）

**3. obstacle（负责人困扰）**
- 卡点、阻碍、抱怨、无法推进的原因

**4. decision（本次需要我拍板的事情）**
- **must_decide**：决策/批准/定优先级/资源分配/方案选择
- **need_intervene**：协调/推动/对齐/关键知会（不一定是决策）

**5. risk（负责人感觉到的风险）**
- 可能导致结果/进度/质量/团队/外部合作变差的风险

**6. action（负责人的行动项和 ETA）**
- 需要执行的具体行动 + 时间预期

## 输出格式

\`\`\`json
{
  "focus": [
    { "content": "条目内容", "evidence": "支持该条目的原文一句话" }
  ],
  "goal": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "obstacle": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "decision": [
    {
      "content": "条目内容",
      "evidence": "原文句子",
      "decisionType": "must_decide" 或 "need_intervene"
    }
  ],
  "risk": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "action": [
    {
      "action": "行动项描述",
      "etaText": "ETA 原文（如'下周五前'，可为空）",
      "evidence": "原文句子"
    }
  ]
}
\`\`\`

## 注意事项

- 如果某个维度没有内容，返回空数组 []
- 同一维度内语义相近的条目只保留一条最准确的
- evidence 必须是原文中的完整句子，不要改写
- decisionType 必须明确是 must_decide 或 need_intervene
- action 维度的 etaText 可以为空字符串（如果没有提到时间）

请严格按照上述格式输出 JSON。
`.trim();
}

export function buildMergePrompt(items: Array<{ content: string; evidence?: string }>): string {
  return `
以下是同一维度下语义相似的多条条目，请合并为一条简洁、准确的代表条目：

${items.map((item, i) => `${i + 1}. ${item.content}`).join('\n')}

要求：
- 保留所有关键信息
- 去除重复表述
- 输出一条简洁的合并后条目

只输出合并后的条目内容，不要其他说明。
`.trim();
}

export function buildSummaryPrompt(chunkResults: string[]): string {
  return `
以下是对长文本分段提取的结果，请汇总合并为最终的 6 维度条目：

${chunkResults.map((r, i) => `=== 第 ${i + 1} 段 ===\n${r}\n`).join('\n')}

要求：
- 合并所有段落的条目
- 同一维度内去除语义重复
- 保持 JSON 格式输出

输出格式与单次提取相同。
`.trim();
}

export function buildOutdatedCheckPrompt(item: { content: string; createdAt: Date }, dimension: string): string {
  const daysSinceCreated = Math.floor(
    (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return `
判断以下条目是否可能已经过时（不再相关或已被解决）：

维度：${dimension}
内容：${item.content}
创建时间：${item.createdAt.toLocaleDateString()}（${daysSinceCreated} 天前）

请分析并回答 JSON 格式：

\`\`\`json
{
  "isOutdated": true/false,
  "confidence": 0.0-1.0,
  "reason": "判断理由"
}
\`\`\`

只输出 JSON，不要其他说明。
`.trim();
}
```

**Step 2: Commit**

```bash
git add lib/insights/prompts.ts
git commit -m "feat(insights): add LLM prompt templates

- System prompt defining COO assistant role
- Extraction prompt with 6 dimensions
- Merge prompt for deduplication
- Summary prompt for chunked text
- Outdated check prompt for smart analysis"
```

---

### Task 6: LLM 提取引擎 (InsightsExtractor) - Part 1

**Files:**
- Create: `lib/insights/extractor.ts`

**Step 1: 创建提取器基础结构**

```typescript
// lib/insights/extractor.ts

import { getOpenAIClient } from '@/lib/openai';
import { DraftItemData, ExtractionResult, Dimension } from './types';
import { EXTRACTION_CONFIG } from './constants';
import { SYSTEM_PROMPT, buildExtractionPrompt, buildSummaryPrompt } from './prompts';

export class InsightsExtractor {
  private readonly openai = getOpenAIClient();

  async extract(text: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    // 策略选择
    if (text.length <= EXTRACTION_CONFIG.SHORT_TEXT_THRESHOLD) {
      const items = await this.extractSingle(text);
      return {
        items,
        metadata: {
          strategy: 'single',
          modelName: EXTRACTION_CONFIG.MODEL_NAME,
          latencyMs: Date.now() - startTime
        }
      };
    } else {
      const items = await this.extractChunked(text);
      return {
        items,
        metadata: {
          strategy: 'chunked',
          modelName: EXTRACTION_CONFIG.MODEL_NAME,
          latencyMs: Date.now() - startTime
        }
      };
    }
  }

  private async extractSingle(text: string): Promise<DraftItemData[]> {
    const prompt = buildExtractionPrompt(text);

    const response = await this.openai.chat.completions.create({
      model: EXTRACTION_CONFIG.MODEL_NAME,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: EXTRACTION_CONFIG.TEMPERATURE,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('LLM 返回空内容');
    }

    const parsed = JSON.parse(content);
    return this.normalizeItems(parsed);
  }

  private async extractChunked(text: string): Promise<DraftItemData[]> {
    // 1. 分段
    const chunks = this.splitText(text, EXTRACTION_CONFIG.CHUNK_SIZE);

    // 2. 并发提取各段
    const chunkResults = await Promise.all(
      chunks.map(chunk => this.extractSingle(chunk))
    );

    // 3. 汇总合并
    const merged = await this.mergeSections(chunkResults);
    return merged;
  }

  private splitText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[。！？\n]+/).filter(s => s.trim());

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '。';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async mergeSections(chunkResults: DraftItemData[][]): Promise<DraftItemData[]> {
    // 将所有段落结果转为 JSON 字符串
    const resultsJson = chunkResults.map(items => {
      const grouped: Record<string, any[]> = {};

      items.forEach(item => {
        if (!grouped[item.dimension]) {
          grouped[item.dimension] = [];
        }
        grouped[item.dimension].push(item);
      });

      return JSON.stringify(grouped, null, 2);
    });

    const prompt = buildSummaryPrompt(resultsJson);

    const response = await this.openai.chat.completions.create({
      model: EXTRACTION_CONFIG.MODEL_NAME,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: EXTRACTION_CONFIG.TEMPERATURE,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('LLM 汇总返回空内容');
    }

    const parsed = JSON.parse(content);
    return this.normalizeItems(parsed);
  }

  private normalizeItems(parsed: any): DraftItemData[] {
    const items: DraftItemData[] = [];

    // focus
    if (Array.isArray(parsed.focus)) {
      parsed.focus.forEach((item: any) => {
        items.push({
          dimension: 'focus',
          content: item.content,
          evidence: item.evidence
        });
      });
    }

    // goal
    if (Array.isArray(parsed.goal)) {
      parsed.goal.forEach((item: any) => {
        items.push({
          dimension: 'goal',
          content: item.content,
          evidence: item.evidence
        });
      });
    }

    // obstacle
    if (Array.isArray(parsed.obstacle)) {
      parsed.obstacle.forEach((item: any) => {
        items.push({
          dimension: 'obstacle',
          content: item.content,
          evidence: item.evidence
        });
      });
    }

    // decision
    if (Array.isArray(parsed.decision)) {
      parsed.decision.forEach((item: any) => {
        items.push({
          dimension: 'decision',
          content: item.content,
          evidence: item.evidence,
          decisionType: item.decisionType
        });
      });
    }

    // risk
    if (Array.isArray(parsed.risk)) {
      parsed.risk.forEach((item: any) => {
        items.push({
          dimension: 'risk',
          content: item.content,
          evidence: item.evidence
        });
      });
    }

    // action
    if (Array.isArray(parsed.action)) {
      parsed.action.forEach((item: any) => {
        items.push({
          dimension: 'action',
          content: item.action || item.content, // 兼容两种格式
          action: item.action,
          etaText: item.etaText || '',
          evidence: item.evidence
        });
      });
    }

    return items;
  }
}
```

**Step 2: Commit**

```bash
git add lib/insights/extractor.ts
git commit -m "feat(insights): implement InsightsExtractor with hybrid strategy

- Single-pass extraction for short text (<5000 chars)
- Chunked extraction for long text (>5000 chars)
- Automatic section merging for chunked results
- Normalize LLM output to DraftItemData[]"
```

---

## Phase 3: API 路由实现

### Task 7: 文件上传 API

**Files:**
- Create: `app/api/insights/upload/route.ts`
- Create: `lib/insights/storage.ts`

**Step 1: 创建存储辅助函数**

```typescript
// lib/insights/storage.ts

import { promises as fs } from 'fs';
import path from 'path';
import { FILE_UPLOAD_CONFIG } from './constants';

export async function saveUploadedFile(file: File, assigneeId: string): Promise<string> {
  // 确保上传目录存在
  const uploadDir = path.join(process.cwd(), FILE_UPLOAD_CONFIG.UPLOAD_DIR, assigneeId);
  await fs.mkdir(uploadDir, { recursive: true });

  // 生成唯一文件名
  const timestamp = Date.now();
  const ext = path.extname(file.name);
  const fileName = `${timestamp}${ext}`;
  const filePath = path.join(uploadDir, fileName);

  // 保存文件
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  // 返回相对路径
  return path.join(FILE_UPLOAD_CONFIG.UPLOAD_DIR, assigneeId, fileName);
}

export async function deleteFile(filePath: string): Promise<void> {
  const fullPath = path.join(process.cwd(), filePath);
  await fs.unlink(fullPath);
}
```

**Step 2: 创建上传 API**

```typescript
// app/api/insights/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { FILE_UPLOAD_CONFIG } from '@/lib/insights/constants';
import { saveUploadedFile } from '@/lib/insights/storage';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // 1. 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // 2. 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const assigneeId = formData.get('assigneeId') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    if (!assigneeId) {
      return NextResponse.json(
        { success: false, error: '缺少负责人 ID' },
        { status: 400 }
      );
    }

    // 3. 验证文件类型
    if (!FILE_UPLOAD_CONFIG.ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: '不支持的文件类型' },
        { status: 400 }
      );
    }

    // 4. 验证文件大小
    if (file.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: '文件大小超过限制（10MB）' },
        { status: 400 }
      );
    }

    // 5. 保存文件
    const filePath = await saveUploadedFile(file, assigneeId);

    // 6. 创建 Artifact 记录
    const artifact = await prisma.artifact.create({
      data: {
        assigneeId,
        fileName: file.name,
        fileType: file.type,
        filePath,
        charCount: 0, // 待解析
        status: 'uploading'
      }
    });

    return NextResponse.json({
      success: true,
      artifactId: artifact.id
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Step 3: 创建 Prisma client 辅助（如果不存在）**

```typescript
// lib/prisma.ts (如果文件已存在则跳过)

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Step 4: Commit**

```bash
git add app/api/insights/upload/route.ts lib/insights/storage.ts lib/prisma.ts
git commit -m "feat(insights): implement file upload API

- Validate file type and size
- Save file to uploads/insights/{assigneeId}
- Create Artifact record in database
- Return artifactId for next steps"
```

---

### Task 8: 提取与去重 API（简化版 - Phase 1 MVP）

**Files:**
- Create: `app/api/insights/process/route.ts`

**说明：** 为了快速验证核心流程，Phase 1 将上传、解析、提取、去重合并为一个端点

**Step 1: 创建统一处理端点**

```typescript
// app/api/insights/process/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FileParser } from '@/lib/insights/parser';
import { InsightsExtractor } from '@/lib/insights/extractor';
import { EXTRACTION_CONFIG } from '@/lib/insights/constants';

export async function POST(request: NextRequest) {
  try {
    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    const { artifactId } = await request.json();

    // 1. 获取 Artifact
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId }
    });

    if (!artifact) {
      return NextResponse.json({ success: false, error: 'Artifact not found' }, { status: 404 });
    }

    // 2. 更新状态为 parsing
    await prisma.artifact.update({
      where: { id: artifactId },
      data: { status: 'parsing' }
    });

    // 3. 解析文件
    const parser = new FileParser();
    const parsed = await parser.parseFromPath(artifact.filePath);

    // 4. 更新字符数
    await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        charCount: parsed.charCount,
        pageCount: parsed.pageCount,
        status: 'extracting'
      }
    });

    // 5. LLM 提取
    const extractor = new InsightsExtractor();
    const result = await extractor.extract(parsed.text);

    // 6. 创建 DraftItems
    const draftItemsData = result.items.map((item, index) => ({
      artifactId,
      dimension: item.dimension,
      sortOrder: index,
      content: item.content,
      evidence: item.evidence || null,
      decisionType: item.decisionType || null,
      action: item.action || null,
      etaText: item.etaText || null,
    }));

    await prisma.draftItem.createMany({
      data: draftItemsData
    });

    // 7. 更新 Artifact（标记为 ready）
    await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        modelName: result.metadata.modelName,
        promptVersion: EXTRACTION_CONFIG.PROMPT_VERSION,
        latencyMs: result.metadata.latencyMs,
        status: 'ready'
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Process error:', error);

    // 更新失败状态
    const { artifactId } = await request.json();
    if (artifactId) {
      await prisma.artifact.update({
        where: { id: artifactId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/insights/process/route.ts
git commit -m "feat(insights): implement unified process API (parse + extract)

- Parse file from storage
- Extract items with LLM
- Create DraftItems in database
- Update Artifact status throughout pipeline"
```

---

### Task 9: 确认入库 API

**Files:**
- Create: `app/api/insights/confirm/route.ts`

**Step 1: 创建确认入库端点**

```typescript
// app/api/insights/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    const { artifactId, draftItems } = await request.json();

    // 事务处理
    const result = await prisma.$transaction(async (tx) => {
      // 1. 获取 Artifact
      const artifact = await tx.artifact.findUnique({
        where: { id: artifactId }
      });

      if (!artifact) {
        throw new Error('Artifact not found');
      }

      // 2. 创建 ConfirmedItems（不保存 evidence）
      const confirmedData = draftItems.map((item: any) => ({
        assigneeId: artifact.assigneeId,
        artifactId,
        dimension: item.dimension,
        sortOrder: item.sortOrder || 0,
        content: item.content,
        decisionType: item.decisionType || null,
        action: item.action || null,
        etaText: item.etaText || null,
        status: 'active'
      }));

      await tx.confirmedItem.createMany({
        data: confirmedData
      });

      // 3. 删除 DraftItems
      await tx.draftItem.deleteMany({
        where: { artifactId }
      });

      // 4. 更新 Artifact 状态
      await tx.artifact.update({
        where: { id: artifactId },
        data: { status: 'confirmed' }
      });

      return { count: confirmedData.length };
    });

    return NextResponse.json({ success: true, count: result.count });

  } catch (error: any) {
    console.error('Confirm error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/insights/confirm/route.ts
git commit -m "feat(insights): implement confirm API

- Create ConfirmedItems from DraftItems
- Remove evidence field (not saved long-term)
- Delete DraftItems after confirmation
- Update Artifact status to confirmed
- Use transaction for data consistency"
```

---

## Phase 4: 前端基础界面

### Task 10: 审核页面（简化版）

**Files:**
- Create: `app/(dashboard)/assignees/[id]/insights/review/[artifactId]/page.tsx`

**Step 1: 创建基础审核页**

```typescript
// app/(dashboard)/assignees/[id]/insights/review/[artifactId]/page.tsx

'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Button, Paper, Stack, Accordion, AccordionSummary, AccordionDetails, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface DraftItem {
  id: string;
  dimension: string;
  content: string;
  evidence?: string;
  decisionType?: string;
  action?: string;
  etaText?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  decision: '需要我拍板的事情',
  focus: '负责人的关注点',
  goal: '负责人的目标',
  obstacle: '负责人困扰',
  risk: '负责人感觉到的风险',
  action: '负责人的行动项和 ETA',
};

const DIMENSION_ORDER = ['decision', 'focus', 'goal', 'obstacle', 'risk', 'action'];

export default function ReviewPage({ params }: { params: Promise<{ id: string; artifactId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDraftItems();
  }, [resolvedParams.artifactId]);

  const loadDraftItems = async () => {
    const res = await fetch(`/api/insights/drafts/${resolvedParams.artifactId}`);
    const data = await res.json();
    setDraftItems(data.items || []);
    setLoading(false);
  };

  const handleConfirm = async () => {
    await fetch('/api/insights/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifactId: resolvedParams.artifactId,
        draftItems
      })
    });

    router.push(`/assignees/${resolvedParams.id}`);
  };

  const groupedItems = DIMENSION_ORDER.reduce((acc, dim) => {
    acc[dim] = draftItems.filter(item => item.dimension === dim);
    return acc;
  }, {} as Record<string, DraftItem[]>);

  if (loading) {
    return <Box sx={{ p: 3 }}>加载中...</Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">审核提取结果</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" onClick={() => router.back()}>放弃草稿</Button>
          <Button variant="contained" onClick={handleConfirm}>确认入库</Button>
        </Box>
      </Box>

      <Stack spacing={2}>
        {DIMENSION_ORDER.map(dimension => {
          const items = groupedItems[dimension] || [];
          const isPriority = dimension === 'decision';

          return (
            <Accordion key={dimension} defaultExpanded={isPriority || items.length > 0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {DIMENSION_LABELS[dimension]}
                  </Typography>
                  <Chip label={items.length} size="small" />
                  {isPriority && <Chip label="优先" color="error" size="small" />}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {items.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">无条目</Typography>
                ) : (
                  <Stack spacing={2}>
                    {items.map(item => (
                      <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                        {item.decisionType && (
                          <Chip
                            label={item.decisionType === 'must_decide' ? '🔴 必须拍板' : '🟡 需要介入'}
                            size="small"
                            color={item.decisionType === 'must_decide' ? 'error' : 'warning'}
                            sx={{ mb: 1 }}
                          />
                        )}
                        <Typography variant="body1">
                          {dimension === 'action' ? `📋 ${item.action}` : item.content}
                        </Typography>
                        {item.etaText && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            ⏰ ETA: {item.etaText}
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Box>
  );
}
```

**Step 2: 创建获取 Draft API**

```typescript
// app/api/insights/drafts/[artifactId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    const { artifactId } = await params;

    const items = await prisma.draftItem.findMany({
      where: { artifactId },
      orderBy: { sortOrder: 'asc' }
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('Get drafts error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add app/(dashboard)/assignees/[id]/insights/review/[artifactId]/page.tsx app/api/insights/drafts/[artifactId]/route.ts
git commit -m "feat(insights): implement basic review page

- Display draft items grouped by dimension
- Priority highlighting for decision dimension
- Confirm button to finalize items
- Discard button to abandon draft"
```

---

### Task 11: 负责人详情页上传入口

**Files:**
- Modify: `app/(dashboard)/assignees/[id]/page.tsx`

**Step 1: 添加上传按钮和对话框（修改现有文件）**

在负责人详情页添加上传对话按钮：

```typescript
// 在现有的负责人详情页中添加上传功能
// 找到合适的位置添加以下按钮

<Button
  variant="contained"
  startIcon={<UploadFileIcon />}
  onClick={() => setUploadDialogOpen(true)}
>
  上传对话
</Button>

// 添加上传对话框组件
<Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)}>
  <DialogTitle>上传对话文件</DialogTitle>
  <DialogContent>
    <input
      type="file"
      accept=".txt,.pdf,.docx"
      onChange={handleFileChange}
      style={{ marginTop: 16 }}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setUploadDialogOpen(false)}>取消</Button>
    <Button onClick={handleUpload} variant="contained">上传并提取</Button>
  </DialogActions>
</Dialog>

// 添加处理函数
const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
const [selectedFile, setSelectedFile] = useState<File | null>(null);

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files[0]) {
    setSelectedFile(e.target.files[0]);
  }
};

const handleUpload = async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('assigneeId', assigneeId);

  // 1. 上传文件
  const uploadRes = await fetch('/api/insights/upload', {
    method: 'POST',
    body: formData
  });
  const { artifactId } = await uploadRes.json();

  // 2. 触发处理
  await fetch('/api/insights/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifactId })
  });

  // 3. 跳转到审核页
  router.push(`/assignees/${assigneeId}/insights/review/${artifactId}`);
};
```

**Step 2: Commit**

```bash
git add app/(dashboard)/assignees/[id]/page.tsx
git commit -m "feat(insights): add upload dialog to assignee detail page

- Upload button with file picker
- Support txt/pdf/docx files
- Auto-trigger processing after upload
- Navigate to review page when ready"
```

---

## Phase 5: 测试与优化

### Task 12: 端到端测试

**Step 1: 手动测试核心流程**

1. 启动开发服务器：`npm run dev`
2. 登录系统
3. 进入负责人详情页
4. 点击"上传对话"
5. 上传测试文件（准备 3000 字左右的对话文本）
6. 等待处理完成（约 15-30 秒）
7. 进入审核页，验证：
   - 6 个维度正确分类
   - 拍板事项置顶
   - 条目内容准确
8. 点击"确认入库"
9. 返回负责人详情页，验证数据已保存

**Step 2: 记录测试结果**

创建测试记录文件：

```markdown
# 测试记录

## 测试日期: 2026-01-29

### 核心流程测试

- [ ] 文件上传成功
- [ ] 文本解析正确
- [ ] LLM 提取准确
- [ ] 维度分类合理
- [ ] 拍板事项置顶
- [ ] 确认入库成功

### 发现的问题

1. ...
2. ...

### 待优化项

1. ...
2. ...
```

**Step 3: Commit**

```bash
git add docs/test-results.md
git commit -m "test: add manual E2E test results for Phase 1"
```

---

## 总结与后续计划

### Phase 1 完成标准

- ✅ 数据库模型创建并迁移成功
- ✅ 文件上传、解析、提取流程通畅
- ✅ 审核页可正常展示和确认
- ✅ 数据成功写入 ConfirmedItem 表

### Phase 2-4 规划（后续迭代）

**Phase 2: 去重与智能分析**
- 实现语义去重引擎
- 实现智能重复/过时检测
- 添加管理页展示智能标记

**Phase 3: ToDo 集成**
- 实现 TodoPusher
- 添加批量推送功能
- 记录推送状态

**Phase 4: UI 增强**
- 左右对照布局
- 条目编辑/删除/移动
- 证据展开查看
- 进度提示

---

## 执行方式选择

计划已完成并保存到 `docs/plans/2026-01-29-conversation-insights-implementation.md`。

现在有两种执行方式：

**1. Subagent-Driven (当前会话)**
- 我在当前会话中调度独立 subagent 执行每个任务
- 每个任务完成后进行代码审查
- 快速迭代，实时反馈

**2. Parallel Session (独立会话)**
- 打开新的 Claude Code 会话
- 使用 superpowers:executing-plans 技能
- 批量执行，定期检查点

你希望用哪种方式？
