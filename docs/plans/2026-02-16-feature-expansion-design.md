# POA Master 功能扩展设计

## 概述

基于现有系统的深度审查，确定 4 个增强/新建方向，总工作量约 8 天。

---

## 方向 1：`/insights` 页面增强

**现状：** 已有 KPI 卡片、优先事项队列、AI 简报、活动概览、飞书动态、舆情监控。覆盖作战室 90% 需求。

**增强内容：**
1. **项目健康度热力图** — 按项目聚合任务完成率/逾期率/信号数，红绿灯一览
2. **决策执行率** — 显示本月决策执行率（已完成/总数），链接到 `/decisions`

**工作量：** ~1 天

---

## 方向 2：`/decisions` 页面增强

**现状：** 已有完整 CRUD、状态流转（PENDING→EXECUTING→COMPLETED→REVISED）、关联任务创建。

**增强内容：**
1. **完成率进度条** — 决策详情页显示关联任务的完成百分比
2. **超时预警** — 复盘日期到期但状态未完成的决策，高亮显示 + 推入 `/insights` 优先事项
3. **聚合统计** — 决策列表页顶部：总数、执行率、平均闭环天数

**工作量：** ~1 天

---

## 方向 3：飞书 Bot 升级为 Claude CLI 引擎

**现状：** `bot-agent.ts` 使用 OpenAI GPT-4o + 5 个只读 function calling tool，只能查询不能写入。网页端 ChatBubble 已通过 Claude CLI 实现全功能交互。

**目标：** 飞书 @Bot 达到和网页气泡相同的能力。

**方案：**
1. 在 feishu-listener 的 message-handler 中，将 `processMessage()` 替换为 `callClaude()`
2. 异步模式：先回复"正在处理..."，Claude 完成后发第二条消息
3. 安全控制：仅响应白名单用户（配置在 DB 中）
4. 会话续接：用 `BotConversation.claudeSessionId` 保持上下文

**依赖：**
- `lib/claude-bridge.ts` 中的 `callClaude()` 需要从 feishu-listener 进程可调用
- feishu-listener 是独立 Node.js 进程，需要把 `claude-bridge.ts` 的逻辑复制/共享过去

**工作量：** ~2 天

---

## 方向 4：OKR 仪表盘（全新功能）

**数据模型：**
- `Objective` — 目标：标题、描述、周期（Q1/Q2/月度）、负责人（Assignee）、状态、权重
- `KeyResult` — 关键结果：标题、目标值、当前值、单位、进度%、负责人（Assignee）
- 关联：Objective 1:N KeyResult，KeyResult N:N Task，Objective N:1 Assignee

**页面：**
- `/okr` — OKR 列表，按周期分组，支持按负责人筛选
- `/okr/[id]` — 目标详情，编辑 KR 进度，关联 Task/Decision
- `/assignees/[id]` — 增加"此人的 OKR"模块
- `/insights` — 增加"OKR 风险提醒"（进度落后于时间进度的 KR）

**COO 视角：** 全局一览所有人的 OKR 进度，谁落后、谁超前
**负责人视角：** 我的 OKR 列表、KR 进度更新

**工作量：** ~4 天

---

## 优先级

全部同时开始，用户确认 4 个方向都要做。
