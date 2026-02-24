import { getOpenAIClient } from '@/lib/openai';
import { DailyData } from './collector';

// Same-day cache
const cache = new Map<string, { content: string; generatedAt: Date }>();

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Format DailyData as plain text (fallback when LLM fails) */
function formatFallback(data: DailyData): string {
  const lines: string[] = [];
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  lines.push(`## ${dateStr} 每日简报\n`);

  // Tasks
  lines.push(`### 任务`);
  if (data.tasks.overdue.length > 0) {
    lines.push(`**逾期任务 (${data.tasks.overdue.length})**:`);
    for (const t of data.tasks.overdue) {
      lines.push(`- ${t.title} (${t.assignee}, 截止 ${t.dueDate})`);
    }
  }
  lines.push(`- 新建: ${data.tasks.created} | 进行中: ${data.tasks.inProgress} | 已完成: ${data.tasks.completed}\n`);

  // Feishu
  if (data.feishu.totalMessages > 0) {
    lines.push(`### 飞书消息`);
    lines.push(`共 ${data.feishu.totalMessages} 条消息`);
    if (data.feishu.topChats.length > 0) {
      lines.push(`最活跃对话: ${data.feishu.topChats.map(c => `${c.name}(${c.count})`).join(', ')}`);
    }
    lines.push('');
  }

  // Pulse
  if (data.pulse.newReports > 0 || data.pulse.completedAnalyses > 0) {
    lines.push(`### 项目管理`);
    lines.push(`新报告: ${data.pulse.newReports} | 完成分析: ${data.pulse.completedAnalyses}\n`);
  }

  // Roundtable
  if (data.roundtable.completedDiscussions > 0 || data.roundtable.newActions > 0 || data.roundtable.newRisks > 0) {
    lines.push(`### 圆桌会议`);
    lines.push(`完成讨论: ${data.roundtable.completedDiscussions} | 新行动项: ${data.roundtable.newActions} | 新风险: ${data.roundtable.newRisks}`);
  }

  // Sentiment
  if (data.sentiment && data.sentiment.totalReviews > 0) {
    lines.push('');
    lines.push(`### 舆情监控`);
    lines.push(`新增评论: ${data.sentiment.totalReviews} (正面 ${data.sentiment.positive} / 中性 ${data.sentiment.neutral} / 负面 ${data.sentiment.negative})`);
    if (data.sentiment.games.length > 0) {
      lines.push(`游戏: ${data.sentiment.games.map(g => `${g.name}(${g.reviewCount}条, 均分${g.avgRating ?? '-'})`).join(', ')}`);
    }
    if (data.sentiment.topIssues.length > 0) {
      lines.push(`热点问题: ${data.sentiment.topIssues.map(i => `${i.tag}(${i.count})`).join(', ')}`);
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `你是 POA Master 的每日简报助手。根据提供的过去24小时活动数据，生成一份简洁的中文早报。

要求：
1. 先用一句话总结当天整体状况（如："今日有3项逾期任务需关注，飞书消息活跃"）
2. 按优先级排列重点事项，逾期任务最重要
3. 飞书消息只提关键数字和最活跃话题
4. 舆情数据关注负面评论占比和热点问题，如有异常波动需重点提示
5. 如果某个数据源没有数据，跳过不提
6. 用 markdown 格式，适合卡片展示
7. 控制在 400 字以内
8. 语气简洁专业，不要客套`;

export async function generateBriefing(data: DailyData, forceRefresh = false): Promise<string> {
  const key = dateKey(new Date());

  // Return cache if available and not forcing refresh
  if (!forceRefresh) {
    const cached = cache.get(key);
    if (cached) return cached.content;
  }

  try {
    const client = await getOpenAIClient();

    const response = await client.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `当前日期：${key}\n\n活动数据：\n${JSON.stringify(data, null, 2)}`,
        },
      ],
      temperature: 0.5,
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || formatFallback(data);

    cache.set(key, { content, generatedAt: new Date() });
    return content;
  } catch (error: any) {
    console.error('LLM briefing generation failed:', error.message);
    // Fallback to plain text
    const fallback = formatFallback(data);
    cache.set(key, { content: fallback, generatedAt: new Date() });
    return fallback;
  }
}
