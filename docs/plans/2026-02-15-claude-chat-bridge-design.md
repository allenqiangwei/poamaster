# Claude Code 桥接 Web 聊天设计

> 将 ChatBubble 的后端从 OpenAI 替换为本地 Claude Code CLI，通过 `claude -p` 子进程桥接，获得完整 Claude Code 能力（读写文件、运行命令、搜索网络等）。

## 设计原则

- 复用现有 ChatBubble 前端组件和 BotConversation 数据模型
- 通过 CLI 子进程调用（使用 execFile 避免命令注入），使用现有 Claude Code 订阅认证，不需要 API Key
- 默认 Sonnet 模型，后续可配置

---

## 数据模型

扩展 BotConversation，新增 1 个字段：

- claudeSessionId String? — Claude CLI session ID，用于 --resume 恢复会话
- 飞书端不受影响（claudeSessionId 为 null）

---

## API 路由改造

### POST /api/chat — 发送消息

核心变化：将 OpenAI 调用替换为 execFile('claude', args)

新对话参数：['-p', message, '--output-format', 'json', '--max-turns', '5', '--model', 'sonnet']
继续对话参数：['--resume', sessionId, '-p', message, '--output-format', 'json', '--max-turns', '5', '--model', 'sonnet']

处理逻辑：
1. 认证检查（同现有）
2. 加载 BotConversation（同现有）
3. 构造 claude 命令参数数组
4. execFile 执行，超时 120 秒
5. 解析返回 JSON：提取 result 和 session_id
6. 保存 claudeSessionId 和消息历史到 DB
7. 返回 { threadId, reply, title }

### GET/PATCH/DELETE 路由不变

---

## 前端改造

ChatBubble.tsx 几乎不变：
- sendMessage() 的 fetch 调用完全相同
- 增加 loading 状态的超时提示（Claude 可能需要 10-30 秒）
- 其余逻辑（话题列表、删除、返回）全部复用

---

## 不包含的内容

- Streaming 输出（CLI -p 模式不支持流式）
- 模型选择 UI（默认 Sonnet，后续可在设置页加）
- 费用显示（后续可在消息气泡显示 cost）
- Markdown 渲染（后续迭代）
