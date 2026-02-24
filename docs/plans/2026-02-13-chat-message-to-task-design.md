# Chat Message → Task Design

## Goal

Add a button on each chat message in the Feishu chat detail page to quickly create a Task from it.

## Interaction Flow

1. Each message bubble gets a "+" icon button (PlaylistAddOutlined) in the action area
2. Click opens a dialog pre-filled with:
   - **Title**: message content (truncated to 200 chars)
   - **Assignee**: auto-selected if sender's `feishuUserId` matches an Assignee record
   - **Due date**: empty (optional)
3. User edits fields as needed, clicks "创建任务"
4. `POST /api/tasks` creates the task
5. Success → Snackbar toast "任务已创建", close dialog

## Implementation

**Single file change**: `app/feishu/chats/[chatId]/page.tsx`

No schema changes, no new APIs — uses existing `POST /api/tasks` and `GET /api/assignees`.

### New UI Elements

- `PlaylistAddOutlined` icon button per message (next to edit-name button)
- "添加到任务" dialog with title TextField, assignee Autocomplete, due date picker
- Snackbar for success feedback

### New State

- `taskDialogOpen`, `taskTitle`, `taskAssigneeId`, `taskDueDate`, `taskCreating`
- `snackbarOpen`, `snackbarMessage`

### Assignee Auto-Match

- Load assignees with `feishuUserId` field
- On dialog open, find assignee where `feishuUserId === msg.senderId`
- Pre-select that assignee in the Autocomplete

### Scope

~80 lines of new code in one file.
