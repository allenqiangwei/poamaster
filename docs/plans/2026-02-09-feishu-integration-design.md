# 飞书集成工具设计方案

> 日期：2026-02-09
> 状态：已确认

## 概述

在 POA Master 主页新增"飞书集成"工具，通过 Cookie 逆向飞书 WebSocket 协议实时采集所有对话消息（群聊 + 私聊），并提供浏览、搜索和 AI 分析功能。

参考项目：[LarkAgentX](https://github.com/cv-cat/LarkAgentX)

## 整体架构

```
┌─────────────────────────────────────────────────┐
│              Next.js 前端 (新 Tab: 飞书集成)       │
│   对话列表 → 消息详情 → AI 分析面板 → 设置页       │
└──────────────────────┬──────────────────────────┘
                       │ Prisma (同一个数据库)
┌──────────────────────┴──────────────────────────┐
│              Prisma 数据层                        │
│   FeishuChat / FeishuMessage / FeishuAnalysis    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│        独立 Node.js 服务 (services/feishu-listener)│
│   Cookie 认证 → WebSocket 监听 → Protobuf 解析    │
│   → 消息写入数据库 (复用 Prisma Client)            │
└─────────────────────────────────────────────────┘
```

### 关键设计决策

- **独立进程**: `feishu-listener` 作为常驻后台服务运行，不在 Next.js 内
- **共享数据库**: listener 直接用 Prisma Client 写入同一个数据库
- **Protobuf 解密**: 参考 LarkAgentX 的 `lark_decrypt.js`，用 Node.js/TypeScript 原生处理
- **Cookie 配置**: 在 POA Master 设置页面输入飞书 Cookie，存入系统配置

## 数据模型

### FeishuChat（飞书对话）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| chatId | String (unique) | 飞书原始 chat_id |
| chatType | String | "group" / "private" |
| name | String? | 群名或对方昵称 |
| avatar | String? | 头像 URL |
| memberCount | Int? | 群成员数 |
| lastMessage | DateTime? | 最后消息时间 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### FeishuMessage（飞书消息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| messageId | String (unique) | 飞书原始 message_id |
| chatId | String | 关联 FeishuChat.chatId |
| senderId | String | 发送者 open_id |
| senderName | String | 发送者昵称 |
| content | String | 消息文本内容 |
| msgType | String | text/image/file/... |
| rawData | String? | 原始 JSON |
| timestamp | DateTime | 消息时间 |
| createdAt | DateTime | 创建时间 |

## API 路由

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/feishu/chats` | GET | 获取对话列表（搜索、分页） |
| `/api/feishu/chats/[chatId]/messages` | GET | 获取对话消息列表 |
| `/api/feishu/stats` | GET | 统计概览 |
| `/api/feishu/listener/status` | GET | 监听服务状态 |
| `/api/feishu/listener/start` | POST | 启动/重启监听 |
| `/api/feishu/analysis/summarize` | POST | AI 摘要（Phase 2） |
| `/api/feishu/analysis/extract-tasks` | POST | AI 提取任务（Phase 2） |

## 前端页面

```
/feishu                    → 主页：统计面板 + 最近对话列表
/feishu/chats              → 对话列表（搜索、筛选群聊/私聊）
/feishu/chats/[chatId]     → 对话详情（消息时间线，只读）
/feishu/settings           → 飞书 Cookie 配置、监听状态
```

## 监听服务结构

```
services/feishu-listener/
  ├── src/
  │   ├── index.ts           # 入口：启动 WebSocket 监听
  │   ├── auth.ts            # Cookie 认证、Token 获取
  │   ├── websocket.ts       # WebSocket 连接管理、重连
  │   ├── protobuf.ts        # Protobuf 解码
  │   ├── message-handler.ts # 消息解析、分类、写入数据库
  │   └── prisma.ts          # 复用主项目的 Prisma Client
  ├── package.json
  └── tsconfig.json
```

### 核心流程

1. 从数据库读取飞书 Cookie
2. 用 Cookie 调用飞书内部 API 获取 WebSocket 凭证
3. 建立 WebSocket 连接，接收 Protobuf 编码消息
4. 解码 → 提取发送者、内容、对话信息
5. 写入 FeishuMessage + 更新 FeishuChat
6. 自动重连（心跳 + 断线重连）

## 实施路线图

### Phase 1 — MVP：采集 + 浏览

| 步骤 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | Prisma schema 新增模型 | `prisma/schema.prisma` |
| 2 | 创建监听服务 | `services/feishu-listener/` |
| 3 | Header 添加导航 | `components/Header.tsx` |
| 4 | 设置页面添加 Cookie 配置 | `app/(dashboard)/settings/page.tsx` |
| 5 | 飞书主页：统计 + 对话列表 | `app/(dashboard)/feishu/page.tsx` |
| 6 | 对话详情页 | `app/(dashboard)/feishu/chats/[chatId]/page.tsx` |
| 7 | API 路由 | `app/api/feishu/**` |
| 8 | 启动脚本集成 | `start.sh` |

### Phase 2 — AI 分析

- 对话摘要生成（日报/周报）
- 任务自动提取 → 同步到 todo 列表
- 人员参与度统计仪表盘

### Phase 3 — 高级功能

- 全文搜索引擎
- 关键词监控 & 告警
- 与项目管理模块联动

## 风险点

1. **Protobuf 逆向复杂度**：需参考 LarkAgentX 的 proto 定义和解密逻辑，用 TypeScript 重写
2. **Cookie 有效期**：飞书 Cookie 会过期，需提醒用户更新
3. **飞书协议变更**：逆向方案依赖内部协议，可能因飞书更新失效
