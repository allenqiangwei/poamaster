# Feishu Alert Settings Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/feishu/alerts` settings page with 4 tabs (keyword rules, blacklist/whitelist, notification prefs, thresholds) and refactor signal-detector to load rules from the database.

**Architecture:** New Prisma models (`AlertRule`, `AlertSenderWhitelist`) + `FeishuChat` whitelist fields. 3 new API route groups under `/api/feishu/alert-*`. One new page (`app/feishu/alerts/page.tsx`) with MUI Tabs. Signal-detector loads rules from DB instead of hardcoded array. Existing blacklist page redirects here.

**Tech Stack:** Next.js App Router, MUI, Prisma ORM, PostgreSQL, Vitest

---

### Task 1: Prisma Schema — Add AlertRule, AlertSenderWhitelist, FeishuChat whitelist fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add models to schema**

Append these models at the end of `prisma/schema.prisma` (before the closing — after the last model):

```prisma
model AlertRule {
  id         String   @id @default(cuid())
  keyword    String
  signalType String
  severity   String   @default("MEDIUM")
  isSystem   Boolean  @default(false)
  isEnabled  Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([isEnabled])
  @@index([signalType])
}

model AlertSenderWhitelist {
  id         String   @id @default(cuid())
  senderId   String   @unique
  senderName String
  reason     String?
  createdAt  DateTime @default(now())

  @@index([senderId])
}
```

Also add to the existing `FeishuChat` model (after `blacklistedAt`):

```prisma
  isWhitelisted   Boolean  @default(false)
  whitelistedAt   DateTime?
```

**Step 2: Create migration**

Run: `npx prisma migrate dev --name add_alert_settings_models`

Expected: Migration created, schema applied. If shadow DB fails (see MEMORY.md migration gotchas), create migration manually:

```bash
npx prisma migrate dev --create-only --name add_alert_settings_models
```

Then edit the SQL to be correct and run:

```bash
npx prisma migrate dev
```

**Step 3: Seed system rules**

Create the data migration SQL. After the schema migration succeeds, run:

```bash
npx prisma db execute --file prisma/migrations/20260216_seed_alert_rules/seed.sql
```

Create `prisma/migrations/20260216_seed_alert_rules/seed.sql`:

```sql
-- Seed system-default alert rules (matching current signal-detector.ts RULES)
INSERT INTO "AlertRule" (id, keyword, "signalType", severity, "isSystem", "isEnabled", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CRITICAL', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '严重', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '崩溃', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '宕机', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '故障', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '事故', 'RISK', 'CRITICAL', true, true, now(), now()),
  (gen_random_uuid()::text, '报警', 'RISK', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '异常', 'RISK', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '风险', 'RISK', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '警告', 'RISK', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '告警', 'RISK', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '延期', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '卡住', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '阻塞', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '等待审批', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '搞不定', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '无法推进', 'BLOCKER', 'MEDIUM', true, true, now(), now()),
  (gen_random_uuid()::text, '紧急', 'ESCALATION', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '急需', 'ESCALATION', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '尽快处理', 'ESCALATION', 'HIGH', true, true, now(), now()),
  (gen_random_uuid()::text, '升级处理', 'ESCALATION', 'HIGH', true, true, now(), now());
```

**Step 4: Generate Prisma client**

Run: `npx prisma generate`

Then restart the dev server (Turbopack caches old Prisma client).

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AlertRule, AlertSenderWhitelist models and FeishuChat whitelist fields"
```

---

### Task 2: API — Alert Rules CRUD (`/api/feishu/alert-rules`)

**Files:**
- Create: `app/api/feishu/alert-rules/route.ts`
- Create: `app/api/feishu/alert-rules/[id]/route.ts`
- Create: `__tests__/api/feishu/alert-rules.test.ts`

**Step 1: Write tests**

Create `__tests__/api/feishu/alert-rules.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, mockVerifySession } from '../../setup';
import { authRequest, makeRequest } from '../../helpers/request';

// Must add alertRule and alertSenderWhitelist to mockPrisma in setup.ts first!
// For now we test the route handler logic.

describe('GET /api/feishu/alert-rules', () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockPrisma.alertRule.findMany.mockReset();
  });

  it('returns 401 without session', async () => {
    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = makeRequest('GET', '/api/feishu/alert-rules');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns rules list', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    const rules = [
      { id: '1', keyword: '严重', signalType: 'RISK', severity: 'CRITICAL', isSystem: true, isEnabled: true },
    ];
    mockPrisma.alertRule.findMany.mockResolvedValue(rules);

    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('GET', '/api/feishu/alert-rules');
    const res = await GET(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.rules).toEqual(rules);
  });

  it('filters by signalType', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    mockPrisma.alertRule.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('GET', '/api/feishu/alert-rules', {
      searchParams: { type: 'RISK' },
    });
    await GET(req);

    expect(mockPrisma.alertRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ signalType: 'RISK' }),
      })
    );
  });
});

describe('POST /api/feishu/alert-rules', () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockPrisma.alertRule.create.mockReset();
  });

  it('creates a new rule', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    mockPrisma.alertRule.create.mockResolvedValue({
      id: 'new-1', keyword: '测试', signalType: 'RISK', severity: 'HIGH',
      isSystem: false, isEnabled: true,
    });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '测试', signalType: 'RISK', severity: 'HIGH' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(mockPrisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        keyword: '测试',
        signalType: 'RISK',
        severity: 'HIGH',
        isSystem: false,
      }),
    });
  });

  it('rejects empty keyword', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '', signalType: 'RISK', severity: 'HIGH' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Update test setup to include new mock models**

Add to `__tests__/setup.ts` mockPrisma:

```ts
export const mockPrisma = {
  botConversation: makeMockModel(),
  botMessage: makeMockModel(),
  alertRule: makeMockModel(),
  alertSenderWhitelist: makeMockModel(),
  feishuChat: makeMockModel(),
  config: makeMockModel(),
};
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/feishu/alert-rules.test.ts`
Expected: FAIL — modules not found

**Step 4: Implement GET/POST route**

Create `app/api/feishu/alert-rules/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const where: any = {};
    if (type) where.signalType = type;

    const rules = await prisma.alertRule.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ success: true, rules });
  } catch (error) {
    console.error('[AlertRules] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { keyword, signalType, severity } = await request.json();
    if (!keyword?.trim() || !signalType || !severity) {
      return NextResponse.json({ error: 'keyword, signalType, severity are required' }, { status: 400 });
    }

    const validTypes = ['RISK', 'BLOCKER', 'ESCALATION'];
    const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!validTypes.includes(signalType) || !validSeverities.includes(severity)) {
      return NextResponse.json({ error: 'Invalid signalType or severity' }, { status: 400 });
    }

    const rule = await prisma.alertRule.create({
      data: { keyword: keyword.trim(), signalType, severity, isSystem: false },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('[AlertRules] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}
```

**Step 5: Implement PATCH/DELETE route**

Create `app/api/feishu/alert-rules/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const data: any = {};

    if (body.keyword !== undefined) data.keyword = body.keyword.trim();
    if (body.signalType !== undefined) data.signalType = body.signalType;
    if (body.severity !== undefined) data.severity = body.severity;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;

    const rule = await prisma.alertRule.update({ where: { id }, data });
    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('[AlertRules] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { id } = await params;

    // Check if system rule — cannot delete system rules
    const existing = await prisma.alertRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system rules' }, { status: 403 });
    }

    await prisma.alertRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AlertRules] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
```

**Step 6: Run tests**

Run: `npx vitest run __tests__/api/feishu/alert-rules.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add app/api/feishu/alert-rules/ __tests__/api/feishu/ __tests__/setup.ts
git commit -m "feat: add alert rules CRUD API with tests"
```

---

### Task 3: API — Whitelist management (`/api/feishu/alert-whitelist`)

**Files:**
- Create: `app/api/feishu/alert-whitelist/route.ts`

**Step 1: Implement the route**

Create `app/api/feishu/alert-whitelist/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'chat' | 'sender'

    if (type === 'sender') {
      const senders = await prisma.alertSenderWhitelist.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ success: true, senders });
    }

    // Default: chat whitelist + blacklist
    const [whitelisted, blacklisted] = await Promise.all([
      prisma.feishuChat.findMany({
        where: { isWhitelisted: true },
        orderBy: { whitelistedAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
      prisma.feishuChat.findMany({
        where: { isBlacklisted: true },
        orderBy: { blacklistedAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
    ]);

    return NextResponse.json({ success: true, whitelisted, blacklisted });
  } catch (error) {
    console.error('[AlertWhitelist] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch whitelist' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { type, id, name, reason } = await request.json();

    if (type === 'sender') {
      if (!id || !name) {
        return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
      }
      const entry = await prisma.alertSenderWhitelist.upsert({
        where: { senderId: id },
        create: { senderId: id, senderName: name, reason },
        update: { senderName: name, reason },
      });
      return NextResponse.json({ success: true, entry });
    }

    if (type === 'chat') {
      if (!id) {
        return NextResponse.json({ error: 'id (chatId) is required' }, { status: 400 });
      }
      await prisma.feishuChat.update({
        where: { chatId: id },
        data: { isWhitelisted: true, whitelistedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'type must be "chat" or "sender"' }, { status: 400 });
  } catch (error) {
    console.error('[AlertWhitelist] POST failed:', error);
    return NextResponse.json({ error: 'Failed to add to whitelist' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { type, id } = await request.json();

    if (type === 'sender') {
      await prisma.alertSenderWhitelist.delete({ where: { senderId: id } });
      return NextResponse.json({ success: true });
    }

    if (type === 'chat') {
      await prisma.feishuChat.update({
        where: { chatId: id },
        data: { isWhitelisted: false, whitelistedAt: null },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'type must be "chat" or "sender"' }, { status: 400 });
  } catch (error) {
    console.error('[AlertWhitelist] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to remove from whitelist' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/feishu/alert-whitelist/
git commit -m "feat: add alert whitelist API for chat and sender management"
```

---

### Task 4: API — Alert config (`/api/feishu/alert-config`)

**Files:**
- Create: `app/api/feishu/alert-config/route.ts`

**Step 1: Implement the route**

Create `app/api/feishu/alert-config/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

const ALERT_CONFIG_KEYS = [
  'alert.minNotifySeverity',
  'alert.notifyTargetChat',
  'alert.silentStart',
  'alert.silentEnd',
  'alert.cooldownMinutes',
  'alert.batchIntervalMinutes',
];

const DEFAULTS: Record<string, string> = {
  'alert.minNotifySeverity': 'HIGH',
  'alert.silentStart': '22:00',
  'alert.silentEnd': '08:00',
  'alert.cooldownMinutes': '30',
  'alert.batchIntervalMinutes': '5',
};

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const configs = await prisma.config.findMany({
      where: { key: { in: ALERT_CONFIG_KEYS } },
    });

    // Merge with defaults
    const result: Record<string, string> = { ...DEFAULTS };
    for (const c of configs) {
      result[c.key] = c.value;
    }

    // Also fetch the notify target chat from feishu.chatId if alert-specific one is not set
    if (!result['alert.notifyTargetChat']) {
      const feishuChat = await prisma.config.findUnique({ where: { key: 'feishu.chatId' } });
      if (feishuChat) result['alert.notifyTargetChat'] = feishuChat.value;
    }

    return NextResponse.json({ success: true, config: result });
  } catch (error) {
    console.error('[AlertConfig] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await request.json();
    const updates: Array<{ key: string; value: string }> = [];

    if (body.minNotifySeverity) updates.push({ key: 'alert.minNotifySeverity', value: body.minNotifySeverity });
    if (body.silentStart) updates.push({ key: 'alert.silentStart', value: body.silentStart });
    if (body.silentEnd) updates.push({ key: 'alert.silentEnd', value: body.silentEnd });
    if (body.cooldownMinutes !== undefined) updates.push({ key: 'alert.cooldownMinutes', value: String(body.cooldownMinutes) });
    if (body.batchIntervalMinutes !== undefined) updates.push({ key: 'alert.batchIntervalMinutes', value: String(body.batchIntervalMinutes) });

    for (const { key, value } of updates) {
      await prisma.config.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AlertConfig] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/feishu/alert-config/
git commit -m "feat: add alert config API for notification and threshold settings"
```

---

### Task 5: Frontend — Alert Settings Page with 4 Tabs

**Files:**
- Create: `app/feishu/alerts/page.tsx`

**Context:** This project uses `designTokens as dt` from `@/lib/theme` and `useResponsive()` from `@/hooks/useResponsive` for responsive design. Follow the pattern in `app/feishu/chats/page.tsx` for structure. The page uses `'use client'` directive and MUI components.

**Step 1: Create the page with Tab 1 (keyword rules)**

Create `app/feishu/alerts/page.tsx`. This is a large file — implement all 4 tabs. The page structure:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Typography, Box, Tabs, Tab, Card, TextField, Select, MenuItem,
  FormControl, InputLabel, Switch, IconButton, Button, Chip, Alert,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  alpha, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';

// ── Types ────────────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  keyword: string;
  signalType: string;
  severity: string;
  isSystem: boolean;
  isEnabled: boolean;
}

interface WhitelistedChat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  whitelistedAt: string | null;
  _count: { messages: number };
}

interface BlacklistedChat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  blacklistedAt: string | null;
  _count: { messages: number };
}

interface SenderWhitelist {
  id: string;
  senderId: string;
  senderName: string;
  reason: string | null;
}

interface AlertConfig {
  'alert.minNotifySeverity': string;
  'alert.notifyTargetChat': string;
  'alert.silentStart': string;
  'alert.silentEnd': string;
  'alert.cooldownMinutes': string;
  'alert.batchIntervalMinutes': string;
}

const SIGNAL_TYPES = ['RISK', 'BLOCKER', 'ESCALATION'] as const;
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const SIGNAL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  RISK: { label: '风险', color: dt.danger.main },
  BLOCKER: { label: '阻塞', color: dt.warning.main },
  ESCALATION: { label: '升级', color: dt.purple.main },
};

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: '严重', color: dt.danger.main },
  HIGH: { label: '高', color: '#ef6c00' },
  MEDIUM: { label: '中', color: dt.warning.main },
  LOW: { label: '低', color: dt.text.muted },
};

// ── Main Component ──────────────────────────────────────────────────

export default function FeishuAlertsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useResponsive();

  // Tab from URL query: ?tab=blacklist maps to tab 1
  const tabMap: Record<string, number> = { rules: 0, blacklist: 1, notify: 2, threshold: 3 };
  const initialTab = tabMap[searchParams.get('tab') || 'rules'] ?? 0;
  const [tab, setTab] = useState(initialTab);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => router.push('/feishu')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">预警设置</Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={isMobile ? 'auto' : false}
        sx={{ mb: 3, borderBottom: `1px solid ${dt.border.subtle}` }}
      >
        <Tab label="关键词规则" />
        <Tab label="黑白名单" />
        <Tab label="通知设置" />
        <Tab label="阈值设置" />
      </Tabs>

      {tab === 0 && <RulesTab />}
      {tab === 1 && <BlackWhitelistTab />}
      {tab === 2 && <NotifyTab />}
      {tab === 3 && <ThresholdTab />}
    </Box>
  );
}

// ── Tab 1: Keyword Rules ────────────────────────────────────────────

function RulesTab() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [formKeyword, setFormKeyword] = useState('');
  const [formType, setFormType] = useState<string>('RISK');
  const [formSeverity, setFormSeverity] = useState<string>('MEDIUM');
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/feishu/alert-rules?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setRules(data.rules);
      else setError(data.error);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const openAdd = () => {
    setEditRule(null);
    setFormKeyword('');
    setFormType('RISK');
    setFormSeverity('MEDIUM');
    setDialogOpen(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditRule(rule);
    setFormKeyword(rule.keyword);
    setFormType(rule.signalType);
    setFormSeverity(rule.severity);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formKeyword.trim()) return;
    setSaving(true);
    try {
      if (editRule) {
        await fetch(`/api/feishu/alert-rules/${editRule.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: formKeyword, signalType: formType, severity: formSeverity }),
        });
      } else {
        await fetch('/api/feishu/alert-rules', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: formKeyword, signalType: formType, severity: formSeverity }),
        });
      }
      setDialogOpen(false);
      loadRules();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    await fetch(`/api/feishu/alert-rules/${rule.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: !rule.isEnabled }),
    });
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isEnabled: !r.isEnabled } : r));
  };

  const handleDelete = async (rule: AlertRule) => {
    await fetch(`/api/feishu/alert-rules/${rule.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setRules(prev => prev.filter(r => r.id !== rule.id));
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>信号类型</InputLabel>
          <Select value={typeFilter} label="信号类型" onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="all">全部</MenuItem>
            {SIGNAL_TYPES.map(t => (
              <MenuItem key={t} value={t}>{SIGNAL_TYPE_LABELS[t].label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAdd}>
          添加规则
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {rules.map(rule => {
          const typeConfig = SIGNAL_TYPE_LABELS[rule.signalType] || { label: rule.signalType, color: dt.text.muted };
          const sevConfig = SEVERITY_LABELS[rule.severity] || { label: rule.severity, color: dt.text.muted };

          return (
            <Box
              key={rule.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.25,
                borderRadius: 1,
                bgcolor: rule.isEnabled ? 'transparent' : alpha(dt.text.muted, 0.04),
                opacity: rule.isEnabled ? 1 : 0.5,
                borderBottom: `1px solid ${dt.border.subtle}`,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 80, flex: 1 }}>
                {rule.keyword}
              </Typography>
              <Chip
                label={typeConfig.label}
                size="small"
                sx={{ bgcolor: alpha(typeConfig.color, 0.1), color: typeConfig.color, fontWeight: 600, fontSize: '0.7rem' }}
              />
              <Chip
                label={sevConfig.label}
                size="small"
                sx={{ bgcolor: alpha(sevConfig.color, 0.1), color: sevConfig.color, fontWeight: 600, fontSize: '0.7rem' }}
              />
              {rule.isSystem && (
                <Chip label="预设" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
              )}
              <Switch
                checked={rule.isEnabled}
                onChange={() => handleToggle(rule)}
                size="small"
              />
              {!rule.isSystem && (
                <>
                  <IconButton size="small" onClick={() => openEdit(rule)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(rule)} sx={{ color: dt.danger.main }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editRule ? '编辑规则' : '添加规则'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="关键词" value={formKeyword} onChange={e => setFormKeyword(e.target.value)} fullWidth autoFocus />
            <FormControl fullWidth>
              <InputLabel>信号类型</InputLabel>
              <Select value={formType} label="信号类型" onChange={e => setFormType(e.target.value)}>
                {SIGNAL_TYPES.map(t => <MenuItem key={t} value={t}>{SIGNAL_TYPE_LABELS[t].label} ({t})</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>严重等级</InputLabel>
              <Select value={formSeverity} label="严重等级" onChange={e => setFormSeverity(e.target.value)}>
                {SEVERITIES.map(s => <MenuItem key={s} value={s}>{SEVERITY_LABELS[s].label} ({s})</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !formKeyword.trim()}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Tab 2: Blacklist / Whitelist ────────────────────────────────────

function BlackWhitelistTab() {
  const [whitelisted, setWhitelisted] = useState<WhitelistedChat[]>([]);
  const [blacklisted, setBlacklisted] = useState<BlacklistedChat[]>([]);
  const [senders, setSenders] = useState<SenderWhitelist[]>([]);
  const [loading, setLoading] = useState(true);

  // Add sender dialog
  const [senderDialogOpen, setSenderDialogOpen] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [senderId, setSenderId] = useState('');
  const [senderReason, setSenderReason] = useState('');

  // Add chat whitelist dialog
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [availableChats, setAvailableChats] = useState<Array<{ chatId: string; name: string | null; chatType: string }>>([]);
  const [selectedChatId, setSelectedChatId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chatRes, senderRes] = await Promise.all([
        fetch('/api/feishu/alert-whitelist?type=chat', { credentials: 'include' }),
        fetch('/api/feishu/alert-whitelist?type=sender', { credentials: 'include' }),
      ]);
      const chatData = await chatRes.json();
      const senderData = await senderRes.json();
      if (chatData.success) {
        setWhitelisted(chatData.whitelisted || []);
        setBlacklisted(chatData.blacklisted || []);
      }
      if (senderData.success) setSenders(senderData.senders || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeBlacklist = async (chatId: string) => {
    await fetch('/api/feishu/chats', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, isBlacklisted: false }),
    });
    setBlacklisted(prev => prev.filter(c => c.chatId !== chatId));
  };

  const removeWhitelist = async (chatId: string) => {
    await fetch('/api/feishu/alert-whitelist', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chat', id: chatId }),
    });
    setWhitelisted(prev => prev.filter(c => c.chatId !== chatId));
  };

  const removeSender = async (sid: string) => {
    await fetch('/api/feishu/alert-whitelist', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'sender', id: sid }),
    });
    setSenders(prev => prev.filter(s => s.senderId !== sid));
  };

  const addSender = async () => {
    if (!senderId.trim() || !senderName.trim()) return;
    await fetch('/api/feishu/alert-whitelist', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'sender', id: senderId.trim(), name: senderName.trim(), reason: senderReason.trim() || null }),
    });
    setSenderDialogOpen(false);
    setSenderId(''); setSenderName(''); setSenderReason('');
    load();
  };

  const openChatWhitelist = async () => {
    // Load non-blacklisted, non-whitelisted chats
    const res = await fetch('/api/feishu/chats?limit=100', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      const existing = new Set(whitelisted.map(w => w.chatId));
      setAvailableChats(data.chats.filter((c: any) => !existing.has(c.chatId)));
    }
    setChatDialogOpen(true);
  };

  const addChatWhitelist = async () => {
    if (!selectedChatId) return;
    await fetch('/api/feishu/alert-whitelist', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chat', id: selectedChatId }),
    });
    setChatDialogOpen(false);
    setSelectedChatId('');
    load();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Chat blacklist */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            群聊黑名单
            <Chip label={blacklisted.length} size="small" sx={{ ml: 1, height: 20 }} />
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {blacklisted.length === 0 ? (
            <Typography variant="body2" color="text.secondary">暂无黑名单群聊</Typography>
          ) : blacklisted.map(chat => (
            <Box key={chat.chatId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${dt.border.subtle}` }}>
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{chat.name || chat.chatId}</Typography>
              <Chip label={chat.chatType === 'group' ? '群聊' : '私聊'} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
              {chat.blacklistedAt && (
                <Typography variant="caption" sx={{ color: dt.text.muted }}>
                  {new Date(chat.blacklistedAt).toLocaleDateString('zh-CN')}
                </Typography>
              )}
              <Button size="small" onClick={() => removeBlacklist(chat.chatId)}>移除</Button>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>

      {/* Chat whitelist */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            群聊白名单
            <Chip label={whitelisted.length} size="small" sx={{ ml: 1, height: 20 }} />
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 1 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={openChatWhitelist}>添加白名单群聊</Button>
          </Box>
          {whitelisted.length === 0 ? (
            <Typography variant="body2" color="text.secondary">暂无白名单群聊</Typography>
          ) : whitelisted.map(chat => (
            <Box key={chat.chatId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${dt.border.subtle}` }}>
              <ShieldIcon sx={{ fontSize: 16, color: dt.success.main }} />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{chat.name || chat.chatId}</Typography>
              <Button size="small" color="error" onClick={() => removeWhitelist(chat.chatId)}>移除</Button>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>

      {/* Sender whitelist */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            发送人白名单
            <Chip label={senders.length} size="small" sx={{ ml: 1, height: 20 }} />
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 1 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setSenderDialogOpen(true)}>添加发送人</Button>
          </Box>
          {senders.length === 0 ? (
            <Typography variant="body2" color="text.secondary">暂无白名单发送人</Typography>
          ) : senders.map(s => (
            <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${dt.border.subtle}` }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.senderName}</Typography>
              <Typography variant="caption" sx={{ color: dt.text.muted, fontFamily: 'monospace' }}>{s.senderId}</Typography>
              {s.reason && <Chip label={s.reason} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />}
              <Box sx={{ flex: 1 }} />
              <Button size="small" color="error" onClick={() => removeSender(s.senderId)}>移除</Button>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>

      {/* Add sender dialog */}
      <Dialog open={senderDialogOpen} onClose={() => setSenderDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加发送人白名单</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="发送人ID" value={senderId} onChange={e => setSenderId(e.target.value)} fullWidth />
            <TextField label="发送人名称" value={senderName} onChange={e => setSenderName(e.target.value)} fullWidth />
            <TextField label="原因（可选）" value={senderReason} onChange={e => setSenderReason(e.target.value)} fullWidth placeholder="如：机器人" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSenderDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={addSender} disabled={!senderId.trim() || !senderName.trim()}>添加</Button>
        </DialogActions>
      </Dialog>

      {/* Add chat whitelist dialog */}
      <Dialog open={chatDialogOpen} onClose={() => setChatDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>选择群聊加入白名单</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>选择群聊</InputLabel>
            <Select value={selectedChatId} label="选择群聊" onChange={e => setSelectedChatId(e.target.value)}>
              {availableChats.map(c => (
                <MenuItem key={c.chatId} value={c.chatId}>
                  {c.name || c.chatId} ({c.chatType === 'group' ? '群聊' : '私聊'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChatDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={addChatWhitelist} disabled={!selectedChatId}>添加</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Tab 3: Notification Settings ────────────────────────────────────

function NotifyTab() {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/feishu/alert-config', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.success) setConfig(data.config); })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await fetch('/api/feishu/alert-config', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minNotifySeverity: config['alert.minNotifySeverity'],
          silentStart: config['alert.silentStart'],
          silentEnd: config['alert.silentEnd'],
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <FormControl fullWidth>
        <InputLabel>最低通知等级</InputLabel>
        <Select
          value={config['alert.minNotifySeverity']}
          label="最低通知等级"
          onChange={e => setConfig({ ...config, 'alert.minNotifySeverity': e.target.value })}
        >
          {SEVERITIES.map(s => (
            <MenuItem key={s} value={s}>{SEVERITY_LABELS[s].label} ({s})</MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="通知目标群聊"
        value={config['alert.notifyTargetChat'] || ''}
        disabled
        helperText="在系统设置中配置 feishu.chatId"
        fullWidth
      />

      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="静默开始"
          value={config['alert.silentStart']}
          onChange={e => setConfig({ ...config, 'alert.silentStart': e.target.value })}
          placeholder="22:00"
          sx={{ flex: 1 }}
        />
        <TextField
          label="静默结束"
          value={config['alert.silentEnd']}
          onChange={e => setConfig({ ...config, 'alert.silentEnd': e.target.value })}
          placeholder="08:00"
          sx={{ flex: 1 }}
        />
      </Box>

      <Box>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
        {saved && <Typography variant="caption" sx={{ ml: 2, color: dt.success.main }}>已保存</Typography>}
      </Box>
    </Box>
  );
}

// ── Tab 4: Threshold Settings ───────────────────────────────────────

function ThresholdTab() {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/feishu/alert-config', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.success) setConfig(data.config); })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await fetch('/api/feishu/alert-config', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooldownMinutes: parseInt(config['alert.cooldownMinutes']) || 30,
          batchIntervalMinutes: parseInt(config['alert.batchIntervalMinutes']) || 5,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <TextField
        label="重复预警冷却时间"
        type="number"
        value={config['alert.cooldownMinutes']}
        onChange={e => setConfig({ ...config, 'alert.cooldownMinutes': e.target.value })}
        helperText="同一群聊同类型信号在此时间内不重复创建（分钟）"
        slotProps={{ input: { endAdornment: <Typography variant="caption" sx={{ ml: 1 }}>分钟</Typography> } }}
        fullWidth
      />

      <TextField
        label="批量分析间隔"
        type="number"
        value={config['alert.batchIntervalMinutes']}
        onChange={e => setConfig({ ...config, 'alert.batchIntervalMinutes': e.target.value })}
        helperText="批量分析消息的时间间隔（分钟）"
        slotProps={{ input: { endAdornment: <Typography variant="caption" sx={{ ml: 1 }}>分钟</Typography> } }}
        fullWidth
      />

      <Box>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
        {saved && <Typography variant="caption" sx={{ ml: 2, color: dt.success.main }}>已保存</Typography>}
      </Box>
    </Box>
  );
}
```

**Note:** The `useSearchParams()` call needs a Suspense boundary in Next.js 15+. Wrap the page export if needed — but since this is a `'use client'` page, it should work. If build fails, wrap with Suspense.

**Step 2: Verify page loads**

Navigate to `http://localhost:3030/feishu/alerts` in the browser.

**Step 3: Commit**

```bash
git add app/feishu/alerts/
git commit -m "feat: add alert settings page with 4 tabs (rules, blacklist, notify, threshold)"
```

---

### Task 6: Navigation — Add entry points to alert settings

**Files:**
- Modify: `app/feishu/page.tsx` (add alert settings card entry)
- Modify: `app/feishu/chats/page.tsx` (change blacklist button to link to /feishu/alerts?tab=blacklist)
- Modify: `app/feishu/blacklist/page.tsx` (redirect to /feishu/alerts?tab=blacklist)

**Step 1: Add card to feishu main page**

In `app/feishu/page.tsx`, after the Team Pulse card (around line 212), add:

```tsx
import {
  // ... existing imports plus:
  NotificationsActive as AlertIcon,
} from '@mui/icons-material';

// After the Team Pulse card:
<Card sx={{ mb: 4 }}>
  <CardActionArea onClick={() => router.push('/feishu/alerts')}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <AlertIcon color="warning" sx={{ fontSize: 40 }} />
      <Box>
        <Typography variant="h6">预警设置</Typography>
        <Typography variant="body2" color="text.secondary">
          管理预警关键词规则、黑白名单、通知偏好和阈值配置
        </Typography>
      </Box>
    </CardContent>
  </CardActionArea>
</Card>
```

**Step 2: Change blacklist button in chats page**

In `app/feishu/chats/page.tsx`, change the blacklist button's `onClick`:

```tsx
// From:
onClick={() => router.push('/feishu/blacklist')}
// To:
onClick={() => router.push('/feishu/alerts?tab=blacklist')}
```

**Step 3: Redirect blacklist page**

Replace `app/feishu/blacklist/page.tsx` content with a redirect:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FeishuBlacklistRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/feishu/alerts?tab=blacklist');
  }, [router]);
  return null;
}
```

**Step 4: Commit**

```bash
git add app/feishu/page.tsx app/feishu/chats/page.tsx app/feishu/blacklist/page.tsx
git commit -m "feat: add alert settings entry points and redirect old blacklist page"
```

---

### Task 7: Refactor signal-detector to load rules from database

**Files:**
- Modify: `services/feishu-listener/src/signal-detector.ts`

**Step 1: Replace hardcoded RULES with DB loading**

Replace the `RULES` constant and add `loadRules()` + whitelist/cooldown checks:

```ts
// Replace lines 20-34 (the RULES constant) with:

interface SignalRule {
  patterns: string[];
  type: string;
  severity: string;
}

let rules: SignalRule[] = [];

// Fallback rules if DB is unavailable
const FALLBACK_RULES: SignalRule[] = [
  { patterns: ['CRITICAL', '严重', '崩溃', '宕机', '故障', '事故'], type: 'RISK', severity: 'CRITICAL' },
  { patterns: ['报警', '异常', '风险', '警告', '告警'], type: 'RISK', severity: 'HIGH' },
  { patterns: ['延期', '卡住', '阻塞', '等待审批', '搞不定', '无法推进'], type: 'BLOCKER', severity: 'MEDIUM' },
  { patterns: ['紧急', '急需', '尽快处理', '升级处理'], type: 'ESCALATION', severity: 'HIGH' },
];

/** Load alert rules from database. Call on startup and periodically. */
export async function loadRules(): Promise<void> {
  if (!prisma) { rules = FALLBACK_RULES; return; }
  try {
    const dbRules = await prisma.alertRule.findMany({ where: { isEnabled: true } });
    if (dbRules.length === 0) {
      rules = FALLBACK_RULES;
      return;
    }
    // Group rules by type+severity to combine patterns
    const grouped = new Map<string, string[]>();
    for (const r of dbRules) {
      const key = `${r.signalType}:${r.severity}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r.keyword);
    }
    rules = Array.from(grouped.entries()).map(([key, patterns]) => {
      const [type, severity] = key.split(':');
      return { patterns, type, severity };
    });
    logger.info(`[Signal] Loaded ${dbRules.length} alert rules (${rules.length} groups)`);
  } catch (err: any) {
    logger.error(`[Signal] Failed to load rules from DB, using fallback: ${err.message}`);
    rules = FALLBACK_RULES;
  }
}

// Whitelist cache (refreshed with rules)
let whitelistedChatIds = new Set<string>();
let whitelistedSenderIds = new Set<string>();

async function loadWhitelists(): Promise<void> {
  if (!prisma) return;
  try {
    const [chats, senders] = await Promise.all([
      prisma.feishuChat.findMany({ where: { isWhitelisted: true }, select: { chatId: true } }),
      prisma.alertSenderWhitelist.findMany({ select: { senderId: true } }),
    ]);
    whitelistedChatIds = new Set(chats.map(c => c.chatId));
    whitelistedSenderIds = new Set(senders.map(s => s.senderId));
  } catch { /* ignore, use empty sets */ }
}

/** Reload rules + whitelists. Call on startup and every 5 minutes. */
export async function reloadConfig(): Promise<void> {
  await Promise.all([loadRules(), loadWhitelists()]);
}
```

**Step 2: Update detectSignals to use whitelist and cooldown checks**

In the `detectSignals` function, add whitelist checks at the top and cooldown check before creating the signal:

```ts
export async function detectSignals(msg: MessageInfo): Promise<void> {
  if (!prisma) return;
  if (msg.chatType !== 'group' || !msg.content) return;
  if (msg.content.includes('运营信号 [')) return;

  // Whitelist checks
  if (whitelistedChatIds.has(msg.chatId)) return;
  if (whitelistedSenderIds.has(msg.senderId)) return;  // Need senderId in MessageInfo

  const contentLower = msg.content.toLowerCase();

  for (const rule of rules) {
    const matched = rule.patterns.some(p => contentLower.includes(p.toLowerCase()));
    if (!matched) continue;

    const matchedPattern = rule.patterns.find(p => contentLower.includes(p.toLowerCase())) || '';
    const preview = msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content;

    try {
      // Cooldown check — same chatId + same signalType within cooldown period
      const cooldownMinutes = await getCooldownMinutes();
      const cooldownSince = new Date(Date.now() - cooldownMinutes * 60_000);
      const recentSignal = await prisma.chatSignal.findFirst({
        where: {
          chatId: msg.chatId,
          signalType: rule.type,
          createdAt: { gte: cooldownSince },
        },
      });
      if (recentSignal) {
        logger.info(`[Signal] Skipped ${rule.type} in ${msg.chatId} (cooldown)`);
        break;
      }

      await prisma.chatSignal.create({
        data: {
          chatId: msg.chatId,
          signalType: rule.type,
          severity: rule.severity,
          title: `[${matchedPattern}] ${msg.senderName}`,
          summary: preview,
          messageIds: [msg.messageId],
          relatedUser: msg.senderName,
          source: 'realtime',
        },
      });

      logger.info(`[Signal] ${rule.type}/${rule.severity} detected in ${msg.chatId}: ${matchedPattern}`);

      // Check notification config before sending
      if (await shouldNotify(rule.severity)) {
        sendSignalAlert(rule.type, rule.severity, msg.senderName, preview, msg.chatId)
          .catch(err => logger.error(`[Signal] Alert send failed: ${err.message}`));
      }
    } catch (err: any) {
      logger.error(`[Signal] Failed to create signal: ${err.message}`);
    }

    break;
  }
}

async function getCooldownMinutes(): Promise<number> {
  const cfg = await getConfig('alert.cooldownMinutes');
  return parseInt(cfg) || 30;
}

async function shouldNotify(severity: string): Promise<boolean> {
  const minSeverity = await getConfig('alert.minNotifySeverity') || 'HIGH';
  const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const minLevel = levels.indexOf(minSeverity);
  const currentLevel = levels.indexOf(severity);
  if (currentLevel < minLevel) return false;

  // Silent hours check
  const silentStart = await getConfig('alert.silentStart') || '22:00';
  const silentEnd = await getConfig('alert.silentEnd') || '08:00';
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;

  const [startH, startM] = silentStart.split(':').map(Number);
  const [endH, endM] = silentEnd.split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Handle overnight silent period (e.g. 22:00 - 08:00)
  if (startTime > endTime) {
    if (currentTime >= startTime || currentTime < endTime) return false;
  } else {
    if (currentTime >= startTime && currentTime < endTime) return false;
  }

  return true;
}
```

**Step 3: Add senderId to MessageInfo**

Update the `MessageInfo` interface to include `senderId`:

```ts
interface MessageInfo {
  messageId: string;
  chatId: string;
  senderId: string;  // <-- ADD THIS
  senderName: string;
  content: string;
  chatType: string;
}
```

Ensure the caller (in `websocket.ts` or wherever `detectSignals` is called) passes `senderId`.

**Step 4: Call reloadConfig on startup**

In the `initSignalDetector` function, call `reloadConfig` and set up a periodic refresh:

```ts
export function initSignalDetector(prismaClient: PrismaClient) {
  prisma = prismaClient;
  reloadConfig();
  // Refresh rules every 5 minutes
  setInterval(() => reloadConfig(), 5 * 60_000);
}
```

**Step 5: Commit**

```bash
git add services/feishu-listener/src/signal-detector.ts
git commit -m "feat: load alert rules from DB, add whitelist/cooldown/silent-hours checks"
```

---

### Task 8: Build verification

**Step 1: Run Prisma generate**

Run: `npx prisma generate`

**Step 2: Check build**

Run: `npx next build`

Fix any TypeScript errors. Common issues:
- `useSearchParams()` without Suspense boundary → wrap with `<Suspense>`
- Missing `senderId` in `detectSignals` call sites

**Step 3: Verify tests pass**

Run: `npx vitest run`

**Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build and test issues for alert settings"
```

---

## Summary of All Files

| Action | File |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `prisma/migrations/20260216_seed_alert_rules/seed.sql` |
| Create | `app/api/feishu/alert-rules/route.ts` |
| Create | `app/api/feishu/alert-rules/[id]/route.ts` |
| Create | `app/api/feishu/alert-whitelist/route.ts` |
| Create | `app/api/feishu/alert-config/route.ts` |
| Create | `app/feishu/alerts/page.tsx` |
| Modify | `app/feishu/page.tsx` |
| Modify | `app/feishu/chats/page.tsx` |
| Modify | `app/feishu/blacklist/page.tsx` |
| Modify | `services/feishu-listener/src/signal-detector.ts` |
| Modify | `__tests__/setup.ts` |
| Create | `__tests__/api/feishu/alert-rules.test.ts` |
