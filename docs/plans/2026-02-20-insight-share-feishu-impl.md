# Insight Share to Feishu — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a share button to insight briefing cards that generates a professional PDF and sends it to Feishu, marking the card as COO-focused.

**Architecture:** Server-side Puppeteer renders an HTML template into a PDF buffer, which is uploaded to Feishu via `im/v1/files` multipart API, then sent as a file message to the configured chat. The InsightCard model gains `isCooFocus` and `sharedAt` fields.

**Tech Stack:** Next.js App Router, Puppeteer, Feishu Open API (im/v1/files + im/v1/messages), Prisma, MUI

---

### Task 1: Add isCooFocus and sharedAt to InsightCard Schema

**Files:**
- Modify: `prisma/schema.prisma:500-524` (InsightCard model)

**Step 1: Add two new fields to the InsightCard model**

In `prisma/schema.prisma`, find the `model InsightCard` block and add these two fields after `viewedAt`:

```prisma
model InsightCard {
  id          String          @id @default(cuid())
  briefingId  String
  topicId     String?
  category    String
  priority    String          @default("medium")
  title       String
  summary     String
  details     String
  impact      String?
  action      String?
  sources     Json            @default("[]")
  relatedData Json            @default("{}")
  feedback    Int?
  viewedAt    DateTime?
  isCooFocus  Boolean         @default(false)
  sharedAt    DateTime?
  createdAt   DateTime        @default(now())
  comboId     String?
  briefing    InsightBriefing @relation(fields: [briefingId], references: [id])
  combo       KeywordCombo?   @relation(fields: [comboId], references: [id])
  topic       InsightTopic?   @relation(fields: [topicId], references: [id])

  @@index([briefingId])
  @@index([topicId])
  @@index([comboId])
}
```

**Step 2: Push schema to database**

Run: `npx prisma db push`
Expected: Schema synced successfully.

**Step 3: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma client generated.

**Important:** After `prisma generate`, the dev server MUST be restarted — Turbopack caches old Prisma client.

---

### Task 2: Install Puppeteer

**Step 1: Install puppeteer**

Run: `npm install puppeteer`

This installs both the package and a bundled Chromium binary.

**Step 2: Verify installation**

Run: `node -e "const pup = require('puppeteer'); console.log('OK, version:', require('puppeteer/package.json').version)"`
Expected: `OK, version: <some version>`

---

### Task 3: Create PDF Report Generator

**Files:**
- Create: `lib/insights/pdf-report.ts`

**Step 1: Create the PDF generator module**

Create `lib/insights/pdf-report.ts` with the following content. This module takes an InsightCard-like object and returns a PDF Buffer using Puppeteer.

```typescript
import puppeteer from 'puppeteer';

interface PDFCardData {
  title: string;
  category: string;
  priority: string;
  summary: string;
  details: string;
  impact: string | null;
  action: string | null;
  sources: Array<{ title: string; url: string }>;
  createdAt: string; // ISO date string
}

// Category display config (mirrors frontend CATEGORY_CONFIG)
const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  risk: { label: '风险洞察', color: '#ef4444' },
  industry: { label: '行业洞察', color: '#3b82f6' },
  competitor: { label: '竞品洞察', color: '#8b5cf6' },
  internal: { label: '内部洞察', color: '#06b6d4' },
  tech: { label: '技术洞察', color: '#10b981' },
  opportunity: { label: '机会洞察', color: '#f59e0b' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  high: { label: '高优先级', color: '#ef4444' },
  medium: { label: '中优先级', color: '#f59e0b' },
  low: { label: '低优先级', color: '#94a3b8' },
};

/**
 * Convert simple markdown to HTML (bold, headers, lists, paragraphs).
 */
function markdownToHtml(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div style="height:8px"></div>';
      if (trimmed.startsWith('### '))
        return `<h4 style="margin:16px 0 8px;font-size:14px;color:#0f172a;font-weight:600">${trimmed.slice(4)}</h4>`;
      if (trimmed.startsWith('## '))
        return `<h3 style="margin:20px 0 8px;font-size:16px;color:#0f172a;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:6px">${trimmed.slice(3)}</h3>`;
      if (trimmed.startsWith('- '))
        return `<div style="display:flex;gap:8px;margin:4px 0 4px 12px"><span style="color:#3b82f6">›</span><span>${boldify(trimmed.slice(2))}</span></div>`;
      return `<p style="margin:4px 0;line-height:1.7">${boldify(trimmed)}</p>`;
    })
    .join('\n');
}

function boldify(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function buildHTML(card: PDFCardData): string {
  const cat = CATEGORY_MAP[card.category] || { label: card.category, color: '#94a3b8' };
  const pri = PRIORITY_MAP[card.priority] || { label: card.priority, color: '#94a3b8' };
  const dateStr = new Date(card.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #334155;
    font-size: 13px;
    line-height: 1.6;
    background: #fff;
  }
  .page {
    width: 595px; /* A4 width at 72dpi */
    min-height: 842px;
    padding: 48px 56px;
    position: relative;
  }
  /* Color bar at top */
  .color-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: ${cat.color};
  }
  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #e2e8f0;
  }
  .brand {
    font-size: 11px;
    color: #94a3b8;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .meta {
    text-align: right;
    font-size: 11px;
    color: #94a3b8;
  }
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: ${cat.color};
    margin-bottom: 4px;
  }
  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: ${pri.color};
    border: 1px solid ${pri.color};
    margin-left: 8px;
  }
  /* Title */
  .title {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
    margin-bottom: 16px;
  }
  /* Summary */
  .summary {
    font-size: 14px;
    color: #475569;
    line-height: 1.7;
    margin-bottom: 24px;
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
    border-left: 4px solid ${cat.color};
  }
  /* Section */
  .section {
    margin-bottom: 20px;
  }
  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f5f9;
  }
  .section-content {
    font-size: 13px;
    color: #334155;
  }
  /* Impact & Action boxes */
  .box {
    padding: 14px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
  }
  .box-impact {
    background: #fef3c7;
    border: 1px solid #fde68a;
  }
  .box-impact .box-title { color: #92400e; }
  .box-action {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
  }
  .box-action .box-title { color: #1e40af; }
  .box-title {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .box-content {
    font-size: 13px;
    line-height: 1.7;
  }
  /* Sources */
  .sources {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
  }
  .sources-title {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .source-item {
    font-size: 12px;
    color: #3b82f6;
    margin-bottom: 4px;
    word-break: break-all;
  }
  /* Footer */
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #cbd5e1;
  }
</style>
</head>
<body>
<div class="page">
  <div class="color-bar"></div>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">POA Master · 洞察简报</div>
    </div>
    <div class="meta">
      <div><span class="badge">${cat.label}</span><span class="priority-badge">${pri.label}</span></div>
      <div style="margin-top:4px">${dateStr}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="title">${escapeHtml(card.title)}</div>

  <!-- Summary -->
  <div class="summary">${escapeHtml(card.summary)}</div>

  <!-- Details -->
  ${card.details ? `
  <div class="section">
    <div class="section-title">详细分析</div>
    <div class="section-content">${markdownToHtml(card.details)}</div>
  </div>` : ''}

  <!-- Impact -->
  ${card.impact ? `
  <div class="box box-impact">
    <div class="box-title">影响分析</div>
    <div class="box-content">${boldify(escapeHtml(card.impact))}</div>
  </div>` : ''}

  <!-- Action -->
  ${card.action ? `
  <div class="box box-action">
    <div class="box-title">建议行动</div>
    <div class="box-content">${boldify(escapeHtml(card.action))}</div>
  </div>` : ''}

  <!-- Sources -->
  ${card.sources.length > 0 ? `
  <div class="sources">
    <div class="sources-title">信息来源</div>
    ${card.sources.map(s => `<div class="source-item">· ${escapeHtml(s.title)}</div>`).join('\n    ')}
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>POA Master 洞察简报 · COO 关注</span>
    <span>生成时间: ${new Date().toLocaleString('zh-CN')}</span>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a PDF buffer from an InsightCard.
 */
export async function generateInsightPDF(card: PDFCardData): Promise<Buffer> {
  const html = buildHTML(card);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
```

**Step 2: Verify the module compiles**

Run: `npx tsc --noEmit lib/insights/pdf-report.ts 2>&1 | head -20`

If TypeScript config prevents direct file checks, just ensure the dev server doesn't report errors for this file.

---

### Task 4: Add Feishu File Upload and File Message Functions

**Files:**
- Modify: `lib/feishu.ts:125-159` (append before `sendFeishuNotification`)

**Step 1: Add uploadFeishuFile function**

Add the following two functions to `lib/feishu.ts`, right before the `sendFeishuNotification` function (around line 127):

```typescript
/**
 * Upload a file to Feishu for sending as a message attachment.
 * Uses the im/v1/files endpoint with multipart form data.
 * Returns the file_key for use in sendFeishuFileMessage.
 */
export async function uploadFeishuFile(
  buffer: Buffer,
  fileName: string,
  fileType: 'pdf' | 'doc' | 'xls' | 'ppt' | 'image' | 'media' | 'opus',
): Promise<string> {
  const accessToken = await getFeishuAccessToken();

  const formData = new FormData();
  formData.append('file_type', fileType);
  formData.append('file_name', fileName);
  formData.append('file', new Blob([buffer]), fileName);

  const res = await fetch(
    'https://open.feishu.cn/open-apis/im/v1/files',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`上传飞书文件失败: HTTP ${res.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`上传飞书文件失败: ${data.msg} (code: ${data.code})`);
  }

  return data.data.file_key;
}

/**
 * Send a file message to a Feishu chat.
 */
export async function sendFeishuFileMessage(
  chatId: string,
  fileKey: string,
): Promise<void> {
  const accessToken = await getFeishuAccessToken();

  const res = await fetch(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey }),
      }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`发送飞书文件消息失败: HTTP ${res.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`发送飞书文件消息失败: ${data.msg} (code: ${data.code})`);
  }
}
```

**Step 2: Verify no syntax errors**

Run: `npx tsc --noEmit lib/feishu.ts 2>&1 | head -10`

---

### Task 5: Create Share API Route

**Files:**
- Create: `app/api/insights/cards/[id]/share/route.ts`

**Step 1: Create the share API route**

Create `app/api/insights/cards/[id]/share/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { generateInsightPDF } from '@/lib/insights/pdf-report';
import { uploadFeishuFile, sendFeishuFileMessage } from '@/lib/feishu';

/**
 * POST /api/insights/cards/[id]/share
 * Generate a PDF report for the card and send it to Feishu.
 * Marks the card as isCooFocus = true.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;

    // 1. Fetch card
    const card = await prisma.insightCard.findUnique({
      where: { id },
    });

    if (!card) {
      return NextResponse.json({ error: '洞察卡片不存在' }, { status: 404 });
    }

    // 2. Check Feishu config
    const chatId = await getConfig('feishu.chatId');
    if (!chatId) {
      return NextResponse.json(
        { error: '飞书群聊 ID 未配置，请在系统设置中配置' },
        { status: 400 },
      );
    }

    // 3. Generate PDF
    const sources = (card.sources as Array<{ title: string; url: string }>) || [];
    const pdfBuffer = await generateInsightPDF({
      title: card.title,
      category: card.category,
      priority: card.priority,
      summary: card.summary,
      details: card.details,
      impact: card.impact,
      action: card.action,
      sources,
      createdAt: card.createdAt.toISOString(),
    });

    // 4. Upload to Feishu
    const safeTitle = card.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_').substring(0, 30);
    const fileName = `洞察报告_${safeTitle}.pdf`;
    const fileKey = await uploadFeishuFile(pdfBuffer, fileName, 'pdf');

    // 5. Send file message
    await sendFeishuFileMessage(chatId, fileKey);

    // 6. Mark as COO focus
    await prisma.insightCard.update({
      where: { id },
      data: {
        isCooFocus: true,
        sharedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Share] Failed to share insight card:', error);

    // Classify error
    const msg = error?.message || '';
    if (msg.includes('飞书')) {
      return NextResponse.json({ error: `飞书发送失败: ${msg}` }, { status: 502 });
    }
    return NextResponse.json(
      { error: msg || '分享失败，请查看服务端日志' },
      { status: 500 },
    );
  }
}
```

---

### Task 6: Update Briefing API to Include isCooFocus

**Files:**
- Modify: `app/api/insights/briefing/route.ts:42-51`

**Step 1: Ensure the briefing API includes isCooFocus and sharedAt in its response**

The current `include: { cards: {} }` already returns all scalar fields including newly added `isCooFocus` and `sharedAt` by default (Prisma returns all scalar fields unless you use `select`). No code change is needed for the API route itself.

Verify by reading the response manually:
Run: `curl -s http://localhost:3030/api/insights/briefing --cookie "session=<your_session>" | jq '.briefing.cards[0] | keys'`

The response should now include `isCooFocus` and `sharedAt` in each card object.

---

### Task 7: Add Share Button and COO Badge to Briefing UI

**Files:**
- Modify: `app/(dashboard)/insights/briefing/page.tsx:54-66` (BriefingCard interface)
- Modify: `app/(dashboard)/insights/briefing/page.tsx:20-44` (imports)
- Modify: `app/(dashboard)/insights/briefing/page.tsx:289-557` (BriefingCardItem component)
- Modify: `app/(dashboard)/insights/briefing/page.tsx:560-568` (BriefingPage state + handler)
- Modify: `app/(dashboard)/insights/briefing/page.tsx:952-961` (card list rendering)

**Step 1: Add imports**

Add `Send as SendIcon` and `Star as StarIcon` to the MUI imports block (around line 38):

```typescript
import {
  // ...existing imports...
  Send as SendIcon,
  Star as StarIcon,
} from '@mui/icons-material';
```

**Step 2: Update BriefingCard interface**

Add `isCooFocus` and `sharedAt` fields to the `BriefingCard` interface (line 54-66):

```typescript
interface BriefingCard {
  id: string;
  category: string;
  priority: string;
  title: string;
  summary: string;
  details: string;
  impact: string | null;
  action: string | null;
  sources: Source[];
  feedback: number | null;
  viewedAt: string | null;
  isCooFocus: boolean;
  sharedAt: string | null;
}
```

**Step 3: Add onShare callback to BriefingCardItem**

Update the `BriefingCardItem` component signature and add a share button. The component needs:
- A new `onShare` prop
- Local `sharing` state for the loading spinner
- A share button next to the feedback buttons
- A COO badge on cards where `isCooFocus` is true

Update the component (around line 289-557):

```typescript
function BriefingCardItem({
  card,
  onFeedback,
  onShare,
}: {
  card: BriefingCard;
  onFeedback: (id: string, feedback: number) => void;
  onShare: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const viewedRef = useRef(false);

  // ...existing category/priority config...

  const handleShare = async () => {
    setSharing(true);
    try {
      await onShare(card.id);
    } finally {
      setSharing(false);
    }
  };
```

**Step 4: Add COO badge next to the title**

In the title area (after the `<Typography variant="subtitle1">` for the card title, around line 374), add a COO badge when `isCooFocus` is true:

```tsx
<Box sx={{ flex: 1, minWidth: 0 }}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Typography
      variant="subtitle1"
      sx={{
        fontWeight: 700,
        color: dt.text.primary,
        lineHeight: 1.4,
      }}
    >
      {card.title}
    </Typography>
    {card.isCooFocus && (
      <Chip
        icon={<StarIcon sx={{ fontSize: '14px !important' }} />}
        label="COO"
        size="small"
        sx={{
          height: 20,
          fontSize: '0.6rem',
          fontWeight: 700,
          bgcolor: 'rgba(245, 158, 11, 0.1)',
          color: '#d97706',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          '& .MuiChip-icon': { color: '#d97706 !important' },
          flexShrink: 0,
        }}
      />
    )}
  </Box>
  {/* ...existing summary code... */}
</Box>
```

**Step 5: Add share button next to feedback buttons**

In the feedback buttons area (around line 409-434), add a share/send button after the thumbs down button:

```tsx
{/* Feedback + Share buttons */}
<Box sx={{ display: 'flex', gap: 0 }} onClick={(e) => e.stopPropagation()}>
  <Tooltip title="有用" arrow>
    <IconButton
      size="small"
      onClick={() => onFeedback(card.id, 1)}
      sx={{
        color: card.feedback === 1 ? dt.success.main : dt.text.muted,
        '&:hover': { color: dt.success.main, bgcolor: dt.success.subtle },
      }}
    >
      {card.feedback === 1 ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
    </IconButton>
  </Tooltip>
  <Tooltip title="无用" arrow>
    <IconButton
      size="small"
      onClick={() => onFeedback(card.id, -1)}
      sx={{
        color: card.feedback === -1 ? dt.danger.main : dt.text.muted,
        '&:hover': { color: dt.danger.main, bgcolor: dt.danger.subtle },
      }}
    >
      {card.feedback === -1 ? <ThumbDownIcon fontSize="small" /> : <ThumbDownOutlinedIcon fontSize="small" />}
    </IconButton>
  </Tooltip>
  <Tooltip title={card.isCooFocus ? '已分享到飞书' : '分享到飞书'} arrow>
    <span>
      <IconButton
        size="small"
        onClick={handleShare}
        disabled={sharing}
        sx={{
          color: card.isCooFocus ? dt.warning.main : dt.text.muted,
          '&:hover': { color: dt.accent.main, bgcolor: dt.accent.subtle },
        }}
      >
        {sharing ? (
          <CircularProgress size={18} thickness={5} sx={{ color: dt.accent.main }} />
        ) : (
          <SendIcon fontSize="small" />
        )}
      </IconButton>
    </span>
  </Tooltip>
</Box>
```

**Step 6: Add share handler in BriefingPage**

In the `BriefingPage` component (around line 646-668), add a share handler alongside the existing `handleFeedback`:

```typescript
// ─── Share handler ──────────────────────────────────────
const handleShare = async (cardId: string) => {
  try {
    const res = await fetch(`/api/insights/cards/${cardId}/share`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success && briefing) {
      setBriefing({
        ...briefing,
        cards: briefing.cards.map((c) =>
          c.id === cardId ? { ...c, isCooFocus: true, sharedAt: new Date().toISOString() } : c
        ),
      });
      setSnackbar('已分享到飞书');
    } else {
      setSnackbar(data.error || '分享失败');
    }
  } catch {
    setSnackbar('网络错误，分享失败');
  }
};
```

**Step 7: Pass onShare to BriefingCardItem**

Update the card list rendering (around line 954-958) to pass the new `onShare` prop:

```tsx
{briefing.cards.map((card, i) => (
  <Fade in timeout={400 + i * 100} key={card.id}>
    <Box>
      <BriefingCardItem card={card} onFeedback={handleFeedback} onShare={handleShare} />
    </Box>
  </Fade>
))}
```

**Step 8: Verify in browser**

1. Open `http://localhost:3030/insights/briefing`
2. Find a card with content
3. Verify the Send icon appears next to thumbs up/down
4. Click it and verify it sends to Feishu (or shows error if Feishu not configured)
5. Verify the card shows a gold "COO" badge after sharing

---

### Task 8: Manual Integration Test

**Step 1: Restart dev server (required after prisma generate)**

Run: `kill $(lsof -t -i :3030) 2>/dev/null; cd /Users/allenqiang/poamaster && npm run dev`

**Step 2: Verify schema migration**

Run: `npx prisma db push`
Expected: No changes (already pushed in Task 1).

**Step 3: End-to-end test**

1. Navigate to `http://localhost:3030/insights/briefing`
2. If no briefing exists, click "生成简报" first
3. Expand a card
4. Click the Send (paper plane) icon
5. Check:
   - Loading spinner appears briefly
   - Snackbar shows "已分享到飞书"
   - Card now shows "COO" gold badge
   - In the Feishu chat, a PDF file appears
6. Open the PDF and verify:
   - Color bar matches the card category
   - Title, summary, details rendered correctly
   - Impact/Action boxes present if card has them
   - Sources listed at bottom
   - Footer shows "POA Master 洞察简报 · COO 关注"

**Step 4: Test error cases**

1. If Feishu is not configured, verify the error message "飞书群聊 ID 未配置" appears
2. Try sharing the same card again — it should succeed (idempotent, just re-sends)
