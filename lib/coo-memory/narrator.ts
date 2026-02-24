import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import type { CooSnapshot } from './collector';

// ---- Holiday / Date Context ----

interface DateContext {
  dateStr: string;       // YYYY-MM-DD
  weekday: string;       // 星期一..日
  isWeekend: boolean;
  holiday: string | null; // e.g. "春节假期第3天" or null
  note: string;          // One-line context for LLM
}

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * Chinese public holidays for 2026.
 * Format: [startDate, endDate, name]
 * Dates are inclusive. Lunar dates based on 2026 lunar calendar.
 * 2026 农历新年（初一）= 2月17日
 */
const HOLIDAYS_2026: Array<[string, string, string]> = [
  ['2026-01-01', '2026-01-03', '元旦'],
  ['2026-02-15', '2026-02-21', '春节'],        // 除夕2/16，初一2/17，假期含调休2/15-2/21
  ['2026-04-04', '2026-04-06', '清明节'],
  ['2026-05-01', '2026-05-05', '劳动节'],
  ['2026-06-19', '2026-06-21', '端午节'],       // 五月初五 = 6/19
  ['2026-10-01', '2026-10-08', '中秋+国庆'],    // 中秋10/4，与国庆合并放假
];

function getDateContext(dateStr: string): DateContext {
  const d = new Date(dateStr);
  const dayOfWeek = d.getDay();
  const weekday = WEEKDAY_NAMES[dayOfWeek];
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Check holidays
  let holiday: string | null = null;
  for (const [start, end, name] of HOLIDAYS_2026) {
    const s = new Date(start);
    const e = new Date(end);
    if (d >= s && d <= e) {
      const dayNum = Math.floor((d.getTime() - s.getTime()) / 86400000) + 1;
      const totalDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
      holiday = `${name}（第${dayNum}天/共${totalDays}天）`;
      break;
    }
  }

  let note = `${dateStr} ${weekday}`;
  if (holiday) {
    note += `，${holiday}。节假日期间各项指标低于工作日属于正常现象，关注异常波动即可。`;
  } else if (isWeekend) {
    note += `，周末。周末数据量通常低于工作日，重点关注是否有异常活动。`;
  } else {
    note += `，工作日。`;
  }

  return { dateStr, weekday, isWeekend, holiday, note };
}

// ---- Narrative Generation ----

/**
 * Generate daily narrative, changes detection, and action items from snapshot.
 */
export async function generateNarrative(
  snapshot: CooSnapshot
): Promise<{ narrative: string; changes: string; actions: string }> {
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();
  const dateCtx = getDateContext(snapshot.date);

  // Fetch yesterday's episode for comparison
  const yesterday = new Date(snapshot.date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = new Date(yesterday.toISOString().split('T')[0]);

  const yesterdayEpisode = await prisma.cooMemoryEpisode.findUnique({
    where: { date: yesterdayDate },
    select: { snapshot: true, narrative: true },
  });

  const yesterdaySnapshot = yesterdayEpisode?.snapshot
    ? JSON.parse(yesterdayEpisode.snapshot) as CooSnapshot
    : null;

  // --- Step 1: Generate narrative + changes ---
  const narrativePrompt = buildNarrativePrompt(snapshot, yesterdaySnapshot, dateCtx);

  const narrativeResponse = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: NARRATIVE_SYSTEM_PROMPT,
      },
      { role: 'user', content: narrativePrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_completion_tokens: 4000,
  });

  const narrativeContent = narrativeResponse.choices[0]?.message?.content || '{}';
  const narrativeParsed = JSON.parse(narrativeContent);

  // --- Step 2: Generate action items ---
  const actionsResponse = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: ACTIONS_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildActionsPrompt(snapshot, narrativeParsed, dateCtx),
      },
    ],
    temperature: 0.4,
    max_completion_tokens: 1500,
  });

  const actions = actionsResponse.choices[0]?.message?.content || '暂无行动建议。';

  return {
    narrative: narrativeParsed.narrative || '当日数据采集完成，暂无叙事。',
    changes: narrativeParsed.changes || '首次记录，暂无历史对比。',
    actions,
  };
}

// ---- System Prompts ----

const NARRATIVE_SYSTEM_PROMPT = `你是一位世界一流的 COO（首席运营官），同时也是优秀的商业叙事者。你每天晚上回顾业务数据，像写一篇引人入胜的商业评论文章一样撰写当日复盘。

## 写作风格

**不要写模板化的报告，要写有血有肉的商业故事。**

好的写法：
> 今天团队的执行力出现了一个值得关注的信号——张三负责的 3 个关键任务全部逾期，而他上周还是完成率最高的人。这不像是态度问题，更像是遇到了阻塞。与此同时，飞书"产品技术群"的消息量暴增到 47 条，是昨天的 3 倍，主要围绕一个线上 Bug 的讨论。把这两个信号放在一起看，大概率是线上问题吸走了张三的精力...

差的写法：
> 今日逾期任务 3 个，飞书消息量上升。建议关注。

## 核心原则

1. **用叙事方式展开**——不要用"任务概况""决策进展"等模板标题，像写分析文章一样自然展开
2. **构建因果链**——把不同维度的数据串联起来，A 导致了 B，B 又引发了 C
3. **提到具体名称**——人名、任务名、群组名、数字、百分比，越具体越好
4. **有温度**——关注人的状态，不只是冷冰冰的数字
5. **节假日意识**——如果是节假日或周末，数据低迷是正常的，不要大惊小怪，重点关注异常信号
6. **前瞻性判断**——这些数据背后暗示了什么趋势？明天需要注意什么？
7. **整合外部情报**——如果洞察简报中有行业动态、竞品变化或风险信号，要把它们与内部运营数据交叉分析。例如：竞品发布新功能 → 我们的产品迭代节奏是否跟上？行业趋势变化 → 对我们的OKR有什么影响？

## 输出格式

严格 JSON：
{
  "narrative": "Markdown 格式的当日叙事（500-800字）。用讲故事的方式描述今天发生了什么，哪些值得关注，哪些是风险信号。要把洞察简报中与 COO 相关的外部情报（行业趋势、竞品动态、风险信号）有机融入叙事，与内部运营数据交叉分析。用 **加粗** 强调关键信息。",
  "changes": "Markdown 格式的变化分析（200-400字）。不要简单罗列数字变化，而是解读变化背后的含义。如果没有昨日数据，写一段对当前状态的基线描述。"
}`;

const ACTIONS_SYSTEM_PROMPT = `你是行业前 1% 的 COO，以务实和精准著称。你从不给空话建议。

## 写作风格

每条建议必须像一个 **可直接执行的待办事项**，读完就能行动：

好的建议：
> 1. **明早 standup 后找张三聊 15 分钟**——他本周 3 个任务全部逾期，结合飞书群里关于线上 Bug 的讨论，大概率是被技术问题阻塞了。先了解情况，必要时协调资源帮他解除阻塞。

差的建议：
> 1. 建议关注逾期任务情况，加强团队沟通。

## 要求

1. 给出 3-5 条建议，按紧急程度排序
2. 每条有 **明确的行动主体、时间（今天/明早/本周内）和具体做什么**
3. 基于数据和因果推理，不是泛泛而谈
4. 如果是节假日/周末，建议应以"节后第一天需要做的事"为视角
5. 用 Markdown 编号列表，核心行动 **加粗**`;

// ---- Prompt Builders ----

function buildActionsPrompt(
  snapshot: CooSnapshot,
  narrativeParsed: { narrative?: string; changes?: string },
  dateCtx: DateContext,
): string {
  let prompt = `## 日期背景\n${dateCtx.note}\n\n`;
  prompt += `## 今日数据摘要\n${JSON.stringify(snapshot, null, 2)}\n\n`;
  prompt += `## 今日叙事\n${narrativeParsed.narrative || '无'}\n\n`;
  prompt += `## 变化分析\n${narrativeParsed.changes || '无'}\n\n`;
  prompt += `请给出行动建议。`;
  return prompt;
}

function buildNarrativePrompt(today: CooSnapshot, yesterday: CooSnapshot | null, dateCtx: DateContext): string {
  let prompt = `## 日期背景\n${dateCtx.note}\n\n`;
  prompt += `## 今日业务数据（${today.date}）\n\n`;

  // Tasks
  prompt += `### 任务\n`;
  prompt += `- 总任务数：${today.tasks.total}\n`;
  prompt += `- 状态分布：${Object.entries(today.tasks.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
  prompt += `- 今日新增：${today.tasks.createdToday}，完成：${today.tasks.completedToday}\n`;
  prompt += `- 逾期任务：${today.tasks.overdueCount} 个\n`;
  if (today.tasks.overdueList.length > 0) {
    prompt += `- 逾期明细：\n${today.tasks.overdueList.map(t => `  - ${t.title}（${t.assignee}，截止 ${t.dueDate}）`).join('\n')}\n`;
  }
  if (today.tasks.byAssignee.length > 0) {
    prompt += `- 按负责人：\n${today.tasks.byAssignee.map(a => `  - ${a.name}：总${a.total}/完成${a.done}/逾期${a.overdue}`).join('\n')}\n`;
  }

  // Decisions
  prompt += `\n### 决策\n`;
  prompt += `- 总数：${today.decisions.total}\n`;
  prompt += `- 状态分布：${Object.entries(today.decisions.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
  prompt += `- 执行率：${today.decisions.executionRate}%\n`;
  if (today.decisions.overdueList.length > 0) {
    prompt += `- 逾期决策：\n${today.decisions.overdueList.map(d => `  - ${d.title}（${d.madeBy}，复查日期 ${d.reviewDate}）`).join('\n')}\n`;
  }

  // OKR
  prompt += `\n### OKR\n`;
  prompt += `- 目标总数：${today.okr.totalObjectives}（活跃 ${today.okr.activeObjectives}，已完成 ${today.okr.completedObjectives}）\n`;
  prompt += `- KR 平均进度：${today.okr.avgKrProgress}%\n`;
  if (today.okr.atRiskKrs.length > 0) {
    prompt += `- 风险 KR：\n${today.okr.atRiskKrs.map(kr => `  - ${kr.title}（目标：${kr.objective}，负责人：${kr.owner}，进度 ${kr.progress}%）`).join('\n')}\n`;
  }

  // Team Pulse
  prompt += `\n### 团队脉搏\n`;
  prompt += `- 今日消息量：${today.teamPulse.todayMessages}\n`;
  prompt += `- 活跃用户：${today.teamPulse.activeUsers}\n`;
  if (today.teamPulse.avgSentiment !== null) prompt += `- 情绪评分：${today.teamPulse.avgSentiment}\n`;
  if (today.teamPulse.avgResponseTime !== null) prompt += `- 平均响应时间：${today.teamPulse.avgResponseTime}分钟\n`;

  // Sentiment
  prompt += `\n### 舆情\n`;
  prompt += `- 今日评论：${today.sentiment.totalReviews}（正面 ${today.sentiment.positive}/中性 ${today.sentiment.neutral}/负面 ${today.sentiment.negative}）\n`;
  if (today.sentiment.avgRating !== null) prompt += `- 平均评分：${today.sentiment.avgRating}\n`;
  prompt += `- 活跃警报：${today.sentiment.activeAlerts}\n`;
  if (today.sentiment.topIssues.length > 0) prompt += `- 主要问题：${today.sentiment.topIssues.join('、')}\n`;

  // Competitors
  prompt += `\n### 竞品\n`;
  prompt += `- 监控竞品：${today.competitors.trackedCount} 家\n`;
  prompt += `- 今日新闻：${today.competitors.newNews}，新评论：${today.competitors.newReviews}，网站变化：${today.competitors.webChanges}\n`;

  // Feishu
  prompt += `\n### 飞书（重要：请认真分析飞书消息内容，这是团队沟通的一手信息）\n`;
  prompt += `- 今日消息：${today.feishu.todayMessages}，活跃群组：${today.feishu.activeChats}\n`;
  prompt += `- 未解决信号：${today.feishu.unresolvedSignals}\n`;
  if (today.feishu.topChats.length > 0) {
    prompt += `- 最活跃群组：${today.feishu.topChats.map(c => `${c.name}(${c.count}条)`).join('、')}\n`;
  }
  if (today.feishu.recentSignals && today.feishu.recentSignals.length > 0) {
    prompt += `- 检测到的信号：\n${today.feishu.recentSignals.map(s => `  - [${s.severity}] ${s.title}（${s.chat}）：${s.summary}`).join('\n')}\n`;
  }
  if (today.feishu.messageDigest && today.feishu.messageDigest.length > 0) {
    prompt += `- 关键消息摘要：\n`;
    for (const m of today.feishu.messageDigest) {
      prompt += `  - [${m.time}] ${m.chat} | ${m.sender}：${m.content.substring(0, 150)}\n`;
    }
  }

  // Insights
  prompt += `\n### 洞察简报（重要：这些是 AI 研究员今天通过互联网搜索生成的行业/竞品/风险情报，请认真分析并纳入叙事）\n`;
  prompt += `- 今日生成卡片：${today.insights.todayCards}，监控话题数：${today.insights.topicCount}\n`;
  if (today.insights.briefingSummary) {
    prompt += `- 简报执行摘要：\n${today.insights.briefingSummary}\n`;
  }
  if (today.insights.cards && today.insights.cards.length > 0) {
    prompt += `- 洞察卡片详情：\n`;
    for (const card of today.insights.cards) {
      prompt += `  - [${card.category}/${card.priority}] **${card.title}**\n`;
      prompt += `    摘要：${card.summary}\n`;
      if (card.impact) prompt += `    影响：${card.impact}\n`;
      if (card.action) prompt += `    建议行动：${card.action}\n`;
    }
  }

  // Yesterday comparison
  if (yesterday) {
    prompt += `\n---\n## 昨日数据对比（${yesterday.date}）\n`;
    prompt += `- 任务总数：${yesterday.tasks.total}（今日 ${today.tasks.total}）\n`;
    prompt += `- 昨日完成：${yesterday.tasks.completedToday}（今日 ${today.tasks.completedToday}）\n`;
    prompt += `- 昨日逾期：${yesterday.tasks.overdueCount}（今日 ${today.tasks.overdueCount}）\n`;
    prompt += `- 昨日决策执行率：${yesterday.decisions.executionRate}%（今日 ${today.decisions.executionRate}%）\n`;
    prompt += `- 昨日 KR 平均进度：${yesterday.okr.avgKrProgress}%（今日 ${today.okr.avgKrProgress}%）\n`;
    prompt += `- 昨日飞书消息：${yesterday.feishu.todayMessages}（今日 ${today.feishu.todayMessages}）\n`;
  } else {
    prompt += `\n---\n（首次记录，无昨日数据对比。请在 changes 中写一段对当前状态的基线描述。）\n`;
  }

  prompt += `\n请基于以上数据，用讲故事的方式撰写今日复盘。`;

  return prompt;
}
