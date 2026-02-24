import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient } from '@/lib/openai';

/**
 * POST /api/insights/topics/suggest
 * On-demand: generate topic suggestions from real content (Feishu, tasks, Pulse, roundtable).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  try {
    const suggestions = await generateTopicSuggestions();
    return NextResponse.json({ success: true, suggestions });
  } catch (error: any) {
    console.error('[Suggest] Topic suggestion failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}

async function generateTopicSuggestions() {
  console.log('[Suggest] Generating topic suggestions from real content...');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    feishuMessages,
    recentTasks,
    recentDiscussions,
    pulseEntries,
    pulseReports,
    existingTopics,
    recentlyDismissed,
  ] = await Promise.all([
    prisma.feishuMessage.findMany({
      where: {
        timestamp: { gte: since },
        content: { not: '' },
        chat: { isBlacklisted: false },
      },
      select: {
        content: true,
        senderName: true,
        chat: { select: { name: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    }),

    prisma.task.findMany({
      where: {
        OR: [
          { createdAt: { gte: since } },
          { updatedAt: { gte: since } },
        ],
      },
      select: {
        title: true,
        dod: true,
        status: true,
        assignee: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),

    prisma.roundtableDiscussion.findMany({
      where: { updatedAt: { gte: since } },
      select: {
        title: true,
        conclusion: true,
        conclusionType: true,
        actions: { select: { content: true, priority: true } },
        risks: { select: { description: true, impact: true, priority: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),

    prisma.pulseEntry.findMany({
      where: { updatedAt: { gte: since }, deletedAt: null },
      select: {
        dimension: true,
        title: true,
        evidenceCurrent: true,
        project: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),

    prisma.pulseReport.findMany({
      where: { uploadedAt: { gte: since } },
      select: {
        fileName: true,
        reportType: true,
        parsedText: true,
        project: { select: { name: true } },
        sessions: {
          where: { status: 'COMPLETED' },
          select: { aiOutputRaw: true },
          take: 1,
        },
      },
      orderBy: { uploadedAt: 'desc' },
      take: 10,
    }),

    prisma.insightTopic.findMany({
      where: { isPaused: false },
      select: { name: true },
    }),

    prisma.suggestedTopic.findMany({
      where: {
        status: 'dismissed',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { name: true },
    }),
  ]);

  const existingNames = existingTopics.map(t => t.name);
  const dismissedNames = recentlyDismissed.map(t => t.name);

  // Clear old daily-sourced pending suggestions
  await prisma.suggestedTopic.deleteMany({
    where: { source: 'daily', status: 'pending' },
  });

  // Build context
  const context = buildRichContext(feishuMessages, recentTasks, recentDiscussions, pulseEntries, pulseReports);
  if (!context.trim()) {
    console.log('[Suggest] No meaningful content found');
    return [];
  }

  console.log(`[Suggest] Context: ${feishuMessages.length} messages, ${recentTasks.length} tasks, ${recentDiscussions.length} discussions, ${pulseEntries.length} pulse entries`);

  const client = await getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      {
        role: 'system',
        content: `你是一位 COO 的战略情报顾问。根据团队过去 24 小时的实际沟通内容、任务变动、项目分析数据和会议结论，为 COO 推荐 2-4 个值得持续跟踪的新话题。

这些话题将被用于后续的互联网信息搜索和监控，所以：
1. 话题名称应该是具体的行业/业务关键词（2-8 个字），适合用于搜索引擎检索
2. 从团队讨论和项目数据中提取真正重要的业务方向、市场趋势、竞争情报、技术动向
3. 不要推荐纯内部管理类话题（如"团队效率"、"沟通优化"），要推荐可以从外部获取有价值信息的话题
4. 推荐理由要引用具体的对话内容或项目数据，说明为什么这个话题值得关注
5. 不要推荐已有的话题或最近被忽略的话题

已有话题：${existingNames.join('、') || '(无)'}
最近忽略的话题：${dismissedNames.join('、') || '(无)'}

返回 JSON 格式：
{
  "suggestions": [
    { "name": "话题名称", "reason": "推荐理由（引用具体内容）" }
  ]
}`
      },
      { role: 'user', content: context },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_completion_tokens: 600,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.log('[Suggest] LLM returned empty response');
    return [];
  }

  const parsed = JSON.parse(content);
  const rawSuggestions: Array<{ name: string; reason: string }> = parsed.suggestions || [];

  const created = [];
  for (const s of rawSuggestions) {
    if (!s.name || !s.reason) continue;
    if (existingNames.some(n => n === s.name)) continue;

    const record = await prisma.suggestedTopic.create({
      data: { name: s.name, reason: s.reason, source: 'daily' },
    });
    created.push(record);
  }

  console.log(`[Suggest] Created ${created.length} topic suggestions`);
  return created;
}

function buildRichContext(
  messages: Array<{ content: string; senderName: string; chat: { name: string | null } }>,
  tasks: Array<{ title: string; dod: string | null; status: string; assignee: { name: string } | null }>,
  discussions: Array<{
    title: string;
    conclusion: string | null;
    conclusionType: string | null;
    actions: Array<{ content: string; priority: string }>;
    risks: Array<{ description: string; impact: string; priority: string }>;
  }>,
  pulseEntries: Array<{
    dimension: string;
    title: string;
    evidenceCurrent: string;
    project: { name: string };
  }>,
  pulseReports: Array<{
    fileName: string;
    reportType: string;
    parsedText: string | null;
    project: { name: string };
    sessions: Array<{ aiOutputRaw: any }>;
  }>,
): string {
  const parts: string[] = [];

  // Feishu messages
  if (messages.length > 0) {
    parts.push('=== 过去 24 小时飞书对话内容 ===');
    const byChat = new Map<string, string[]>();
    for (const m of messages) {
      const chatName = m.chat.name || '未知对话';
      if (m.content.length < 5) continue;
      if (!byChat.has(chatName)) byChat.set(chatName, []);
      byChat.get(chatName)!.push(`${m.senderName}: ${m.content.slice(0, 500)}`);
    }
    for (const [chatName, msgs] of byChat) {
      parts.push(`\n【${chatName}】`);
      parts.push(msgs.join('\n'));
    }
  }

  // Pulse project data
  if (pulseEntries.length > 0 || pulseReports.length > 0) {
    parts.push('\n\n=== 项目分析数据（最近 24 小时更新） ===');

    if (pulseEntries.length > 0) {
      const byProject = new Map<string, typeof pulseEntries>();
      for (const e of pulseEntries) {
        const pName = e.project.name;
        if (!byProject.has(pName)) byProject.set(pName, []);
        byProject.get(pName)!.push(e);
      }
      for (const [projectName, entries] of byProject) {
        parts.push(`\n【项目: ${projectName}】`);
        for (const e of entries) {
          parts.push(`- [${e.dimension}] ${e.title}`);
          if (e.evidenceCurrent) {
            parts.push(`  证据: ${e.evidenceCurrent.slice(0, 500)}`);
          }
        }
      }
    }

    if (pulseReports.length > 0) {
      parts.push('\n最近上传的报告:');
      for (const r of pulseReports) {
        parts.push(`- 【${r.project.name}】${r.fileName} (${r.reportType})`);
        if (r.sessions.length > 0 && r.sessions[0].aiOutputRaw) {
          const aiOutput = r.sessions[0].aiOutputRaw;
          const summary = typeof aiOutput === 'string' ? aiOutput.slice(0, 800) : JSON.stringify(aiOutput).slice(0, 800);
          parts.push(`  AI 分析: ${summary}`);
        } else if (r.parsedText) {
          parts.push(`  报告内容: ${r.parsedText.slice(0, 500)}`);
        }
      }
    }
  }

  // Tasks
  if (tasks.length > 0) {
    parts.push('\n\n=== 最近更新的任务 ===');
    for (const t of tasks.slice(0, 20)) {
      const status = t.status === 'DONE' ? '已完成' : t.status === 'IN_PROGRESS' ? '进行中' : '待办';
      let line = `- [${status}] ${t.title}`;
      if (t.assignee) line += ` (${t.assignee.name})`;
      if (t.dod) line += `\n  详情: ${t.dod.slice(0, 150)}`;
      parts.push(line);
    }
  }

  // Roundtable discussions
  if (discussions.length > 0) {
    parts.push('\n\n=== 最近圆桌讨论 ===');
    for (const d of discussions) {
      parts.push(`\n【${d.title}】结论: ${d.conclusionType || '无'}`);
      if (d.conclusion) parts.push(`摘要: ${d.conclusion.slice(0, 300)}`);
      if (d.actions.length > 0) {
        parts.push('行动项:');
        for (const a of d.actions) {
          parts.push(`  - [${a.priority}] ${a.content.slice(0, 150)}`);
        }
      }
      if (d.risks.length > 0) {
        parts.push('风险:');
        for (const r of d.risks) {
          parts.push(`  - [${r.priority}] ${r.description.slice(0, 100)} → 影响: ${r.impact.slice(0, 100)}`);
        }
      }
    }
  }

  parts.push('\n\n请根据以上实际内容，推荐值得长期跟踪的新话题。');
  return parts.join('\n');
}
