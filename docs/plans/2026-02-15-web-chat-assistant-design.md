# Web 端 AI 对话助手设计

> 在 Dashboard 所有页面添加浮动聊天气泡，支持多话题自然语言交互，每个话题保持独立记忆。

## 设计原则

- 复用现有 bot-agent 的 5 个工具能力（方案 A）
- 扩展 BotConversation 模型，不新建表
- 浮动气泡放在 Dashboard layout，所有页面可见

---

## 数据模型

扩展现有 `BotConversation`，新增 3 个字段：

```prisma
model BotConversation {
  id           String   @id @default(cuid())
  chatId       String   @unique
  title        String?                     // 新增：话题标题
  source       String   @default("feishu") // 新增：来源 "web" | "feishu"
  messages     Json     @default("[]")
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([lastActiveAt])
  @@index([source])                        // 新增：按来源查询
}
```

- 飞书端现有数据不受影响（`source` 默认 `"feishu"`）
- Web 端话题 `chatId` 使用 `web-<cuid>` 前缀
- `title` 由第一条消息自动生成（LLM 总结），也可手动修改

---

## 共享工具模块

新建 `lib/bot-tools.ts`，包含：

- `BOT_TOOLS` — 5 个 OpenAI function calling 工具定义
- `executeBotTool(name, args, prisma)` — 工具执行函数
- `BOT_SYSTEM_PROMPT` — 系统提示词

与 `services/feishu-listener/src/bot-agent.ts` 逻辑相同但独立维护，避免跨项目 import 复杂性。

---

## API 路由

### `POST /api/chat` — 发送消息

```
Body: { threadId?: string, message: string }
Response: { threadId: string, reply: string, title: string }
```

- 无 threadId → 新建 BotConversation（source="web"），LLM 自动生成 title
- 有 threadId → 加载历史，追加消息，返回回复
- 使用 `getOpenAIClient()` + `getOpenAIModel()`
- 工具调用循环：LLM 决定调用 → executeBotTool → 结果返回 LLM → 最终回复

### `GET /api/chat` — 话题列表

```
Response: { threads: [{ id, chatId, title, lastActiveAt, preview }] }
```

- 查询 `source="web"` 的 BotConversation，按 lastActiveAt 降序
- preview = messages 最后一条内容前 50 字

### `GET /api/chat/[threadId]` — 话题详情

```
Response: { thread: { id, chatId, title, messages } }
```

### `DELETE /api/chat/[threadId]` — 删除话题

### `PATCH /api/chat/[threadId]` — 重命名话题

```
Body: { title: string }
```

---

## 前端组件

### 位置

`app/(dashboard)/layout.tsx` 中添加 `<ChatBubble />`，所有 Dashboard 页面可见。

### 组件结构

```
ChatBubble (components/ChatBubble.tsx)
├── 气泡按钮 (右下角 Fab, SmartToyIcon)
├── 对话窗口 (Paper, 400x500px)
│   ├── 头部 (话题标题 + 返回按钮 + 关闭按钮)
│   ├── 话题列表视图
│   │   ├── 新建话题按钮
│   │   └── 话题卡片列表 (标题 + preview + 时间 + 删除)
│   └── 聊天视图
│       ├── 消息列表 (用户右对齐, AI 左对齐, 自动滚动)
│       └── 输入框 + 发送按钮
```

### 状态管理

组件内 useState：
- `open` — 窗口展开/收起
- `view` — `"threads"` | `"chat"`
- `threads` — 话题列表数组
- `activeThread` — 当前话题 ID + title
- `messages` — 当前话题消息数组
- `loading` — 发送中/等待回复

### 样式

- 使用 `designTokens` 保持 Luminous Tech 风格
- 气泡 z-index: 1300
- 窗口宽度 400px，高度 500px
- 消息气泡区分用户（右、主题色）和 AI（左、灰底）

---

## 交互流程

```
用户点击气泡 → 展开窗口 → 显示话题列表
  ├── 点击"新对话" → 进入聊天视图(空)
  │     └── 输入消息 → POST /api/chat (无threadId) → 创建话题 + 返回回复
  ├── 点击已有话题 → GET /api/chat/[id] → 加载历史 → 进入聊天视图
  │     └── 输入消息 → POST /api/chat (有threadId) → 追加 + 返回回复
  └── 长按/右键话题 → 重命名 / 删除
```

---

## 不包含的内容

- Streaming/SSE（后续迭代）
- Markdown 渲染（后续迭代）
- 文件/图片上传（后续迭代）
