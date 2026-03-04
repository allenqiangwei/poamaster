/**
 * Batch Chat Analyzer — runs daily to:
 * 1. Aggregate messages per chat for the last 24 hours
 * 2. Send to LLM for deep analysis (digests + signals)
 * 3. Compute TeamPulse metrics (activity, sentiment)
 * 4. Store results in ChatDigest, ChatSignal, TeamPulse
 */

import { getOpenAIClient } from '@/lib/openai';
import { prisma } from '@/lib/prisma';

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
  const fallbackSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Get all active (non-blacklisted) chats — both group and private
  const chats = await prisma.feishuChat.findMany({
    where: { isBlacklisted: false, chatId: { not: '' } },
    select: { chatId: true, name: true, chatType: true, lastAnalyzedAt: true },
  });

  let chatsAnalyzed = 0;
  let signalsCreated = 0;

  // 2. Pre-filter: only analyze chats with enough new messages
  const chatsWithMessages: Array<{
    chat: typeof chats[0];
    messages: Array<{ messageId: string; senderName: string; content: string; timestamp: Date }>;
  }> = [];

  for (const chat of chats) {
    const since = chat.lastAnalyzedAt || fallbackSince;
    const messages = await prisma.feishuMessage.findMany({
      where: {
        chatId: chat.chatId,
        timestamp: { gt: since },
        msgType: { in: ['text', 'post'] },
        content: { not: '' },
      },
      orderBy: { timestamp: 'asc' },
      select: { messageId: true, senderName: true, content: true, timestamp: true },
    });

    if (messages.length >= 3) {
      chatsWithMessages.push({ chat, messages });
    }
  }

  if (chatsWithMessages.length === 0) {
    return { chatsAnalyzed: 0, signalsCreated: 0 };
  }

  console.log(`[TeamPulse] Analyzing ${chatsWithMessages.length} chats in parallel...`);

  // 3. Run LLM analysis in parallel (batch of 5 to avoid rate limits)
  const BATCH_SIZE = 5;
  for (let i = 0; i < chatsWithMessages.length; i += BATCH_SIZE) {
    const batch = chatsWithMessages.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ chat, messages }) => {
        const analysis = await analyzeChat(chat.name || chat.chatId, messages, chat.chatType);
        return { chat, messages, analysis };
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        console.error(`[TeamPulse] Batch analysis failed:`, result.reason);
        continue;
      }
      const { chat, messages, analysis } = result.value;

      try {
        // 4. Store ChatDigest
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

        // 5. Store ChatSignals with deduplication
        for (const signal of analysis.signals) {
          const existing = await prisma.chatSignal.findFirst({
            where: {
              chatId: chat.chatId,
              title: signal.title,
              isResolved: false,
            },
          });
          if (existing) {
            await prisma.chatSignal.update({
              where: { id: existing.id },
              data: {
                summary: signal.summary,
                severity: signal.severity,
                detectedAt: new Date(),
              },
            });
          } else {
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
        }

        // 6. Compute TeamPulse metrics
        await computeTeamPulse(chat.chatId, today, messages, analysis.sentimentScore);

        // 7. Update lastAnalyzedAt
        await prisma.feishuChat.update({
          where: { chatId: chat.chatId },
          data: { lastAnalyzedAt: new Date() },
        });

        chatsAnalyzed++;
      } catch (err: any) {
        console.error(`[TeamPulse] Failed to store results for ${chat.name}: ${err.message}`);
      }
    }
  }

  console.log(`[TeamPulse] Done: ${chatsAnalyzed}/${chatsWithMessages.length} chats, ${signalsCreated} signals`);
  return { chatsAnalyzed, signalsCreated };
}

/** Send messages to LLM for deep analysis */
async function analyzeChat(
  chatName: string,
  messages: Array<{ senderName: string; content: string; timestamp: Date }>,
  chatType: string = 'group',
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

  const isPrivate = chatType === 'private';
  const chatLabel = isPrivate ? '私聊' : '群聊';
  const contextNote = isPrivate
    ? `这是与"${chatName}"的一对一私聊。重点关注：对方提出的需求、承诺的事项、反馈的问题、情绪变化。`
    : `这是名为"${chatName}"的工作群聊。`;

  const systemPrompt = `你是一个运营分析助手。分析工作${chatLabel}对话，提取运营信号。

${contextNote}

请以JSON格式返回分析结果：
{
  "summary": "3-5句话总结主要讨论内容",
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
- DECISION: 做出的决策或确认的方案
- ACTION: 需要跟进的待办事项${isPrivate ? '、对方提出的请求或承诺' : ''}
- SENTIMENT: 从对话语气感受到的情绪（正面/负面/压力）

sentimentScore: -1.0（非常负面）到 1.0（非常正面），0为中性

注意：
- 只提取有实际内容的信号，不要凭空编造
- 如果没有某类信号，signals数组中就不包含该类型
- 关注实际的运营价值，忽略闲聊`;

  const userPrompt = `${chatLabel}${isPrivate ? '对象' : '名称'}: ${chatName}\n对话记录:\n\n${transcript}`;

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [digests, signals, pulses] = await Promise.all([
    prisma.chatDigest.findMany({
      where: { date: today },
      include: { chat: { select: { name: true } } },
      orderBy: { messageCount: 'desc' },
    }),
    prisma.chatSignal.findMany({
      where: { detectedAt: { gte: today }, isResolved: false },
      include: { chat: { select: { name: true } } },
    }),
    prisma.teamPulse.findMany({
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
}
