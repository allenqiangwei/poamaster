/**
 * Batch Chat Analyzer — runs daily to:
 * 1. Aggregate messages per chat for the last 24 hours
 * 2. Send to LLM for deep analysis (digests + signals)
 * 3. Compute TeamPulse metrics (activity, sentiment)
 * 4. Store results in ChatDigest, ChatSignal, TeamPulse
 */

import { PrismaClient } from '@prisma/client';
import { getOpenAIClient } from '@/lib/openai';

const prisma = new PrismaClient();

interface AnalysisResult {
  summary: string;
  keyTopics: string[];
  signals: Array<{
    type: 'DECISION' | 'ACTION' | 'SENTIMENT';
    title: string;
    summary: string;
    relatedUser?: string;
    severity: string;
  }>;
  sentimentScore: number; // -1 to 1
}

/**
 * Run the full daily analysis pipeline.
 * Called by the scheduler at 8:30 AM.
 */
export async function runDailyAnalysis(): Promise<{
  chatsAnalyzed: number;
  signalsCreated: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Get all active (non-blacklisted) group chats
  const chats = await prisma.feishuChat.findMany({
    where: { isBlacklisted: false, chatType: 'group' },
    select: { chatId: true, name: true },
  });

  let chatsAnalyzed = 0;
  let signalsCreated = 0;

  for (const chat of chats) {
    // 2. Get messages from last 24h
    const messages = await prisma.feishuMessage.findMany({
      where: {
        chatId: chat.chatId,
        timestamp: { gte: since },
        msgType: { in: ['text', 'post'] },
        content: { not: '' },
      },
      orderBy: { timestamp: 'asc' },
      select: { messageId: true, senderName: true, content: true, timestamp: true },
    });

    // Skip chats with too few messages
    if (messages.length < 3) continue;

    try {
      // 3. LLM analysis
      const analysis = await analyzeChat(chat.name || chat.chatId, messages);

      // 4. Store ChatDigest (upsert for idempotency)
      await prisma.chatDigest.upsert({
        where: { chatId_date: { chatId: chat.chatId, date: today } },
        create: {
          chatId: chat.chatId,
          date: today,
          summary: analysis.summary,
          keyTopics: analysis.keyTopics,
          messageCount: messages.length,
          activeUsers: [...new Set(messages.map(m => m.senderName))],
          signalCount: countSignalsByType(analysis.signals),
        },
        update: {
          summary: analysis.summary,
          keyTopics: analysis.keyTopics,
          messageCount: messages.length,
          activeUsers: [...new Set(messages.map(m => m.senderName))],
          signalCount: countSignalsByType(analysis.signals),
        },
      });

      // 5. Store ChatSignals from LLM analysis
      for (const signal of analysis.signals) {
        await prisma.chatSignal.create({
          data: {
            chatId: chat.chatId,
            signalType: signal.type,
            severity: signal.severity,
            title: signal.title,
            summary: signal.summary,
            messageIds: [],
            relatedUser: signal.relatedUser || null,
            source: 'batch',
          },
        });
        signalsCreated++;
      }

      // 6. Compute and store TeamPulse metrics
      await computeTeamPulse(chat.chatId, today, messages, analysis.sentimentScore);

      chatsAnalyzed++;
    } catch (err: any) {
      console.error(`[TeamPulse] Failed to analyze chat ${chat.name}: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  return { chatsAnalyzed, signalsCreated };
}

/** Send messages to LLM for deep analysis */
async function analyzeChat(
  chatName: string,
  messages: Array<{ senderName: string; content: string; timestamp: Date }>
): Promise<AnalysisResult> {
  const openai = await getOpenAIClient();

  // Format messages for LLM (limit to ~4000 chars to control cost)
  const formatted = messages.map(m => {
    const time = m.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const text = m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content;
    return `[${time}] ${m.senderName}: ${text}`;
  });

  // Truncate if too long
  let transcript = formatted.join('\n');
  if (transcript.length > 4000) {
    transcript = transcript.substring(0, 4000) + '\n... (truncated)';
  }

  const systemPrompt = `你是一个运营分析助手。分析工作群聊对话，提取运营信号。

请以JSON格式返回分析结果：
{
  "summary": "3-5句话总结今天的主要讨论内容",
  "keyTopics": ["话题1", "话题2"],
  "signals": [
    {
      "type": "DECISION|ACTION|SENTIMENT",
      "title": "简短标题",
      "summary": "具体描述",
      "relatedUser": "相关人员（可选）",
      "severity": "LOW|MEDIUM|HIGH"
    }
  ],
  "sentimentScore": 0.0
}

信号类型说明：
- DECISION: 群里做出的决策或确认的方案
- ACTION: 需要跟进的待办事项
- SENTIMENT: 从对话语气感受到的团队情绪（正面/负面/压力）

sentimentScore: -1.0（非常负面）到 1.0（非常正面），0为中性

注意：
- 只提取有实际内容的信号，不要凭空编造
- 如果没有某类信号，signals数组中就不包含该类型
- 关注实际的运营价值，忽略闲聊`;

  const userPrompt = `群聊名称: ${chatName}\n对话记录（过去24小时）:\n\n${transcript}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 1000,
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      keyTopics: parsed.keyTopics || [],
      signals: (parsed.signals || []).map((s: any) => ({
        type: s.type || 'ACTION',
        title: s.title || '',
        summary: s.summary || '',
        relatedUser: s.relatedUser || undefined,
        severity: s.severity || 'MEDIUM',
      })),
      sentimentScore: typeof parsed.sentimentScore === 'number'
        ? Math.max(-1, Math.min(1, parsed.sentimentScore))
        : 0,
    };
  } catch (err: any) {
    console.error(`[TeamPulse] LLM analysis failed: ${err.message}`);
    // Fallback: no signals, neutral sentiment
    return {
      summary: `${chatName} 今日共 ${messages.length} 条消息。`,
      keyTopics: [],
      signals: [],
      sentimentScore: 0,
    };
  }
}

/** Compute and store TeamPulse metrics (no LLM needed) */
async function computeTeamPulse(
  chatId: string,
  date: Date,
  messages: Array<{ senderName: string; timestamp: Date }>,
  sentimentScore: number,
): Promise<void> {
  const uniqueUsers = new Set(messages.map(m => m.senderName));

  // Calculate peak hour
  const hourCounts = new Array(24).fill(0);
  for (const m of messages) {
    hourCounts[m.timestamp.getHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Calculate average response time (minutes between consecutive messages)
  let totalGap = 0;
  let gapCount = 0;
  for (let i = 1; i < messages.length; i++) {
    const gap = (messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime()) / 60000;
    if (gap < 120) { // Only count gaps under 2 hours (filter out overnight)
      totalGap += gap;
      gapCount++;
    }
  }
  const avgResponseTime = gapCount > 0 ? Math.round(totalGap / gapCount * 10) / 10 : null;

  await prisma.teamPulse.upsert({
    where: { chatId_date: { chatId, date } },
    create: {
      chatId,
      date,
      messageCount: messages.length,
      activeUserCount: uniqueUsers.size,
      sentimentScore,
      avgResponseTime,
      peakHour,
    },
    update: {
      messageCount: messages.length,
      activeUserCount: uniqueUsers.size,
      sentimentScore,
      avgResponseTime,
      peakHour,
    },
  });
}

function countSignalsByType(signals: AnalysisResult['signals']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  return counts;
}

/**
 * Generate a formatted text summary of today's team pulse.
 * Called by the scheduler after analysis completes.
 */
export async function generatePulseSummary(): Promise<string> {
  const db = new PrismaClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [digests, signals, pulses] = await Promise.all([
      db.chatDigest.findMany({
        where: { date: today },
        include: { chat: { select: { name: true } } },
        orderBy: { messageCount: 'desc' },
      }),
      db.chatSignal.findMany({
        where: { detectedAt: { gte: today }, isResolved: false },
        include: { chat: { select: { name: true } } },
      }),
      db.teamPulse.findMany({
        where: { date: today },
      }),
    ]);

    const totalMessages = pulses.reduce((s, p) => s + p.messageCount, 0);
    const activeChats = pulses.length;
    const dateStr = today.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const lines: string[] = [
      `📊 团队脉搏 — ${dateStr}`,
      '',
      `群聊: ${activeChats} 个活跃 | 消息: ${totalMessages} 条`,
    ];

    // Unresolved signals by type
    if (signals.length > 0) {
      const bySeverity = signals.filter(s => s.severity === 'CRITICAL' || s.severity === 'HIGH');
      lines.push('');
      lines.push(`⚠️ 未处理信号: ${signals.length} 条${bySeverity.length > 0 ? ` (${bySeverity.length} 条高优)` : ''}`);
      for (const s of bySeverity.slice(0, 5)) {
        lines.push(`  • [${s.signalType}] ${s.title} — ${s.chat.name || '未命名'}`);
      }
    }

    // Top chat digests
    if (digests.length > 0) {
      lines.push('');
      lines.push('📝 群聊摘要:');
      for (const d of digests.slice(0, 3)) {
        const summary = d.summary.length > 60 ? d.summary.substring(0, 60) + '...' : d.summary;
        lines.push(`  ${d.chat.name}: ${summary}`);
      }
    }

    lines.push('');
    lines.push('查看详情: /feishu/pulse');

    return lines.join('\n');
  } finally {
    await db.$disconnect();
  }
}
