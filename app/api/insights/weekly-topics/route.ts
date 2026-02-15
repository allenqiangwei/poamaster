import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';

const DIMENSION_LABELS: Record<string, string> = {
  focus: '当前关注',
  goal: '目标',
  obstacle: '障碍',
  decision: '决策',
  risk: '风险',
  action: '行动',
};

/**
 * POST /api/insights/weekly-topics
 * 基于洞察和任务生成周会议题
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话无效' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { assigneeId, model } = body;

    if (!assigneeId) {
      return NextResponse.json(
        { success: false, error: '缺少负责人ID' },
        { status: 400 }
      );
    }

    // 获取负责人信息、洞察和任务
    const assignee = await prisma.assignee.findUnique({
      where: { id: assigneeId },
      include: {
        confirmedItems: {
          orderBy: { createdAt: 'desc' },
        },
        tasks: {
          where: {
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!assignee) {
      return NextResponse.json(
        { success: false, error: '负责人不存在' },
        { status: 404 }
      );
    }

    // 查询近一周飞书活动和信号数据
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const messageFilter: any = { timestamp: { gte: since } };
    if (assignee.feishuUserId) {
      messageFilter.OR = [
        { senderName: assignee.name },
        { senderId: assignee.feishuUserId },
      ];
    } else {
      messageFilter.senderName = assignee.name;
    }

    const [messageCount, activeChatIds, signals] = await Promise.all([
      prisma.feishuMessage.count({ where: messageFilter }),
      prisma.feishuMessage.groupBy({
        by: ['chatId'],
        where: messageFilter,
      }),
      prisma.chatSignal.findMany({
        where: {
          isResolved: false,
          detectedAt: { gte: since },
          relatedUser: assignee.name,
        },
        take: 5,
        orderBy: { detectedAt: 'desc' },
        include: { chat: { select: { name: true } } },
      }),
    ]);

    // 从活跃群聊获取情绪数据
    const chatIds = activeChatIds.map(c => c.chatId);
    const sentimentData = chatIds.length > 0
      ? await prisma.teamPulse.findMany({
          where: { chatId: { in: chatIds }, date: { gte: since } },
          select: { sentimentScore: true },
        })
      : [];

    const avgSentiment = sentimentData.length > 0
      ? sentimentData.reduce((sum, s) => sum + (s.sentimentScore || 0), 0) / sentimentData.length
      : null;

    // 构建状态概要
    let statusSummary = `\n【近一周状态概要】
- 飞书消息: ${messageCount} 条，活跃于 ${chatIds.length} 个群
- 情绪趋势: ${avgSentiment !== null ? (avgSentiment > 0.2 ? '积极' : avgSentiment < -0.2 ? '需关注' : '稳定') : '暂无数据'}
- 活跃信号: ${signals.length} 个待处理`;

    if (signals.length > 0) {
      statusSummary += '\n  信号详情:';
      signals.forEach((s, i) => {
        statusSummary += `\n  ${i + 1}. [${s.signalType}/${s.severity}] ${s.title} (${s.chat.name || s.chatId})`;
      });
    }

    // 构建洞察摘要
    const insightsByDimension: Record<string, string[]> = {};
    for (const item of assignee.confirmedItems) {
      const dimension = item.dimension;
      if (!insightsByDimension[dimension]) {
        insightsByDimension[dimension] = [];
      }
      insightsByDimension[dimension].push(item.content);
    }

    let insightsSummary = '';
    for (const [dimension, items] of Object.entries(insightsByDimension)) {
      const label = DIMENSION_LABELS[dimension] || dimension;
      insightsSummary += `\n【${label}】\n`;
      items.forEach((item, index) => {
        insightsSummary += `${index + 1}. ${item}\n`;
      });
    }

    // 构建任务摘要
    let tasksSummary = '';
    if (assignee.tasks.length > 0) {
      tasksSummary = '\n【当前任务】\n';
      assignee.tasks.forEach((task, index) => {
        const status = task.status === 'TODO' ? '待办' : '进行中';
        tasksSummary += `${index + 1}. [${status}] ${task.title}`;
        if (task.dod) {
          tasksSummary += ` (完成标准: ${task.dod})`;
        }
        if (task.dueDate) {
          tasksSummary += ` (截止: ${new Date(task.dueDate).toLocaleDateString('zh-CN')})`;
        }
        tasksSummary += '\n';
      });
    }

    // 构建 prompt
    const prompt = `你是一位经验丰富的管理顾问，帮助COO准备周会。

以下是关于 ${assignee.name} 的洞察信息、当前任务和近期活动状态：
${statusSummary}
${insightsSummary}
${tasksSummary}

请基于以上信息，按以下格式生成周会内容：

【状态概要】
- 基于飞书消息活跃度、情绪趋势和信号数据，概述该成员近一周的整体状态

【会议议题】
1. （3-5个重点讨论事项，每个议题简短描述，说明为什么需要讨论）

【关注事项】
- 列出风险、阻碍、决策点、未处理信号等需要特别关注或跟进的事项

【建议行动】
- 基于当前情况建议的下一步行动

请用简洁的中文回答，格式清晰，便于在会议中使用。`;

    // 使用 OpenAI 客户端（自动处理 API Key 和代理配置）
    const openai = await getOpenAIClient();
    const modelToUse = model || await getOpenAIModel();

    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      data: {
        content,
        assigneeName: assignee.name,
        insightsCount: assignee.confirmedItems.length,
        tasksCount: assignee.tasks.length,
        messageCount,
        activeChatCount: chatIds.length,
        signalCount: signals.length,
        avgSentiment,
      },
    });
  } catch (error) {
    console.error('Generate weekly topics error:', error);

    // Provide user-friendly error messages for common issues
    let message = '生成失败，请稍后重试';

    if (error instanceof Error) {
      if (error.message.includes('Connection error') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('fetch failed')) {
        message = '网络连接失败。请检查网络连接、代理设置，或稍后重试';
      } else if (error.message.includes('timeout') ||
                 error.message.includes('timed out')) {
        message = '请求超时。请稍后重试或检查网络连接';
      }
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
