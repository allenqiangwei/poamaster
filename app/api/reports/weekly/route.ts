import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { model } = body;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      completedTasks, newTasks, inProgressTasks,
      feishuMessages, signals, decisions,
      sentimentData,
    ] = await Promise.all([
      prisma.task.findMany({
        where: { status: 'DONE', updatedAt: { gte: weekAgo } },
        include: { assignee: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { createdAt: { gte: weekAgo } },
        include: { assignee: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { status: 'IN_PROGRESS' },
        include: { assignee: { select: { name: true } } },
      }),
      prisma.feishuMessage.count({ where: { timestamp: { gte: weekAgo } } }),
      prisma.chatSignal.findMany({
        where: { detectedAt: { gte: weekAgo } },
        include: { chat: { select: { name: true } } },
        orderBy: { detectedAt: 'desc' },
        take: 10,
      }),
      prisma.decision.findMany({
        where: { createdAt: { gte: weekAgo } },
        orderBy: { madeAt: 'desc' },
      }),
      prisma.teamPulse.findMany({
        where: { date: { gte: weekAgo } },
        select: { date: true, messageCount: true, sentimentScore: true },
      }),
    ]);

    let dataText = `# 本周数据汇总 (${weekAgo.toLocaleDateString('zh-CN')} - ${new Date().toLocaleDateString('zh-CN')})\n\n`;

    dataText += `## 任务\n`;
    dataText += `- 完成: ${completedTasks.length} 个\n`;
    completedTasks.forEach(t => { dataText += `  - ${t.title} (${t.assignee?.name || '未分配'})\n`; });
    dataText += `- 新建: ${newTasks.length} 个\n`;
    dataText += `- 进行中: ${inProgressTasks.length} 个\n`;
    inProgressTasks.forEach(t => { dataText += `  - ${t.title} (${t.assignee?.name || '未分配'})\n`; });

    dataText += `\n## 团队动态\n`;
    dataText += `- 飞书消息总量: ${feishuMessages} 条\n`;

    if (signals.length > 0) {
      dataText += `- 运营信号: ${signals.length} 个\n`;
      signals.forEach(s => { dataText += `  - [${s.signalType}/${s.severity}] ${s.title} (${s.chat.name || s.chatId})\n`; });
    }

    if (decisions.length > 0) {
      dataText += `\n## 决策\n`;
      decisions.forEach(d => { dataText += `- [${d.status}] ${d.title} (${d.madeBy || '未指定'})\n`; });
    }

    if (sentimentData.length > 0) {
      const withSentiment = sentimentData.filter(s => s.sentimentScore !== null);
      if (withSentiment.length > 0) {
        const avgSentiment = withSentiment.reduce((sum, s) => sum + (s.sentimentScore || 0), 0) / withSentiment.length;
        dataText += `\n## 情绪趋势\n`;
        dataText += `- 平均情绪分数: ${avgSentiment.toFixed(2)} (范围 -1.0 到 1.0)\n`;
        dataText += `- 数据点: ${withSentiment.length} 天\n`;
      }
    }

    const prompt = `你是一位COO的助理，帮助生成周工作汇报。

${dataText}

请基于以上数据，生成一份结构化的周报，格式如下：

一、本周完成
- 列出完成的任务和成果

二、进行中 / 待跟进
- 列出未完成的重点任务和需要跟进的事项

三、团队动态
- 消息活跃度、关键信号、情绪趋势

四、重要决策
- 本周做出的决策及执行状态

五、下周计划
- 基于当前任务和信号的下一步建议

用简洁的中文回答，突出重点，便于快速阅读。`;

    const openai = await getOpenAIClient();
    const modelToUse = model || await getOpenAIModel();

    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      data: {
        content,
        completedCount: completedTasks.length,
        newCount: newTasks.length,
        inProgressCount: inProgressTasks.length,
        feishuMessageCount: feishuMessages,
        signalCount: signals.length,
        decisionCount: decisions.length,
      },
    });
  } catch (error) {
    console.error('Weekly report generation failed:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ success: false, error: `周报生成失败: ${message}` }, { status: 500 });
  }
}
