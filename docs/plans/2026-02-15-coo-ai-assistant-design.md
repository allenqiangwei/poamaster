# COO AI 助手功能扩展设计

> 基于现有 POA Master 平台，新增 6 个模块提升 COO 运营效率和管理带宽。

## 设计原则

- 优先增强已有页面，不创建冗余入口
- 数据互通：所有模块共享飞书消息、任务、洞察、Team Pulse 等已有数据
- 最少新模型：仅在现有模型不能表达时才建新表

---

## Phase 1: 增强简报首页

**目标**：在现有 `/insights` 首页增加每日优先事项队列，帮助 COO 快速了解"今天最该关注什么"。

**现状**：`/insights` 已有统计卡片（逾期任务、飞书消息、已完成任务、进行中）、AI 简报、话题建议、活跃度概览。

**增强点**：
1. 新增"今日优先事项"区块，置于页面顶部（统计卡片下方、AI 简报上方）
2. 优先事项由 LLM 根据以下数据自动排序生成：
   - 逾期/即将到期的任务
   - 未处理的 Team Pulse 信号（尤其是 CONFLICT、DECISION 类型）
   - 情绪异常的群聊
   - 新增的高优洞察
3. 每个优先事项显示：标题、来源、紧急程度标签、一键跳转到详情
4. 可以标记"已处理"来消除优先事项

**API**：增强现有 `POST /api/insights/daily`，在返回数据中新增 `priorities` 数组。

**不新建页面**，在现有 InsightsPage 组件中增加 PriorityQueue 区块。

---

## Phase 2: 决策日志

**目标**：记录和跟踪重要决策的执行情况，确保决策不会"说了就忘"。

**与现有功能的关系**：
- Team Pulse 的 DECISION 信号 = 检测到"有人做了决策" → 通知
- 决策日志 = 记录决策内容、背景、预期结果、实际跟踪 → 管理工具
- 任务系统 = 具体执行步骤 → 决策日志可关联创建任务

**方案**：独立 Decision 模型（方案B：决策独立）

**数据模型**：
```
model Decision {
  id          String   @id @default(cuid())
  title       String          // 决策标题
  context     String?         // 决策背景
  outcome     String?         // 预期结果
  status      DecisionStatus  // PENDING / EXECUTING / COMPLETED / REVISED
  madeAt      DateTime        // 决策时间
  madeBy      String?         // 决策人
  reviewDate  DateTime?       // 复盘日期
  notes       String?         // 跟踪备注
  signalId    String?         // 关联的 ChatSignal（如从信号创建）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tasks       Task[]          // 关联的执行任务
}

enum DecisionStatus {
  PENDING
  EXECUTING
  COMPLETED
  REVISED
}
```

**UI 入口**：
- 新建 `/decisions` 页面：决策列表，支持按状态筛选
- `/decisions/[id]`：决策详情，显示关联任务、跟踪备注
- Team Pulse 信号卡片增加"记录为决策"按钮（类似已有的"创建任务"）

**API**：
- `GET/POST /api/decisions` — 列表和创建
- `GET/PATCH /api/decisions/[id]` — 详情和更新
- `POST /api/decisions/[id]/tasks` — 从决策创建关联任务

---

## Phase 3: 周报生成

**目标**：一键汇总本周工作，生成结构化周报。

**触发方式**：在任务界面 `/todo` 增加"生成周报"按钮，按需生成（非定时）。

**数据来源**：
- 本周完成的任务
- 本周新增的任务
- 本周 Team Pulse 趋势（消息量、活跃度、情绪变化）
- 本周重要信号和决策
- 本周飞书消息统计

**输出格式**：
```
一、本周完成
- [任务列表 + 完成情况]

二、进行中 / 待跟进
- [未完成的重点任务]

三、团队动态
- [消息活跃度、情绪趋势、关键信号]

四、下周计划
- [基于当前任务和信号的建议]
```

**API**：`POST /api/reports/weekly` — 接收 model 参数，汇总数据后调用 LLM 生成。

**UI**：
- `/todo` 页面头部增加"生成周报"按钮
- 点击后选择模型 → 生成 → 弹窗展示
- 支持复制、发送到飞书

---

## Phase 4: 增强人员画像

**目标**：在现有团队页面 `/assignees` 增加每个人的综合画像数据。

**现状**：`/assignees` 列表显示姓名、任务数、洞察数。`/assignees/[id]` 显示任务列表和洞察详情。

**增强点**：

### 列表页 `/assignees`：
- 每个人的卡片增加：活跃度指标、最近情绪趋势、未完成任务数

### 详情页 `/assignees/[id]`：
- 新增"综合画像"区块（页面顶部）：
  - 飞书消息活跃度（最近 7 天发言数、活跃群数）
  - 情绪趋势迷你图（基于 Team Pulse 情绪分数）
  - 任务完成率
  - 活跃信号数（与该人相关的未处理信号）

**数据来源**：关联 FeishuMessage（通过 senderName/senderId 匹配 Assignee.feishuUserId）和 Team Pulse 数据。

**API**：增强现有 `GET /api/assignees/[id]`，新增 `profile` 字段返回画像数据。或新建 `GET /api/assignees/[id]/profile` 单独获取。

---

## Phase 5: 增强会前简报

**目标**：扩展现有"生成周会议题"功能，加入更丰富的上下文数据。

**现状**：`/assignees/[id]` 页面的"生成周会议题"按钮，调用 `POST /api/insights/weekly-topics`，仅基于该人的 confirmedItems + tasks 生成。

**增强点**：修改 `POST /api/insights/weekly-topics` API：
1. 额外查询该人的飞书消息活跃度（最近一周发言频率、活跃群聊）
2. 查询与该人相关的 Team Pulse 信号（通过群聊关联）
3. 查询情绪趋势数据
4. 扩展 LLM prompt：先输出"该人最近状态概要"，再生成"会议议题"

**不需要新页面、新按钮** — 纯粹增强后端数据收集和 prompt。

**输出格式变更**：
```
【状态概要】
- 活跃度：本周发言 X 条，活跃于 N 个群
- 情绪趋势：[稳定/上升/下降]
- 活跃信号：N 个待处理

【会议议题】
1. ...（现有格式）

【关注事项】
- ...（现有格式）

【建议行动】
- ...（现有格式）
```

---

## Phase 6: 飞书自然语言助手

**目标**：在飞书中通过自然语言与 POA Master 交互，支持对话连续性。

**触发方式**：
- 在飞书群聊中 @Bot
- 或直接私聊 Bot
- 普通群消息不触发（避免噪音）

**交互示例**：
```
用户：今天有什么需要我关注的？
Bot：[返回今日优先事项摘要]

用户：张三最近怎么样？
Bot：[返回张三的活跃度、任务进展、情绪状态]

用户：他那个延期的项目呢？
Bot：[理解"他"=张三，返回其延期任务详情]
```

**架构**：
1. **消息拦截**：在现有 `services/feishu-listener/` 中增加 Bot 消息识别逻辑
   - 检测 @Bot 的消息或私聊消息
   - 将消息内容 + 会话上下文发送给处理模块
2. **意图识别 + 响应生成**：用 LLM 理解用户意图
   - 将用户消息 + 最近 N 轮对话历史 + 系统 function definitions 发给 LLM
   - LLM 调用内部 functions（查任务、查简报、查人员状态等）
   - 生成自然语言回复
3. **对话连续性**：数据库存储会话上下文
4. **回复**：通过飞书 Bot API 发送富文本消息到对应群聊/私聊

**数据模型**：
```
model BotConversation {
  id          String   @id @default(cuid())
  chatId      String           // 飞书群/私聊 ID
  messages    Json             // 最近对话历史 [{role, content, timestamp}]
  lastActiveAt DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([chatId])
}
```

**内部 Functions（LLM tool calling）**：
- `get_today_priorities()` — 今日优先事项
- `get_person_status(name)` — 人员状态概要
- `get_task_list(assignee?, status?)` — 任务查询
- `get_team_pulse(days?)` — 团队脉搏概览
- `get_weekly_summary()` — 周汇总

**飞书 Bot API**：需要配置飞书机器人的发消息权限，使用 `POST /open-apis/im/v1/messages` 发送回复。

---

## 实现顺序

按依赖关系排序：

1. **Phase 2: 决策日志** — 独立新功能，不依赖其他 Phase
2. **Phase 4: 增强人员画像** — 为 Phase 5 提供数据基础
3. **Phase 1: 增强简报首页** — 依赖决策数据（Phase 2）
4. **Phase 5: 增强会前简报** — 依赖人员画像数据（Phase 4）
5. **Phase 3: 周报生成** — 依赖决策数据（Phase 2）
6. **Phase 6: 飞书自然语言助手** — 依赖所有其他模块的 API
