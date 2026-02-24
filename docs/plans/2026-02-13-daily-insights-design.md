# Daily Insights (每日简报) Design

## Goal

Build a daily briefing system that aggregates activity from all POA Master data sources and delivers a concise, AI-summarized report via both a web page and Feishu push notification.

Inspired by [ChatGPT Pulse](https://openai.com/index/introducing-chatgpt-pulse/) — which analyzes chat history + memory overnight and delivers personalized cards each morning.

## Architecture

Three components, no new database tables:

### 1. Data Collector (`lib/insights/collector.ts`)

`collectDailyData(since: Date)` → `DailyData`

Runs 5 parallel Prisma queries:

- **Tasks**: overdue (status != DONE, dueDate < now), completed since yesterday, newly created, in-progress count
- **Feishu Messages**: total count, top 5 active chats, top 5 active senders
- **Feishu Chats**: newly created since yesterday
- **Pulse**: new reports uploaded, analysis sessions completed
- **Roundtable**: completed discussions, new action items, new risks

```typescript
interface DailyData {
  period: { from: Date; to: Date };
  tasks: {
    overdue: Array<{ title: string; assignee: string; dueDate: Date }>;
    completed: number;
    created: number;
    inProgress: number;
  };
  feishu: {
    totalMessages: number;
    topChats: Array<{ name: string; count: number }>;
    topSenders: Array<{ name: string; count: number }>;
  };
  pulse: {
    newReports: number;
    completedAnalyses: number;
  };
  roundtable: {
    completedDiscussions: number;
    newActions: number;
    newRisks: number;
  };
}
```

### 2. LLM Summarizer (`lib/insights/summarizer.ts`)

`generateBriefing(data: DailyData)` → markdown string

- Uses existing `lib/openai.ts` client
- Model: `gpt-4o-mini` (cost-efficient for summarization)
- Prompt: generate concise Chinese briefing, 300 chars max, prioritize overdue tasks
- Same-day in-memory caching (Map keyed by date string)
- Fallback: plain-text data formatting if LLM fails

### 3. Delivery

**Web Page (`/insights/page.tsx`)**:
- Calls `GET /api/insights/daily`
- Renders: date header, 4 stat cards (overdue/messages/completed/active), markdown briefing
- "重新生成" button to bypass cache

**API (`app/api/insights/daily/route.ts`)**:
- GET: collector + summarizer, returns briefing + raw data + generatedAt
- POST: force cache refresh

**Feishu Push**:
- Piggyback on feishu-listener's existing 5-minute setInterval
- At ~9:00 AM, if briefing not sent today, generate and push via `sendFeishuTextMessage()`
- No new processes needed

## Implementation Scope

New files:
- `lib/insights/collector.ts`
- `lib/insights/summarizer.ts`
- `app/api/insights/daily/route.ts`
- `app/insights/page.tsx`

Modified files:
- `services/feishu-listener/src/index.ts` (add daily push timer)
- `components/Header.tsx` (add nav entry)
