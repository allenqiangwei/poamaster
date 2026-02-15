# Async Chat with Streaming Progress & Red Dot Notification

## Problem

Current chat implementation is synchronous — user sends a message, frontend `await`s the response (up to 180s timeout). Complex queries can hit the max-turns limit or timeout, causing poor UX. Users must stare at "Claude 正在思考..." while unable to do anything else.

## Solution

Make the chat **asynchronous**: send the request, let the user continue working, and show a **red dot notification** on the floating action button when a reply arrives. While processing, show **real-time progress** from Claude CLI's stream-json output (e.g., "正在读取文件...", "正在搜索代码...").

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Notification mechanism | Polling (3-5s) | Simple, sufficient for single-user scenario |
| Multi-message behavior | Allow continuous sending | Each message processed independently in background |
| Notification location | Red dot Badge on FAB | Non-intrusive, visible from any page |
| Progress display | Real stream-json parsing | Show actual tool usage in real-time |
| Process management | DB-driven + orphan detection | Survives hot reload and crashes |

## Architecture

```
User sends message
    ↓
POST /api/chat → create BotMessage(user) + BotMessage(assistant, status=pending)
    ↓                                       → return { messageId, status: 'processing' }
    ↓
Background: spawn Claude CLI with --output-format stream-json
    ↓
Stdout line by line → parse JSON events → update BotMessage.progress
    ↓
Process exits → write final content → BotMessage.status = done, unread = true
    ↓                               → BotConversation.hasUnread = true
    ↓
Frontend polls GET /api/chat/poll → receives progress updates + completed messages
    ↓
ChatBubble FAB shows red dot Badge when hasUnread = true and chat window is closed
```

## Data Model Changes

### New: BotMessage table

```prisma
model BotMessage {
  id              String          @id @default(cuid())
  conversationId  String
  role            String          // 'user' | 'assistant'
  content         String?         // null while processing, filled on completion
  status          String          @default("pending") // pending → processing → done → error
  progress        String?         // current progress description
  errorMessage    String?         // error details if status = error
  unread          Boolean         @default(false) // true for new assistant replies
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  conversation    BotConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([status])
  @@index([updatedAt])
}
```

### Modified: BotConversation

```prisma
model BotConversation {
  // ... existing fields ...
  hasUnread  Boolean  @default(false)  // NEW: quick check for red dot
  messages_legacy  Json  @default("[]") // RENAME: old messages field for backward compat
  botMessages      BotMessage[]        // NEW: relation to BotMessage
}
```

Note: Keep old `messages` Json field as `messages_legacy` during migration. New code uses BotMessage table exclusively.

## API Design

### POST /api/chat (modified)

**Before:** Synchronous — calls Claude, waits, returns reply.
**After:** Async — creates messages in DB, spawns background process, returns immediately.

```typescript
// Request
{ threadId?: string, message: string }

// Response (immediate)
{
  success: true,
  data: {
    threadId: string,       // conversation chatId
    messageId: string,      // the assistant BotMessage id
    userMessageId: string,  // the user BotMessage id
    status: 'processing',
    title: string
  }
}
```

### GET /api/chat/poll (new)

Frontend calls every 3 seconds while chat is open, every 10 seconds when closed (for red dot only).

```typescript
// Request
GET /api/chat/poll?threadId=xxx&since=2026-02-15T12:00:00Z

// Response
{
  success: true,
  data: {
    updates: [
      {
        messageId: string,
        status: 'processing' | 'done' | 'error',
        progress?: string,        // "正在读取文件..."
        content?: string,         // final content when done
        errorMessage?: string,    // if status = error
      }
    ],
    hasUnread: boolean  // for red dot
  }
}
```

### GET /api/chat/unread (new)

Lightweight endpoint for red dot check when chat is closed.

```typescript
// Response
{ success: true, data: { count: number } }
```

### POST /api/chat/read (new)

Mark messages as read when user opens thread.

```typescript
// Request
{ threadId: string }

// Response
{ success: true }
```

### GET /api/chat/[threadId] (modified)

Now reads from BotMessage table instead of Json field.

## Backend: Claude Worker (lib/claude-worker.ts)

### Process Lifecycle

```typescript
const activeJobs = new Map<string, ChildProcess>(); // in-memory tracking

function startClaudeJob(messageId: string, prompt: string, sessionId?: string) {
  // 1. Update DB: status = processing
  // 2. Spawn Claude CLI with --output-format stream-json, detached: true
  // 3. Parse stdout line by line:
  //    - tool_use events → update progress ("正在使用 Read 工具...")
  //    - assistant text → accumulate final content
  //    - result event → finalize
  // 4. On close: write content to DB, status = done, unread = true
  // 5. On error/timeout: status = error, errorMessage = ...
}
```

### Stream-JSON Event Parsing

Claude CLI with `--output-format stream-json` outputs lines like:

```json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"让我..."}]}}
{"type":"tool_use","tool":{"name":"Read","input":{"file_path":"/path/to/file"}}}
{"type":"tool_result","content":"file contents..."}
{"type":"result","subtype":"success","result":"final answer...","session_id":"xxx"}
```

Progress mapping:
| Event | Progress Text |
|---|---|
| `tool_use` name=Read | 正在读取文件... |
| `tool_use` name=Grep | 正在搜索代码... |
| `tool_use` name=Bash | 正在执行命令... |
| `tool_use` name=Write/Edit | 正在编辑文件... |
| `tool_use` name=Glob | 正在查找文件... |
| `tool_use` name=WebSearch | 正在搜索网络... |
| `assistant` (no tool) | 正在思考... |

### Orphan Process Detection

On module load (server startup / hot reload):

```typescript
// Find messages stuck in 'processing' for > 5 minutes
const orphans = await prisma.botMessage.findMany({
  where: {
    status: 'processing',
    updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
  }
});
// Mark them as error
for (const msg of orphans) {
  await prisma.botMessage.update({
    where: { id: msg.id },
    data: { status: 'error', errorMessage: '处理被中断，请重新发送' }
  });
}
```

## Frontend: ChatBubble Changes

### State Changes

```typescript
// New state
const [pendingMessages, setPendingMessages] = useState<Set<string>>(new Set());
const [unreadCount, setUnreadCount] = useState(0);
const pollRef = useRef<ReturnType<typeof setInterval>>();
```

### Polling Logic

```
Chat window open + has pending messages → poll every 3 seconds
Chat window open + no pending → poll every 10 seconds (for new messages from other sources)
Chat window closed → poll /api/chat/unread every 10 seconds (lightweight)
```

### Red Dot Badge

```tsx
<Badge badgeContent={unreadCount} color="error" invisible={unreadCount === 0}>
  <Fab onClick={handleOpen}>
    <SmartToyIcon />
  </Fab>
</Badge>
```

### Message Display

Each assistant message shows one of:
- **Processing with progress:** spinner + "正在读取文件..." (updates in real-time)
- **Completed:** normal message bubble
- **Error:** error message with retry button

### Send Flow (no more await)

```typescript
async function sendMessage() {
  // 1. Optimistically add user message to UI
  // 2. POST /api/chat → get messageId
  // 3. Add messageId to pendingMessages set
  // 4. Show assistant placeholder with "处理中..."
  // 5. Start polling if not already running
  // User can immediately type and send next message
}
```

## Migration Strategy

1. Create BotMessage table via Prisma migration
2. Add `hasUnread` to BotConversation
3. Keep old `messages` Json field for backward compatibility
4. New code reads/writes BotMessage table exclusively
5. Optional: migrate existing messages from Json to BotMessage rows

## Testing

- Send message → verify immediate return, background processing starts
- Poll endpoint → verify progress updates arrive
- Process completion → verify content saved, unread flag set
- Red dot → verify Badge appears when chat closed, disappears when opened
- Multiple messages → verify independent processing, correct ordering
- Process crash → verify orphan detection marks as error
- Hot reload (dev) → verify orphan detection handles lost processes
