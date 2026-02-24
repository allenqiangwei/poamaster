# Insight Share to Feishu — Design Document

## Goal

Add a "share" button to each insight briefing card that generates a professional PDF report (咨询报告风) and sends it to the default Feishu chat, marking the card as COO-focused.

## Architecture

Server-side Puppeteer renders an HTML template into PDF, uploads it to Feishu via the Open API file upload endpoint, then sends a file message to the configured chat. The InsightCard model gains an `isCooFocus` boolean to track which cards the COO has highlighted.

## User Flow

1. User expands an insight card on `/insights/briefing`
2. Clicks "分享到飞书" button (next to feedback thumbs)
3. Button enters loading state ("发送中...")
4. Backend: renders PDF → uploads to Feishu → sends file message → marks `isCooFocus`
5. Success: Snackbar "已分享到飞书" + card shows a small COO badge
6. Error: Snackbar with error message

## Components

### 1. Schema Change

Add `isCooFocus Boolean @default(false)` and `sharedAt DateTime?` to `InsightCard`.

### 2. PDF Generation (`lib/insights/pdf-report.ts`)

- HTML template styled as 咨询报告风 (consulting report style)
- Structure: logo header → category color bar → title/date → summary → details (markdown rendered) → impact box → action box → sources list → footer
- Uses Puppeteer to render HTML string → PDF buffer (A4, margins)
- Color bar color derived from category config

### 3. Feishu File Upload + Send (`lib/feishu.ts`)

Two new functions added to existing `lib/feishu.ts`:

- `uploadFeishuFile(buffer, fileName, fileType)` — POST multipart to `im/v1/files`
- `sendFeishuFileMessage(chatId, fileKey)` — POST to `im/v1/messages` with `msg_type: 'file'`

Auth uses existing `getFeishuAccessToken()`.

### 4. API Route (`app/api/insights/cards/[id]/share/route.ts`)

POST endpoint:
1. Verify session
2. Fetch card with sources
3. Generate PDF via `generateInsightPDF(card)`
4. Upload to Feishu via `uploadFeishuFile(pdfBuffer, fileName, 'pdf')`
5. Send file message via `sendFeishuFileMessage(chatId, fileKey)`
6. Update card: `isCooFocus: true, sharedAt: new Date()`
7. Return `{ success: true }`

### 5. UI Changes (`app/(dashboard)/insights/briefing/page.tsx`)

- Add `isCooFocus` and `sharedAt` to `BriefingCard` interface
- Add share button (Send icon) next to feedback buttons in `BriefingCardItem`
- Loading state per card (local state in BriefingCardItem)
- On success: update local card state, show Snackbar
- COO badge: small chip "COO" on cards where `isCooFocus === true`

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `lib/insights/pdf-report.ts` |
| Create | `app/api/insights/cards/[id]/share/route.ts` |
| Modify | `lib/feishu.ts` (add upload + file message) |
| Modify | `prisma/schema.prisma` (add isCooFocus, sharedAt) |
| Modify | `app/(dashboard)/insights/briefing/page.tsx` (share button + COO badge) |
| Modify | `app/api/insights/briefing/route.ts` (include isCooFocus in response) |

## Dependencies

- `puppeteer` — server-side PDF rendering
- Feishu Open API: `im/v1/files` (upload), `im/v1/messages` (send)
- Existing: `getFeishuAccessToken()`, `getConfig('feishu.chatId')`

## Error Handling

- Missing Feishu config: return 400 with clear message
- Puppeteer render failure: return 500
- Feishu upload/send failure: return 502 with Feishu error message
- Card not found: return 404
