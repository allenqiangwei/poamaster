# Project Pulse V1.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a project management tool that extracts 12-dimension status entries from PDF reports using AI, with hybrid similarity matching for deduplication.

**Architecture:** Next.js App Router + Prisma + PostgreSQL. Independent data models (Pulse prefix), reusing existing PDF parser, file storage, and OpenAI client. Soft-delete with undo for data safety.

**Tech Stack:** Next.js 16, Prisma, PostgreSQL, Material-UI, OpenAI GPT-4o + text-embedding-3-small, TypeScript

---

## Phase 1: Database Schema & Types

### Task 1.1: Add Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add enums and models to schema**

Append to `prisma/schema.prisma`:

```prisma
// ============================================
// Project Pulse - 项目管理模块
// ============================================

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
  OVERALL_HEALTH
  SCHEDULE
  SCOPE
  RISKS
  BLOCKERS
  DEPENDENCIES
  QUALITY
  RESOURCING
  DECISIONS
  KPI
  PLAN_CREDIBILITY
  ALIGNMENT
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
  sourceCurrent   Json
  evidenceHistory Json           @default("[]")
  embedding       Float[]

  deletedAt       DateTime?
  deleteToken     String?

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([projectId, dimension])
  @@index([deletedAt])
}
```

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_pulse_models`

Expected: Migration created successfully

**Step 3: Generate Prisma client**

Run: `npx prisma generate`

Expected: Prisma Client generated

**Step 4: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(pulse): add database models for project management

- PulseProject: projects with updatedAt tracking
- PulseReport: PDF uploads with parse status
- PulseAnalysisSession: AI extraction results
- PulseEntry: 12-dimension entries with soft delete

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Create Type Definitions

**Files:**
- Create: `lib/pulse/types.ts`

**Step 1: Create types file**

```typescript
// lib/pulse/types.ts

import { EntryDimension, ReportType } from '@prisma/client';

export interface Source {
  reportType: ReportType;
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
  dimension: EntryDimension;
  title: string;
  evidence_quote: string;
  confidence: number;
}

export interface AIExtractionResult {
  candidates: AICandidate[];
  empty_dimensions: EntryDimension[];
  warnings: string[];
}

export interface SimilarityResult {
  entryId: string;
  title: string;
  evidenceCurrent: string;
  sourceCurrent: Source;
  score: number;
  keywordScore: number;
  embeddingScore: number;
}

export interface BatchOperation {
  action: 'create' | 'update' | 'ignore';
  candidateIndex: number;
  targetEntryId?: string;
  dimension: EntryDimension;
  title: string;
  evidence: string;
  source: Source;
}

export interface ProjectStats {
  total: number;
  byDimension: Record<EntryDimension, number>;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add lib/pulse/
git commit -m "feat(pulse): add TypeScript type definitions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.3: Create Constants

**Files:**
- Create: `lib/pulse/constants.ts`

**Step 1: Create constants file**

```typescript
// lib/pulse/constants.ts

import { EntryDimension } from '@prisma/client';

export const DIMENSION_LABELS: Record<EntryDimension, string> = {
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

// Display order (critical dimensions first)
export const DIMENSION_ORDER: EntryDimension[] = [
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

// Key dimensions shown on project cards
export const KEY_DIMENSIONS: EntryDimension[] = ['RISKS', 'BLOCKERS', 'DECISIONS'];

// Stale project threshold (days)
export const STALE_THRESHOLD_DAYS = 7;

// Soft delete cleanup threshold (ms) - 1 minute
export const DELETE_CLEANUP_THRESHOLD_MS = 60 * 1000;

// Undo window (ms) - 5 seconds
export const UNDO_WINDOW_MS = 5000;

// Similarity thresholds
export const SIMILARITY_THRESHOLD = 0.3;
export const KEYWORD_WEIGHT = 0.4;
export const EMBEDDING_WEIGHT = 0.6;

// File upload config
export const PULSE_UPLOAD_DIR = 'uploads/pulse';
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = ['application/pdf'];
```

**Step 2: Commit**

```bash
git add lib/pulse/constants.ts
git commit -m "feat(pulse): add constants for dimensions and config

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Core API - Projects

### Task 2.1: Projects List & Create API

**Files:**
- Create: `app/api/pulse/projects/route.ts`

**Step 1: Create projects API**

```typescript
// app/api/pulse/projects/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/pulse/projects - List all projects
export async function GET() {
  try {
    const projects = await prisma.pulseProject.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            entries: {
              where: { deletedAt: null }
            }
          }
        }
      }
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/pulse/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await prisma.pulseProject.create({
      data: { name: name.trim() }
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/api/pulse/
git commit -m "feat(pulse): add projects list and create API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2.2: Project Detail, Update & Delete API

**Files:**
- Create: `app/api/pulse/projects/[id]/route.ts`

**Step 1: Create project detail API**

```typescript
// app/api/pulse/projects/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pulse/projects/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const project = await prisma.pulseProject.findUnique({
      where: { id },
      include: {
        entries: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' }
        }
      }
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PATCH /api/pulse/projects/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await prisma.pulseProject.update({
      where: { id },
      data: { name: name.trim() }
    });

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/pulse/projects/[id]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Cascade delete is handled by Prisma schema
    await prisma.pulseProject.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/projects/
git commit -m "feat(pulse): add project detail, update and delete API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2.3: Project Stats API

**Files:**
- Create: `app/api/pulse/projects/[id]/stats/route.ts`

**Step 1: Create stats API**

```typescript
// app/api/pulse/projects/[id]/stats/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { EntryDimension } from '@prisma/client';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pulse/projects/[id]/stats
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Get counts by dimension
    const entries = await prisma.pulseEntry.groupBy({
      by: ['dimension'],
      where: {
        projectId: id,
        deletedAt: null
      },
      _count: true
    });

    // Build stats object
    const byDimension: Record<string, number> = {};
    let total = 0;

    for (const entry of entries) {
      byDimension[entry.dimension] = entry._count;
      total += entry._count;
    }

    // Fill missing dimensions with 0
    const allDimensions: EntryDimension[] = [
      'OVERALL_HEALTH', 'SCHEDULE', 'SCOPE', 'RISKS', 'BLOCKERS',
      'DEPENDENCIES', 'QUALITY', 'RESOURCING', 'DECISIONS',
      'KPI', 'PLAN_CREDIBILITY', 'ALIGNMENT'
    ];

    for (const dim of allDimensions) {
      if (!(dim in byDimension)) {
        byDimension[dim] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      data: { total, byDimension }
    });
  } catch (error) {
    console.error('Failed to fetch project stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/projects/
git commit -m "feat(pulse): add project stats API for dimension counts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Core API - Entries

### Task 3.1: Entries List & Create API

**Files:**
- Create: `app/api/pulse/entries/route.ts`

**Step 1: Create entries API**

```typescript
// app/api/pulse/entries/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { EntryDimension } from '@prisma/client';

// GET /api/pulse/entries?projectId=xxx&dimension=xxx&search=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const dimension = searchParams.get('dimension') as EntryDimension | null;
    const search = searchParams.get('search');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {
      projectId,
      deletedAt: null
    };

    if (dimension) {
      where.dimension = dimension;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { evidenceCurrent: { contains: search, mode: 'insensitive' } }
      ];
    }

    const entries = await prisma.pulseEntry.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error('Failed to fetch entries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch entries' },
      { status: 500 }
    );
  }
}

// POST /api/pulse/entries - Create single entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, dimension, title, evidence, source } = body;

    if (!projectId || !dimension || !title || !evidence || !source) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create entry and update project timestamp in transaction
    const [entry] = await prisma.$transaction([
      prisma.pulseEntry.create({
        data: {
          projectId,
          dimension,
          title: title.trim(),
          evidenceCurrent: evidence.trim(),
          sourceCurrent: source,
          evidenceHistory: [],
          embedding: []
        }
      }),
      prisma.pulseProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Failed to create entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create entry' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/api/pulse/entries/
git commit -m "feat(pulse): add entries list and create API

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3.2: Entry Detail, Update & Delete API

**Files:**
- Create: `app/api/pulse/entries/[id]/route.ts`

**Step 1: Create entry detail API**

```typescript
// app/api/pulse/entries/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { UNDO_WINDOW_MS } from '@/lib/pulse/constants';
import { EvidenceHistoryItem, Source } from '@/lib/pulse/types';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pulse/entries/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const entry = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!entry || entry.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Failed to fetch entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch entry' },
      { status: 500 }
    );
  }
}

// PATCH /api/pulse/entries/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, dimension, evidence, source } = body;

    const existing = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (title) updateData.title = title.trim();
    if (dimension) updateData.dimension = dimension;

    // If evidence/source changed, append to history
    if (evidence && source) {
      const historyItem: EvidenceHistoryItem = {
        evidence: existing.evidenceCurrent,
        source: existing.sourceCurrent as Source,
        addedAt: new Date().toISOString()
      };

      const currentHistory = (existing.evidenceHistory as EvidenceHistoryItem[]) || [];

      updateData.evidenceCurrent = evidence.trim();
      updateData.sourceCurrent = source;
      updateData.evidenceHistory = [...currentHistory, historyItem];
    }

    // Update entry and project timestamp
    const [entry] = await prisma.$transaction([
      prisma.pulseEntry.update({
        where: { id },
        data: updateData
      }),
      prisma.pulseProject.update({
        where: { id: existing.projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Failed to update entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/pulse/entries/[id] - Soft delete with undo token
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    // Generate undo token
    const deleteToken = randomBytes(16).toString('hex');

    // Soft delete
    await prisma.$transaction([
      prisma.pulseEntry.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deleteToken
        }
      }),
      prisma.pulseProject.update({
        where: { id: existing.projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: {
        undoToken: deleteToken,
        undoExpiresIn: UNDO_WINDOW_MS
      }
    });
  } catch (error) {
    console.error('Failed to delete entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete entry' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/entries/
git commit -m "feat(pulse): add entry CRUD with soft delete and evidence history

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3.3: Entry Undo Delete API

**Files:**
- Create: `app/api/pulse/entries/[id]/undo/route.ts`

**Step 1: Create undo API**

```typescript
// app/api/pulse/entries/[id]/undo/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { UNDO_WINDOW_MS } from '@/lib/pulse/constants';

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/pulse/entries/[id]/undo
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { undoToken } = body;

    if (!undoToken) {
      return NextResponse.json(
        { success: false, error: 'Undo token is required' },
        { status: 400 }
      );
    }

    const entry = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    // Verify token
    if (entry.deleteToken !== undoToken) {
      return NextResponse.json(
        { success: false, error: 'Invalid undo token' },
        { status: 400 }
      );
    }

    // Check if within undo window
    if (!entry.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry is not deleted' },
        { status: 400 }
      );
    }

    const elapsed = Date.now() - entry.deletedAt.getTime();
    if (elapsed > UNDO_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: 'Undo window expired' },
        { status: 400 }
      );
    }

    // Restore entry
    await prisma.pulseEntry.update({
      where: { id },
      data: {
        deletedAt: null,
        deleteToken: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to undo delete:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to undo delete' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/entries/
git commit -m "feat(pulse): add entry undo delete API with token validation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Similarity & Embedding

### Task 4.1: Similarity Functions

**Files:**
- Create: `lib/pulse/similarity.ts`

**Step 1: Create similarity module**

```typescript
// lib/pulse/similarity.ts

import prisma from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';
import { EntryDimension } from '@prisma/client';
import { SimilarityResult, Source } from './types';
import { SIMILARITY_THRESHOLD, KEYWORD_WEIGHT, EMBEDDING_WEIGHT } from './constants';

// Tokenize text for keyword matching (Chinese + English)
export function tokenize(text: string): Set<string> {
  // Remove punctuation, split by spaces and individual Chinese characters
  const cleaned = text.toLowerCase().replace(/[^\w\u4e00-\u9fff\s]/g, ' ');
  const tokens = new Set<string>();

  // Split by whitespace for English words
  for (const word of cleaned.split(/\s+/)) {
    if (word.length > 1) {
      tokens.add(word);
    }
  }

  // Add individual Chinese characters (simple tokenization)
  for (const char of cleaned) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens.add(char);
    }
  }

  return tokens;
}

// Jaccard similarity for keyword matching
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

// Cosine similarity for embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

// Generate embedding for text
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = await getOpenAIClient();

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)  // Truncate to avoid token limit
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return [];
  }
}

// Find similar entries in same project and dimension
export async function findSimilarEntries(
  projectId: string,
  dimension: EntryDimension,
  candidateTitle: string,
  candidateEvidence: string,
  candidateEmbedding?: number[]
): Promise<SimilarityResult[]> {
  // Get existing entries in same project/dimension
  const entries = await prisma.pulseEntry.findMany({
    where: {
      projectId,
      dimension,
      deletedAt: null
    }
  });

  if (entries.length === 0) {
    return [];
  }

  // Tokenize candidate
  const candidateText = candidateTitle + ' ' + candidateEvidence;
  const candidateTokens = tokenize(candidateText);

  // Calculate similarity for each entry
  const results: SimilarityResult[] = [];

  for (const entry of entries) {
    const entryText = entry.title + ' ' + entry.evidenceCurrent;
    const entryTokens = tokenize(entryText);

    // Keyword similarity
    const keywordScore = jaccardSimilarity(candidateTokens, entryTokens);

    // Embedding similarity
    let embeddingScore = 0;
    if (candidateEmbedding && candidateEmbedding.length > 0 &&
        entry.embedding && entry.embedding.length > 0) {
      embeddingScore = cosineSimilarity(candidateEmbedding, entry.embedding);
    }

    // Weighted score
    const score = keywordScore * KEYWORD_WEIGHT + embeddingScore * EMBEDDING_WEIGHT;

    if (score >= SIMILARITY_THRESHOLD) {
      results.push({
        entryId: entry.id,
        title: entry.title,
        evidenceCurrent: entry.evidenceCurrent,
        sourceCurrent: entry.sourceCurrent as Source,
        score,
        keywordScore,
        embeddingScore
      });
    }
  }

  // Sort by score descending and return top 3
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add lib/pulse/similarity.ts
git commit -m "feat(pulse): add similarity matching with keyword + embedding hybrid

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 4.2: Similar Entries API

**Files:**
- Create: `app/api/pulse/entries/similar/route.ts`

**Step 1: Create similar API**

```typescript
// app/api/pulse/entries/similar/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { EntryDimension } from '@prisma/client';
import { findSimilarEntries, generateEmbedding } from '@/lib/pulse/similarity';

// POST /api/pulse/entries/similar
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, dimension, title, evidence } = body;

    if (!projectId || !dimension || !title) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate embedding for candidate
    const candidateText = title + ' ' + (evidence || '');
    const embedding = await generateEmbedding(candidateText);

    // Find similar entries
    const similar = await findSimilarEntries(
      projectId,
      dimension as EntryDimension,
      title,
      evidence || '',
      embedding
    );

    return NextResponse.json({
      success: true,
      data: similar
    });
  } catch (error) {
    console.error('Failed to find similar entries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to find similar entries' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/entries/similar/
git commit -m "feat(pulse): add similar entries API for deduplication

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Report Upload & AI Extraction

### Task 5.1: Report Upload API

**Files:**
- Create: `app/api/pulse/reports/upload/route.ts`

**Step 1: Create upload API**

```typescript
// app/api/pulse/reports/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { ReportType } from '@prisma/client';
import { PULSE_UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/pulse/constants';
import path from 'path';
import fs from 'fs/promises';

// POST /api/pulse/reports/upload
export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const reportType = formData.get('reportType') as ReportType | null;
    const reportDate = formData.get('reportDate') as string | null;

    // Validate inputs
    if (!file || !projectId || !reportType || !reportDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.pulseProject.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Save file
    const storage = new FileStorage(PULSE_UPLOAD_DIR);
    const buffer = Buffer.from(await file.arrayBuffer());
    filePath = await storage.saveFile(buffer, file.name, projectId);

    // Parse PDF
    const parser = new FileParser();
    const fullPath = path.join(process.cwd(), filePath);
    const parseResult = await parser.parse(fullPath, file.type);

    // Create report record
    const report = await prisma.pulseReport.create({
      data: {
        projectId,
        fileName: file.name,
        filePath,
        reportType,
        reportDate: new Date(reportDate),
        parsedText: parseResult.text,
        parseStatus: parseResult.text ? 'SUCCESS' : 'FAILED',
        parseError: parseResult.text ? null : 'Failed to extract text from PDF'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: report.id,
        fileName: report.fileName,
        parseStatus: report.parseStatus,
        parsedText: report.parsedText,
        charCount: parseResult.charCount
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload report:', error);

    // Cleanup file on error
    if (filePath) {
      try {
        await fs.unlink(path.join(process.cwd(), filePath));
      } catch {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to upload report' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/api/pulse/reports/
git commit -m "feat(pulse): add PDF report upload API with parsing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5.2: AI Extraction Module

**Files:**
- Create: `lib/pulse/extractor.ts`

**Step 1: Create extractor**

```typescript
// lib/pulse/extractor.ts

import { getOpenAIClient } from '@/lib/openai';
import { EntryDimension, ReportType } from '@prisma/client';
import { AIExtractionResult, AICandidate } from './types';
import { DIMENSION_LABELS } from './constants';

const SYSTEM_PROMPT = `你是一个专业的项目状态分析助手。你的任务是从周报/日报中提取关键信息，归类到 12 个维度。

## 输出要求
1. 每条必须有【原文证据】- 从报告中摘录的原文（限 200 字内）
2. 不要编造 - 报告未提及的信息不得推断为事实
3. 同维度去冗余 - 高度相似的表述合并为一条，但保留所有证据

## 12 个维度定义
1. OVERALL_HEALTH: 总体健康度 - 项目整体状态的判断性描述
2. SCHEDULE: 进度与里程碑 - 时间节点、延期、提前等
3. SCOPE: 交付物与范围 - 需求变更、范围蔓延、交付物调整
4. RISKS: 风险 - 可能发生的负面事件
5. BLOCKERS: 问题与阻塞 - 已经发生、正在阻碍进展的问题
6. DEPENDENCIES: 依赖 - 对外部团队/资源的依赖
7. QUALITY: 质量 - Bug、稳定性、技术债务
8. RESOURCING: 资源 - 人力、产能、招聘
9. DECISIONS: 决策 - 需要上级拍板或支持的事项
10. KPI: 指标 - 数据、目标达成情况
11. PLAN_CREDIBILITY: 计划可信度 - 计划是否靠谱的判断
12. ALIGNMENT: 对齐风险 - 沟通、理解偏差、干系人问题

## 输出格式 (JSON)
{
  "candidates": [
    {
      "dimension": "RISKS",
      "title": "一句话标题（简洁明了）",
      "evidence_quote": "报告原文摘录（限200字）",
      "confidence": 0.9
    }
  ],
  "empty_dimensions": ["KPI", "QUALITY"],
  "warnings": ["报告未提及里程碑时间节点"]
}

请只输出 JSON，不要有其他文字。`;

export async function extractFromReport(
  parsedText: string,
  projectName: string,
  reportType: ReportType,
  reportDate: string,
  fileName: string
): Promise<AIExtractionResult> {
  const openai = await getOpenAIClient();

  const userPrompt = `## 报告信息
- 项目: ${projectName}
- 类型: ${reportType === 'DAILY' ? '日报' : reportType === 'WEEKLY' ? '周报' : '其他'}
- 日期: ${reportDate}
- 文件: ${fileName}

## 报告全文
${parsedText.slice(0, 30000)}

请提取项目状态条目。`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as AIExtractionResult;

    // Validate and normalize candidates
    const validDimensions = Object.keys(DIMENSION_LABELS);
    result.candidates = (result.candidates || []).filter((c: AICandidate) =>
      validDimensions.includes(c.dimension) &&
      c.title &&
      c.evidence_quote
    );

    result.empty_dimensions = result.empty_dimensions || [];
    result.warnings = result.warnings || [];

    return result;
  } catch (error) {
    console.error('AI extraction failed:', error);
    throw error;
  }
}
```

**Step 2: Commit**

```bash
git add lib/pulse/extractor.ts
git commit -m "feat(pulse): add AI extraction module for 12-dimension analysis

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5.3: Analysis Extract API

**Files:**
- Create: `app/api/pulse/analysis/extract/route.ts`

**Step 1: Create extract API**

```typescript
// app/api/pulse/analysis/extract/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractFromReport } from '@/lib/pulse/extractor';

// POST /api/pulse/analysis/extract
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId } = body;

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'reportId is required' },
        { status: 400 }
      );
    }

    // Get report with project
    const report = await prisma.pulseReport.findUnique({
      where: { id: reportId },
      include: { project: true }
    });

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    if (!report.parsedText) {
      return NextResponse.json(
        { success: false, error: 'Report has no parsed text' },
        { status: 400 }
      );
    }

    // Extract using AI
    const result = await extractFromReport(
      report.parsedText,
      report.project.name,
      report.reportType,
      report.reportDate.toISOString().split('T')[0],
      report.fileName
    );

    // Create analysis session
    const session = await prisma.pulseAnalysisSession.create({
      data: {
        reportId,
        aiOutputRaw: result as object,
        status: 'COMPLETED'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        candidates: result.candidates,
        empty_dimensions: result.empty_dimensions,
        warnings: result.warnings
      }
    }, { status: 201 });
  } catch (error) {
    console.error('AI extraction failed:', error);
    return NextResponse.json(
      { success: false, error: 'AI extraction failed' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add app/api/pulse/analysis/
git commit -m "feat(pulse): add AI extraction API endpoint

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 5.4: Batch Commit API

**Files:**
- Create: `app/api/pulse/entries/batch/route.ts`

**Step 1: Create batch API**

```typescript
// app/api/pulse/entries/batch/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateEmbedding } from '@/lib/pulse/similarity';
import { BatchOperation, EvidenceHistoryItem, Source } from '@/lib/pulse/types';

// POST /api/pulse/entries/batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, sessionId, operations } = body as {
      projectId: string;
      sessionId: string;
      operations: BatchOperation[];
    };

    if (!projectId || !operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let ignored = 0;

    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        if (op.action === 'ignore') {
          ignored++;
          continue;
        }

        // Generate embedding for the entry
        const text = op.title + ' ' + op.evidence;
        const embedding = await generateEmbedding(text);

        if (op.action === 'create') {
          await tx.pulseEntry.create({
            data: {
              projectId,
              dimension: op.dimension,
              title: op.title.trim(),
              evidenceCurrent: op.evidence.trim(),
              sourceCurrent: op.source,
              evidenceHistory: [],
              embedding
            }
          });
          created++;
        } else if (op.action === 'update' && op.targetEntryId) {
          // Get existing entry
          const existing = await tx.pulseEntry.findUnique({
            where: { id: op.targetEntryId }
          });

          if (existing) {
            // Append current evidence to history
            const historyItem: EvidenceHistoryItem = {
              evidence: existing.evidenceCurrent,
              source: existing.sourceCurrent as Source,
              addedAt: new Date().toISOString()
            };

            const currentHistory = (existing.evidenceHistory as EvidenceHistoryItem[]) || [];

            await tx.pulseEntry.update({
              where: { id: op.targetEntryId },
              data: {
                title: op.title.trim(),
                evidenceCurrent: op.evidence.trim(),
                sourceCurrent: op.source,
                evidenceHistory: [...currentHistory, historyItem],
                embedding
              }
            });
            updated++;
          }
        }
      }

      // Update project timestamp
      await tx.pulseProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() }
      });
    });

    // Get updated project
    const project = await prisma.pulseProject.findUnique({
      where: { id: projectId }
    });

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        ignored,
        projectUpdatedAt: project?.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Batch commit failed:', error);
    return NextResponse.json(
      { success: false, error: 'Batch commit failed' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add app/api/pulse/entries/batch/
git commit -m "feat(pulse): add batch commit API with embedding generation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 6: Frontend - Project List

### Task 6.1: Homepage Card

**Files:**
- Modify: `app/(dashboard)/page.tsx`

**Step 1: Read current homepage**

Read the file first to understand current structure.

**Step 2: Add project management card**

Add a new card for "项目管理" with FolderKanban icon, linking to `/pulse`.

**Step 3: Commit**

```bash
git add app/(dashboard)/page.tsx
git commit -m "feat(pulse): add project management card to homepage

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6.2: Header Navigation

**Files:**
- Modify: `components/Header.tsx`

**Step 1: Add pulse to navigation**

Add "项目管理" link to `/pulse` in the header navigation.

**Step 2: Commit**

```bash
git add components/Header.tsx
git commit -m "feat(pulse): add project management to header navigation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6.3: Project List Page

**Files:**
- Create: `app/(dashboard)/pulse/page.tsx`

**Step 1: Create project list page**

Create a page that:
- Fetches projects from API
- Displays project cards with stats (risks/blockers/decisions/total)
- Shows stale warning for projects >7 days old
- Has "新建项目" button
- Links to project detail page

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/
git commit -m "feat(pulse): add project list page with stats and stale warnings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6.4: Create Project Page

**Files:**
- Create: `app/(dashboard)/pulse/new/page.tsx`

**Step 1: Create new project page**

Simple form with project name input and submit button.

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/new/
git commit -m "feat(pulse): add create project page

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 7: Frontend - Project Detail & Entries

### Task 7.1: Project Detail Page

**Files:**
- Create: `app/(dashboard)/pulse/[projectId]/page.tsx`

**Step 1: Create project detail page**

- Header with project name, upload button, add entry button
- Dimension filter dropdown
- Search input
- Entries grouped by dimension with collapsible sections
- Each entry shows title, evidence snippet, source, edit/delete buttons
- Delete confirmation dialog with 5-second undo snackbar

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/[projectId]/
git commit -m "feat(pulse): add project detail page with entry management

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 7.2: Manual Entry Page

**Files:**
- Create: `app/(dashboard)/pulse/[projectId]/entries/new/page.tsx`

**Step 1: Create new entry page**

Form with:
- Title input
- Dimension select
- Evidence textarea
- Source fields (report type, date, file name)

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/[projectId]/entries/
git commit -m "feat(pulse): add manual entry creation page

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 7.3: Edit Entry Page

**Files:**
- Create: `app/(dashboard)/pulse/[projectId]/entries/[entryId]/page.tsx`

**Step 1: Create edit entry page**

Same form as new entry, pre-filled with existing data.
Shows evidence history in collapsible section.

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/[projectId]/entries/
git commit -m "feat(pulse): add entry edit page with evidence history

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 8: Frontend - Upload & Review

### Task 8.1: Upload Page

**Files:**
- Create: `app/(dashboard)/pulse/[projectId]/upload/page.tsx`

**Step 1: Create upload page**

- File drop zone / select
- Report type select (Daily/Weekly/Other)
- Report date picker
- Upload button
- After upload, redirect to review page

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/[projectId]/upload/
git commit -m "feat(pulse): add PDF upload page

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 8.2: Review Page

**Files:**
- Create: `app/(dashboard)/pulse/[projectId]/review/[sessionId]/page.tsx`

**Step 1: Create review page**

Complex page with:
- Warnings display at top
- Empty dimensions notice
- Candidates grouped by dimension
- Each candidate card with:
  - Editable title
  - Evidence display
  - Confidence badge
  - Action radio: Create / Update existing / Ignore
  - If "Update", show similar entries dropdown
- "确认入库" button at bottom

**Step 2: Commit**

```bash
git add app/(dashboard)/pulse/[projectId]/review/
git commit -m "feat(pulse): add AI extraction review page with deduplication

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 9: Testing & Polish

### Task 9.1: Build Verification

**Step 1: Full build**

Run: `npm run build`

Expected: Build succeeds with no TypeScript errors

**Step 2: Lint check**

Run: `npm run lint`

Expected: No lint errors

---

### Task 9.2: Manual Testing Checklist

Test each flow:
1. Create project
2. View project list with stats
3. Upload PDF report
4. Review AI extraction candidates
5. Batch commit entries
6. View entries by dimension
7. Edit entry (verify history)
8. Delete entry with undo
9. Delete project (confirm required)

---

### Task 9.3: Final Commit

```bash
git add -A
git commit -m "feat(pulse): complete Project Pulse V1.0

Features:
- Project CRUD with stats tracking
- PDF upload and AI extraction (12 dimensions)
- Hybrid similarity matching (keyword + embedding)
- Evidence history preservation
- Soft delete with 5-second undo
- Stale project warnings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Verification Checklist

- [ ] Prisma schema with 4 models and enums
- [ ] Projects API (list, create, detail, update, delete, stats)
- [ ] Entries API (list, create, detail, update, soft delete, undo, similar, batch)
- [ ] Report upload API with PDF parsing
- [ ] AI extraction API with 12 dimensions
- [ ] Similarity matching with keyword + embedding
- [ ] Homepage card linking to /pulse
- [ ] Header navigation
- [ ] Project list page with stats
- [ ] Project detail page with entries
- [ ] Upload page
- [ ] Review page with deduplication
- [ ] Entry create/edit pages
- [ ] Delete confirmation + undo
- [ ] Evidence history on update
- [ ] Stale warnings (>7 days)
- [ ] Build passes
- [ ] All changes committed
