# Claude Code Chat Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace OpenAI backend in ChatBubble with Claude Code CLI subprocess, giving the web chat full Claude Code capabilities (file read/write, bash, web search).

**Architecture:** POST /api/chat spawns the claude binary via Node.js execFile() with JSON output, parses the result, and stores the Claude session ID for conversation resume. The existing ChatBubble frontend needs only a minor loading text change.

**Tech Stack:** Node.js execFile (NOT exec — safe from shell injection), Claude Code CLI, Prisma, Next.js App Router

**Security note:** This plan uses execFile with argument arrays exclusively. execFile does NOT spawn a shell, so user input in arguments cannot cause command injection. This is the safe pattern for subprocess calls.

---

### Task 1: Add claudeSessionId to BotConversation schema

Add the claudeSessionId field to support Claude CLI session resume across messages.

**Files:**
- Modify: `prisma/schema.prisma:638-650`
- Create: `prisma/migrations/20260215_add_claude_session_id/migration.sql`

**Step 1: Edit schema**

In `prisma/schema.prisma`, the BotConversation model currently looks like:

```prisma
model BotConversation {
  id           String   @id @default(cuid())
  chatId       String   @unique
  messages     Json     @default("[]")
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  title        String?
  source       String   @default("feishu")

  @@index([lastActiveAt])
  @@index([source])
}
```

Add `claudeSessionId String?` after `source`:

```prisma
model BotConversation {
  id               String   @id @default(cuid())
  chatId           String   @unique
  messages         Json     @default("[]")
  lastActiveAt     DateTime @default(now())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  title            String?
  source           String   @default("feishu")
  claudeSessionId  String?

  @@index([lastActiveAt])
  @@index([source])
}
```

**Step 2: Create migration SQL manually**

Create file `prisma/migrations/20260215_add_claude_session_id/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "BotConversation" ADD COLUMN "claudeSessionId" TEXT;
```

Why manual migration: This project has a known issue where prisma migrate dev fails due to shadow database replay of data-only migrations. See MEMORY.md.

**Step 3: Apply migration**

```bash
npx prisma db execute --file prisma/migrations/20260215_add_claude_session_id/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260215_add_claude_session_id --schema prisma/schema.prisma
npx prisma generate
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260215_add_claude_session_id/
git commit -m "feat: add claudeSessionId to BotConversation for Claude CLI resume"
```

---

### Task 2: Create lib/claude-bridge.ts helper

Create a helper module that wraps the claude CLI call using Node.js execFile (safe subprocess — no shell). This keeps the API route clean and the subprocess logic isolated.

**Files:**
- Create: `lib/claude-bridge.ts`

**Step 1: Create the bridge module**

Create `lib/claude-bridge.ts` with a single exported function `callClaude(message, sessionId?)` that:
- Builds an argument array for the claude binary
- Calls execFile (not exec) with the argument array
- Sets timeout to 120 seconds, maxBuffer to 10MB
- Parses JSON output and returns { result, sessionId, cost, durationMs }
- If sessionId is provided, adds --resume flag for conversation continuity
- Uses --output-format json, --max-turns 5, --model sonnet

The claude binary is located at `/opt/homebrew/bin/claude` (verified via `which claude`).

Key interface:

```typescript
interface ClaudeResponse {
  result: string;
  sessionId: string;
  cost: number;
  durationMs: number;
}

function callClaude(message: string, sessionId?: string | null): Promise<ClaudeResponse>
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 3: Commit**

```bash
git add lib/claude-bridge.ts
git commit -m "feat: add claude-bridge helper for CLI subprocess calls"
```

---

### Task 3: Rewrite POST /api/chat to use Claude CLI

Replace the OpenAI call in the POST handler with the Claude bridge. Keep the GET handler unchanged.

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: Rewrite the route**

Key changes from the current file:

1. **Remove imports**: `getOpenAIClient`, `getOpenAIModel`, `BOT_TOOLS`, `executeBotTool`, `BOT_SYSTEM_PROMPT`, `OpenAI`
2. **Add import**: `callClaude` from `@/lib/claude-bridge`
3. **POST handler**: Replace the OpenAI chat completion + tool calling loop (lines 44-93) with a single `callClaude(message.trim(), conv?.claudeSessionId)` call
4. **Upsert**: Add `claudeSessionId: claudeResult.sessionId` to both create and update
5. **GET handler**: Completely unchanged

The POST handler flow becomes:
1. Auth check (same)
2. Load/create conversation (same)
3. Build local message history (same — for our DB storage)
4. `const claudeResult = await callClaude(message.trim(), conv?.claudeSessionId)`
5. Save messages + claudeSessionId to DB (updated)
6. Return response (same format)

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: replace OpenAI with Claude CLI in POST /api/chat"
```

---

### Task 4: Update ChatBubble loading indicator

The only frontend change: show "Claude 正在思考..." text next to the spinner, since Claude may take 10-30 seconds.

**Files:**
- Modify: `components/ChatBubble.tsx:324-337`

**Step 1: Update the loading indicator**

In `components/ChatBubble.tsx`, find the loading block (around line 324). It currently shows just a CircularProgress spinner.

Add a Typography element next to the spinner with text "Claude 正在思考..." and wrap both in a flex container with gap.

The Box sx should add: `display: 'flex', alignItems: 'center', gap: 1`

The Typography should be: `variant="caption" color="text.secondary"`

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 3: Commit**

```bash
git add components/ChatBubble.tsx
git commit -m "feat: update loading indicator with Claude thinking text"
```

---

### Task 5: Restart dev server and end-to-end test

Verify the full flow works: bubble opens, new conversation, Claude responds, thread persists.

**Step 1: Regenerate Prisma client and restart dev server**

```bash
npx prisma generate
kill $(lsof -ti:3030) 2>/dev/null
npx next dev -p 3030
```

The dev server MUST be restarted after prisma generate — Turbopack caches the old Prisma client.

**Step 2: Test in browser**

1. Navigate to http://localhost:3030
2. Click the floating chat bubble (bottom-right)
3. Click "新对话"
4. Type "这个项目用的什么技术栈？" and press Enter
5. Wait for Claude response (10-30 seconds) — should show "Claude 正在思考..."
6. Verify the response shows project-aware information (should mention Next.js, Prisma, PostgreSQL, etc.)
7. Click back arrow, verify thread appears in list
8. Click the thread again, verify messages load
9. Send a follow-up message, verify Claude remembers context (resume works)

**Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --skipLibCheck`
