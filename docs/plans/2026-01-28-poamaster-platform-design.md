# POA Master 多工具平台设计文档

> 设计日期：2026-01-28
> 版本：v1.0
> 首个工具：AI 驱动的 To-Do List

---

## 1. 项目概述

**POA Master** 是一个统一的多工具平台，采用单体架构（Monorepo），所有工具共享前端、后端和数据库基础设施。用户通过统一的首页访问所有工具，所有配置集中在统一的配置页管理。

### 1.1 核心特性

- **统一架构**：所有工具共享 Next.js 全栈框架、数据库、认证系统
- **AI 驱动**：首个工具是 AI 任务提取器，支持文本、文件、图片输入
- **集成通知**：飞书定时推送任务提醒
- **个人使用**：简化的认证系统，适合个人或小团队

### 1.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 + 后端 | Next.js 14 (App Router) | 全栈框架，API Routes 在同一项目 |
| 数据库 | PostgreSQL + Prisma ORM | 类型安全，自动生成 TypeScript 类型 |
| UI 组件库 | Material UI (MUI) | 组件丰富，中文支持好 |
| AI 服务 | OpenAI GPT-4o | 支持文本和图片识别 |
| 定时任务 | node-cron | 轻量级，无需额外服务 |
| 认证 | Session-based Auth | 简单的用户名密码，适合个人使用 |
| 通知 | 飞书开放平台 API | 企业级通知，支持消息卡片 |

---

## 2. 系统架构

### 2.1 目录结构

```
poamaster/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证相关页面
│   │   ├── login/                # 登录页
│   │   └── init/                 # 首次初始化页
│   ├── (dashboard)/              # 主应用（需要认证）
│   │   ├── page.tsx              # 工具集合首页
│   │   ├── settings/             # 统一配置页
│   │   │   └── page.tsx
│   │   └── todo/                 # To-Do List 工具
│   │       ├── page.tsx          # 任务列表
│   │       ├── new/              # AI 提取页面
│   │       └── assignees/        # 负责人管理
│   ├── api/                      # API Routes
│   │   ├── auth/                 # 认证 API
│   │   ├── tasks/                # 任务 CRUD + AI 提取
│   │   ├── assignees/            # 负责人管理
│   │   └── config/               # 配置管理
│   ├── layout.tsx                # 根布局
│   └── middleware.ts             # 认证中间件
├── prisma/
│   └── schema.prisma             # 数据库 Schema
├── lib/                          # 共享工具函数
│   ├── auth.ts                   # 认证工具
│   ├── prisma.ts                 # Prisma 客户端
│   └── utils.ts                  # 通用工具
├── components/                   # 共享 UI 组件
│   ├── TaskTable.tsx
│   ├── TaskForm.tsx
│   └── ...
├── services/                     # 业务逻辑
│   ├── openai.ts                 # OpenAI 集成
│   ├── feishu.ts                 # 飞书 API
│   └── scheduler.ts              # 定时任务
├── docs/
│   └── plans/                    # 设计文档
├── .env                          # 环境变量
├── package.json
└── tsconfig.json
```

### 2.2 数据流

```
用户输入（文本/文件/图片）
    ↓
前端上传到 /api/tasks/extract
    ↓
OpenAI GPT-4o 解析
    ↓
返回结构化任务列表（JSON）
    ↓
前端展示预览表格（可编辑）
    ↓
用户确认后批量保存到数据库
    ↓
任务列表页展示
    ↓
定时任务每天 8:00 查询任务
    ↓
飞书 API 发送消息卡片到群聊
```

---

## 3. 数据库设计

### 3.1 Prisma Schema

```prisma
// 用户（个人使用，单用户或少量用户）
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt 加密
  createdAt DateTime @default(now())
  sessions  Session[]
}

// Session 认证
model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// 负责人
model Assignee {
  id           String   @id @default(cuid())
  name         String   @unique
  feishuUserId String?  // 飞书 User ID，用于 @ 通知
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tasks        Task[]

  @@index([name])
}

// 任务
model Task {
  id         String     @id @default(cuid())
  title      String     // 任务标题/描述
  dod        String?    // Definition of Done（完成标准）
  dueDate    DateTime?  // 截止时间
  status     TaskStatus @default(TODO)
  assigneeId String?
  assignee   Assignee?  @relation(fields: [assigneeId], references: [id])
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  @@index([status])
  @@index([dueDate])
  @@index([assigneeId])
}

// 任务状态枚举
enum TaskStatus {
  TODO          // 待办
  IN_PROGRESS   // 进行中
  DONE          // 已完成
  CANCELLED     // 已取消
  POSTPONED     // 已推迟
}

// 配置存储
model Config {
  id        String   @id @default(cuid())
  key       String   @unique  // 如 "openai.apiKey", "feishu.appId"
  value     String            // 加密存储敏感信息
  updatedAt DateTime @updatedAt
}
```

### 3.2 关键设计决策

- **删除策略**：任务硬删除，不保留历史（简化设计）
- **时区处理**：数据库存储 UTC 时间，前端显示时转换为 Asia/Shanghai
- **索引优化**：`status`、`dueDate`、`assigneeId` 添加索引，提升查询性能
- **负责人唯一性**：`name` 字段设置 unique 约束，避免重复

---

## 4. AI 任务提取系统

### 4.1 用户交互流程

```
┌─────────────────────────────────────────┐
│  1. 输入阶段 (/todo/new)                │
│  - 粘贴文本 (Textarea)                  │
│  - 上传文件 (.txt, .md, .doc, .pdf)    │
│  - 上传图片 (.jpg, .png)               │
│  [提取任务] 按钮                        │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. AI 处理 (POST /api/tasks/extract)  │
│  - 调用 OpenAI GPT-4o API              │
│  - 使用 Structured Output              │
│  - 返回 JSON 格式任务列表              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. 确认阶段（前端预览）                │
│  - 显示提取结果表格                    │
│  - 支持内联编辑（任务、负责人、时间等）│
│  - 负责人不存在时提示新增              │
│  - [保存所有任务] / [取消]             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. 保存阶段                            │
│  - 批量插入任务到数据库                │
│  - 自动创建新负责人                    │
│  - 跳转到任务列表                      │
└─────────────────────────────────────────┘
```

### 4.2 OpenAI Prompt 设计

**System Prompt：**
```
# Role: 任务提取与结构化助手

## Profile
- language: 中文
- description: 从用户提供的非结构化文本中，精准提取其中包含的所有任务信息，并将其转换为结构化的任务数据，便于后续管理、跟踪与分析。
- background: 具备自然语言理解与信息抽取能力，熟悉常见任务表达方式（包括显性与隐性任务）、时间表达（绝对时间与相对时间）、角色分工和完成标准等语义模式。
- personality: 客观严谨、逻辑清晰、表达简洁、一致性强，不臆测、不夸大，专注于从文本中提取可被证据支持的信息。
- expertise: 任务识别与抽取、时间解析与标准化（ISO 8601）、责任人识别、完成标准（DoD）提炼、中文自然语言语义分析。
- target_audience: 需要从对话、会议记录、邮件、备忘录、需求文档等文本中提取任务信息的个人用户、项目经理、团队协作工具和自动化系统。

## Skills

1. 任务抽取与结构化
   - 任务识别: 从长文本中识别所有显性或隐性包含"待完成行动"的语句或片段，并拆分为独立任务。
   - 字段结构化: 将每个任务统一整理为结构化字段：title、assignee、dueDate、dod。
   - 多任务分离: 在同一句或同一段中，区分并拆分多个不同的任务，避免合并为一个任务。
   - 语义归纳: 将冗长或口语化的任务描述归纳为简洁、清晰且不失原意的任务标题。

2. 时间与责任人解析
   - 时间解析: 识别绝对时间与相对时间表达（如"下周三""本月底""三天内"），并转换为ISO 8601日期（YYYY-MM-DD）。
   - 相对时间推算: 基于给定的"当前日期"语境，将相对时间计算为具体日期；如未给定当前日期，按系统当前日期推算。
   - 责任人识别: 从文本中识别任务执行者（如人名、昵称、角色称呼），并映射为assignee字段；未明确指派时返回null。
   - 完成标准提炼: 从说明、要求或验收条件中提炼可验证的完成标准作为dod字段；若无明确标准则返回null。

## Rules

1. 基本原则：
   - 忠实文本: 仅基于用户提供内容提取任务，不添加文本中不存在的任务或信息，不进行主观推断。
   - 结构统一: 所有输出任务必须包含相同字段结构：title、assignee、dueDate、dod，字段名保持英文小写。
   - 明确不假设: 当负责人或完成标准未在文本中明确出现时，必须返回null，而不是猜测或填入默认值。
   - 时间标准化: 所有截止时间统一转换并输出为ISO 8601日期格式（YYYY-MM-DD）；无法确定具体日期时，dueDate返回null。

2. 行为准则：
   - 全量提取: 尽可能识别并提取文本中出现的所有任务，而非只提取其中一部分。
   - 精准拆分: 对含有多个动作的句子，若可分解为可独立执行的任务，应拆分为多个任务条目。
   - 语义简化: title应简洁明了，保留任务核心动作与对象，避免冗余背景描述。
   - 中立表达: 不对任务内容进行评价或修改，只做客观抽取与整理，不加入建议、解释或评论。

3. 限制条件：
   - 不输出多余内容: 输出中不得包含解释性文字、分析过程或额外说明，只返回任务数据结构本身。
   - 不改变语义: 在概括title和dod时，不得改变原有任务意图或要求，只能进行压缩与重述。
   - 不虚构日期: 若相对时间表达缺乏足够信息无法推算到具体日期（如缺少参考当前日期），则dueDate必须为null。
   - 不生成示例: 用户未明确要求时，不主动生成示例任务或演示内容。

## Workflows

- 目标: 从给定的用户文本中，提取所有任务，并以统一结构返回每个任务的title、assignee、dueDate（ISO 8601）、dod。

- 步骤 1: 识别任务
  - 通读用户提供的"内容"文本，识别所有包含"需要做、要去做、待完成、需要处理"等含义的语句或片段。
  - 对于一条语句中包含多个动作且可以独立完成的，拆分为多个任务。
  - 形成任务候选列表，每个候选对应一条潜在任务。

- 步骤 2: 提取字段
  - 对每个任务候选：
    - 提炼title：用简洁短句概括任务核心动作和对象。
    - 提取assignee：查找是否有明确的负责人姓名、昵称或角色称呼（如"小王""产品经理""你来负责"），若无则设为null。
    - 提取dueDate：识别绝对时间（如"2025年3月1日"）和相对时间（如"下周三""本月底""三天内"），在有参考当前日期的前提下换算为具体日期并转为YYYY-MM-DD；无法确定则设为null。
    - 提取dod：从描述中抽取可作为"完成标准"的内容（如"通过测试""文档补充完整并评审通过"），若未提及则设为null。

- 步骤 3: 结构化输出
  - 将所有任务以列表形式输出，每个元素为一个对象，包含：
    - title: string
    - assignee: string 或 null
    - dueDate: string（ISO 8601，YYYY-MM-DD）或 null
    - dod: string 或 null
  - 确保字段顺序与名称统一，避免加入任何额外字段或说明文本。

- 预期结果: 返回一个仅包含任务数据的结构化列表，覆盖文本中所有可识别任务，每个任务包含规范化的title、准确或为空的assignee、ISO 8601格式或为空的dueDate，以及对应的dod或null，便于后续系统直接使用。

## Initialization
作为任务提取与结构化助手，你必须遵守上述Rules，按照Workflows执行任务。
```

**User Prompt：**
```
当前日期：${new Date().toISOString().split('T')[0]}

从以下内容中提取所有任务：

${userInput}
```

**Expected Response Format:**
```json
[
  {
    "title": "完成用户认证模块",
    "assignee": "张三",
    "dueDate": "2026-01-30",
    "dod": "代码通过测试并部署"
  },
  {
    "title": "提交项目周报",
    "assignee": null,
    "dueDate": "2026-01-28",
    "dod": null
  }
]
```

### 4.3 实现细节

- **文件上传处理**：
  - 文本文件：直接读取内容
  - Word/PDF：使用 `pdf-parse`、`mammoth` 等库提取文本
  - 图片：使用 OpenAI Vision API（GPT-4o）识别

- **错误处理**：
  - API 调用失败：显示友好错误提示，建议检查配置
  - 提取结果为空：提示"未识别到任务，请检查输入内容"
  - 格式错误：前端验证并提示用户修正

---

## 5. 任务列表与管理界面

### 5.1 页面布局（/todo）

```
┌─────────────────────────────────────────────────────────┐
│  POA Master                        ⚙️ 设置  用户名  登出 │
├─────────────────────────────────────────────────────────┤
│  📋 To-Do List                                          │
├─────────────────────────────────────────────────────────┤
│  [ 全部(20) | 待办(8) | 进行中(5) | 已完成(7) | ... ]   │
│                                   ➕ 添加任务             │
├─────────────────────────────────────────────────────────┤
│  筛选：负责人 [___▼] | 截止时间 [______] | 排序 [___▼]  │
├─────────────────────────────────────────────────────────┤
│  ┌───┬─────────────────┬────────┬──────────┬──────────┐│
│  │ # │ 任务标题        │ 负责人 │ 截止时间 │ 状态/操作││
│  ├───┼─────────────────┼────────┼──────────┼──────────┤│
│  │🔴 │ 完成认证模块    │ 张三   │ 今天18:00│ [待办▼]  ││
│  │🟡 │ 提交周报        │ 李四   │ 1月30日  │ [进行中] ││
│  │   │ Review代码      │ 王五   │ 2月5日   │ [待办]   ││
│  └───┴─────────────────┴────────┴──────────┴──────────┘│
└─────────────────────────────────────────────────────────┘
```

### 5.2 功能特性

**顶部操作栏：**
- 页签导航（状态筛选）+ 任务数徽章
- 添加任务按钮（跳转到 AI 提取页面）

**筛选与排序：**
- 负责人：多选下拉框（可同时选择多个负责人）
- 截止时间范围：日期选择器（起止日期）
- 排序：截止时间升序（默认）| 降序 | 创建时间

**任务列表表格：**
- **颜色标识**：
  - 🔴 红色：今天截止
  - 🟡 黄色：7天内截止
  - ⚪ 默认：其他
- **状态快速切换**：点击状态列的下拉框，直接改变任务状态
- **操作按钮**：
  - ✏️ 编辑：打开详情抽屉
  - 🗑️ 删除：确认后删除
  - ✅ 一键完成：状态改为"已完成"

**任务详情抽屉：**
- 点击任务标题打开右侧抽屉
- 显示完整信息：
  - 任务标题
  - 负责人
  - 截止时间
  - DoD（完成标准）
  - 创建时间
  - 更新时间
- 底部操作：编辑 | 删除 | 改变状态

### 5.3 空状态

无任务时显示：
```
    📋
  暂无任务

  点击"添加任务"开始使用
  或粘贴文字让 AI 帮你提取任务

  [添加第一个任务]
```

---

## 6. 飞书通知系统

### 6.1 飞书应用配置

**所需权限：**
- `im:message` - 发送消息
- `im:message:send_as_bot` - 以机器人身份发送
- `contact:user.id:readonly` - 获取用户 User ID（用于 @ 通知）

**凭证获取：**
- App ID
- App Secret
- 通知目标群聊 Chat ID（通过飞书 API 或手动获取）

### 6.2 消息卡片设计

**每日通知卡片（Markdown 格式）：**

```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": {
        "content": "📋 今日任务提醒",
        "tag": "plain_text"
      },
      "template": "blue"
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "content": "**🔴 今日待办任务 (3 个)**",
          "tag": "lark_md"
        }
      },
      {
        "tag": "hr"
      },
      {
        "tag": "div",
        "text": {
          "content": "• 完成用户认证模块\n  负责人：<at user_id=\"ou_xxx\">张三</at>\n  截止：今天 18:00\n  DoD：代码通过测试并部署",
          "tag": "lark_md"
        }
      },
      {
        "tag": "div",
        "text": {
          "content": "• 提交项目周报\n  负责人：李四\n  截止：今天 17:00",
          "tag": "lark_md"
        }
      },
      {
        "tag": "hr"
      },
      {
        "tag": "div",
        "text": {
          "content": "**📅 本周待办任务 (5 个)**",
          "tag": "lark_md"
        }
      },
      {
        "tag": "div",
        "text": {
          "content": "• 完成数据库设计文档\n  负责人：王五\n  截止：1月30日",
          "tag": "lark_md"
        }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": {
              "content": "查看全部任务",
              "tag": "plain_text"
            },
            "url": "https://your-domain.com/todo",
            "type": "default"
          }
        ]
      }
    ]
  }
}
```

### 6.3 定时任务实现

**服务代码示例（services/scheduler.ts）：**

```typescript
import cron from 'node-cron';
import { sendDailyTaskNotification } from './feishu';

export function startScheduler() {
  // 每天早上 8:00（中国时区）
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] 开始发送每日任务通知...');
    try {
      await sendDailyTaskNotification();
      console.log('[Scheduler] 任务通知发送成功');
    } catch (error) {
      console.error('[Scheduler] 任务通知发送失败:', error);
    }
  }, {
    timezone: "Asia/Shanghai"
  });

  console.log('[Scheduler] 定时任务已启动 - 每天 8:00 发送通知');
}
```

**通知逻辑（services/feishu.ts）：**

```typescript
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';

export async function sendDailyTaskNotification() {
  // 1. 获取飞书配置
  const appId = await getConfig('feishu.appId');
  const appSecret = await getConfig('feishu.appSecret');
  const chatId = await getConfig('feishu.chatId');

  if (!appId || !appSecret || !chatId) {
    throw new Error('飞书配置不完整');
  }

  // 2. 获取 Access Token
  const accessToken = await getFeishuAccessToken(appId, appSecret);

  // 3. 查询今天截止的任务
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTasks = await prisma.task.findMany({
    where: {
      dueDate: {
        gte: today,
        lt: tomorrow
      },
      status: {
        notIn: ['DONE', 'CANCELLED']
      }
    },
    include: {
      assignee: true
    }
  });

  // 4. 查询本周截止的任务
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const weekTasks = await prisma.task.findMany({
    where: {
      dueDate: {
        gt: today,
        lte: nextWeek
      },
      status: {
        notIn: ['DONE', 'CANCELLED']
      }
    },
    include: {
      assignee: true
    }
  });

  // 5. 构建消息卡片
  const card = buildTaskNotificationCard(todayTasks, weekTasks);

  // 6. 发送消息
  await sendFeishuMessage(accessToken, chatId, card);
}
```

### 6.4 配置管理

在统一配置页（/settings）存储：
- `feishu.appId`
- `feishu.appSecret`（加密存储）
- `feishu.chatId`
- `feishu.notificationTime`（默认 08:00）
- `feishu.enabled`（是否启用定时通知）

---

## 7. 统一配置页

### 7.1 页面布局（/settings）

采用分组卡片布局：

```
┌─────────────────────────────────────────────┐
│  ⚙️ 系统配置                                │
├─────────────────────────────────────────────┤
│  ┌─ 基础配置 ────────────────────────────┐ │
│  │ 应用名称：POA Master                  │ │
│  │ 时区：Asia/Shanghai (GMT+8)           │ │
│  │ 语言：中文                            │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ OpenAI 配置 ──────────────────────────┐│
│  │ API Key：sk-proj-••••••••  [测试连接] ││
│  │ 模型：gpt-4o                          ││
│  │ Temperature：0.7                      ││
│  └────────────────────────────────────────┘│
│                                             │
│  ┌─ 飞书配置 ────────────────────────────┐ │
│  │ App ID：cli_••••••••                  │ │
│  │ App Secret：••••••••  [测试发送]      │ │
│  │ 通知群聊 ID：oc_••••••••              │ │
│  │ 定时通知时间：[08:00]                 │ │
│  │ 启用定时通知：[✓]                     │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ To-Do 工具配置 ───────────────────────┐│
│  │ 默认任务状态：待办                    ││
│  │ 每页显示数量：20                      ││
│  │ 已完成任务保留天数：30                ││
│  └────────────────────────────────────────┘│
│                                             │
│               [保存配置]                    │
└─────────────────────────────────────────────┘
```

### 7.2 配置存储方案

**数据库模型：**
```prisma
model Config {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}
```

**加密存储敏感信息：**
- API Key、Secret 使用 `crypto` 模块加密后存储
- 读取时解密

**测试功能：**
- OpenAI：调用简单 API 验证 Key 有效性
- 飞书：发送测试消息到指定群聊

---

## 8. 认证系统

### 8.1 首次启动流程

```
应用启动
    ↓
检查数据库是否有用户
    ↓
    └─→ 有 → 显示登录页（/login）
    └─→ 无 → 显示初始化页（/init）
              ↓
         设置用户名和密码
              ↓
         创建第一个用户
              ↓
         自动登录并跳转首页
```

### 8.2 登录流程

```
用户访问 /login
    ↓
输入用户名 + 密码
    ↓
POST /api/auth/login
    ↓
验证密码（bcrypt.compare）
    ↓
    └─→ 成功 → 创建 Session
                生成随机 token
                设置 httpOnly Cookie
                返回成功
                跳转到首页
    └─→ 失败 → 返回错误提示
```

### 8.3 中间件保护

**middleware.ts:**
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  // 需要认证的路径
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const session = await verifySession(token);
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*']
};
```

### 8.4 Session 管理

- **有效期**：30 天
- **滑动窗口**：每次请求自动延长过期时间
- **登出**：删除 Session 记录和 Cookie

---

## 9. 首页与负责人管理

### 9.1 首页设计（/）

**工具卡片网格：**

```
┌──────────────────────┐  ┌──────────────────────┐
│  📋 To-Do List       │  │  🔧 工具 2           │
│                      │  │                      │
│  AI 驱动的任务管理   │  │  即将推出...         │
│                      │  │                      │
│  🔴 今日截止：3      │  │                      │
│  🟡 本周截止：8      │  │                      │
│  📝 总待办：15       │  │  [敬请期待]          │
│                      │  │                      │
│  [进入工具]          │  │                      │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│  🔧 工具 3           │  │  🔧 工具 4           │
│                      │  │                      │
│  即将推出...         │  │  即将推出...         │
└──────────────────────┘  └──────────────────────┘
```

### 9.2 负责人管理（/todo/assignees）

**页面布局：**

```
┌─────────────────────────────────────────────┐
│  👥 负责人管理                    ➕ 添加   │
├─────────────────────────────────────────────┤
│  ┌────┬────────┬──────────────┬──────┬────┐│
│  │ ID │ 姓名   │ 飞书 User ID │ 任务 │ 操作││
│  ├────┼────────┼──────────────┼──────┼────┤│
│  │  1 │ 张三   │ ou_xxx       │  5   │ ✏️🗑││
│  │  2 │ 李四   │ ou_yyy       │  3   │ ✏️🗑││
│  │  3 │ 王五   │ -            │  2   │ ✏️🗑││
│  └────┴────────┴──────────────┴──────┴────┘│
└─────────────────────────────────────────────┘
```

**添加/编辑弹窗：**
- 姓名（必填）
- 飞书 User ID（可选）
  - 提供"查找"按钮，调用飞书 API 自动获取
  - 或手动输入

**删除逻辑：**
- 如果负责人有关联任务，提示：
  ```
  该负责人有 5 个关联任务，删除后这些任务的负责人将被清空。
  [取消] [确认删除]
  ```

---

## 10. 部署方案

### 10.1 本地部署（推荐）

**环境要求：**
- Node.js 18+
- PostgreSQL 14+

**部署步骤：**

```bash
# 1. 克隆项目（或解压）
cd poamaster

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入以下配置：
# DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"
# SESSION_SECRET="随机生成的密钥，至少32字符"
# OPENAI_API_KEY="sk-proj-..."  (可稍后在配置页设置)

# 4. 初始化数据库
npx prisma migrate deploy
npx prisma generate

# 5. 构建应用
npm run build

# 6. 启动应用
npm run start

# 7. 访问应用
# 浏览器打开 http://localhost:3000
```

**持久化运行（使用 PM2）：**

```bash
npm install -g pm2

# 启动应用
pm2 start npm --name poamaster -- start

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 10.2 Docker 部署

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/poamaster
      SESSION_SECRET: your-secret-key
    depends_on:
      - db

  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: poamaster
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**启动：**
```bash
docker-compose up -d
```

### 10.3 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| DATABASE_URL | PostgreSQL 连接字符串 | postgresql://user:pass@localhost:5432/db |
| SESSION_SECRET | Session 加密密钥 | 随机32字符以上 |
| OPENAI_API_KEY | OpenAI API Key（可选，可在配置页设置） | sk-proj-... |
| NODE_ENV | 运行环境 | production |
| PORT | 监听端口 | 3000（默认） |

---

## 11. 开发指南

### 11.1 开发环境启动

```bash
# 启动开发服务器
npm run dev

# 打开数据库管理界面
npx prisma studio

# 数据库迁移
npx prisma migrate dev --name description
```

### 11.2 代码规范

- **TypeScript**：严格模式，所有类型必须明确
- **命名规范**：
  - 组件：PascalCase（TaskTable.tsx）
  - 函数/变量：camelCase（getUserTasks）
  - 常量：UPPER_SNAKE_CASE（API_BASE_URL）
- **文件组织**：
  - 页面放在 `app/` 目录
  - 可复用组件放在 `components/`
  - 业务逻辑放在 `services/`
  - 工具函数放在 `lib/`

### 11.3 Git 工作流

```bash
# 创建功能分支
git checkout -b feature/task-extraction

# 提交代码
git add .
git commit -m "feat: 实现 AI 任务提取功能"

# 合并到主分支
git checkout main
git merge feature/task-extraction
```

---

## 12. 未来扩展

### 12.1 短期优化

- 任务批量操作（批量删除、批量改状态）
- 任务搜索功能（全文搜索标题、DoD）
- 任务导出（Excel、CSV）
- 飞书互动按钮（在飞书消息卡片上直接标记完成）

### 12.2 中期功能

- 任务优先级（高、中、低）
- 任务标签/分类
- 任务评论/备注
- 移动端响应式优化

### 12.3 长期规划

- 第二个工具：时间跟踪器
- 第三个工具：知识库管理
- 多用户支持（团队协作）
- 权限管理（不同角色）
- 飞书小程序版本

---

## 13. 总结

### 13.1 核心价值

**POA Master** 通过以下方式提升个人/团队效率：

1. **AI 驱动的任务提取**：从非结构化文本快速创建任务，省去手动输入
2. **统一的工具平台**：所有工具共享基础设施，避免重复开发
3. **智能通知**：飞书定时推送，确保任务不遗漏
4. **简洁易用**：个人使用场景，去除复杂的权限、审批流程

### 13.2 技术亮点

- Next.js 全栈架构，前后端一体化
- Prisma ORM 类型安全，开发效率高
- OpenAI GPT-4o 强大的理解能力
- 飞书开放平台企业级集成
- Material UI 丰富的组件库

### 13.3 实施路径

1. **阶段一：基础架构**（1-2天）
   - Next.js 项目初始化
   - Prisma + PostgreSQL 配置
   - 认证系统实现
   - 统一配置页

2. **阶段二：To-Do 核心功能**（3-4天）
   - 任务 CRUD API
   - AI 提取功能
   - 任务列表页面
   - 负责人管理

3. **阶段三：飞书集成**（1-2天）
   - 飞书 API 封装
   - 定时任务实现
   - 消息卡片设计

4. **阶段四：测试与优化**（1-2天）
   - 功能测试
   - UI/UX 优化
   - 部署上线

**预计总开发时间：7-10 天**

---

## 附录

### A. 技术栈版本

| 依赖 | 版本 |
|------|------|
| Next.js | ^14.0.0 |
| React | ^18.0.0 |
| TypeScript | ^5.0.0 |
| Prisma | ^5.0.0 |
| @mui/material | ^5.14.0 |
| openai | ^4.0.0 |
| node-cron | ^3.0.0 |
| bcrypt | ^5.1.0 |

### B. 参考资源

- [Next.js 官方文档](https://nextjs.org/docs)
- [Prisma 官方文档](https://www.prisma.io/docs)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [飞书开放平台文档](https://open.feishu.cn/document)
- [Material UI 文档](https://mui.com/material-ui/)

---

**文档结束**
