import { prisma } from '@/lib/prisma';

export interface DailyData {
  period: { from: Date; to: Date };
  tasks: {
    overdue: Array<{ title: string; assignee: string; dueDate: string }>;
    completed: number;
    created: number;
    inProgress: number;
  };
  feishu: {
    totalMessages: number;
    topChats: Array<{ name: string; count: number }>;
    topSenders: Array<{ name: string; count: number }>;
  };
  pulse: {
    newReports: number;
    completedAnalyses: number;
  };
  roundtable: {
    completedDiscussions: number;
    newActions: number;
    newRisks: number;
  };
  sentiment: {
    totalReviews: number;
    positive: number;
    neutral: number;
    negative: number;
    topIssues: Array<{ tag: string; count: number }>;
    games: Array<{ name: string; reviewCount: number; avgRating: number | null }>;
  };
  priorities: {
    overdueTasks: Array<{ id: string; title: string; assignee: string; dueDate: string }>;
    unresolvedSignals: Array<{ id: string; type: string; severity: string; title: string; chatName: string }>;
    pendingDecisions: Array<{ id: string; title: string; madeBy: string; madeAt: string }>;
  };
}

export async function collectDailyData(since?: Date): Promise<DailyData> {
  const now = new Date();
  const from = since || new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    overdueTasks,
    completedTasks,
    createdTasks,
    inProgressTasks,
    feishuMessages,
    topChatsRaw,
    topSendersRaw,
    newReports,
    completedAnalyses,
    completedDiscussions,
    newActions,
    newRisks,
    sentimentReviews,
    priorityOverdue,
    prioritySignals,
    priorityDecisions,
  ] = await Promise.all([
    // Overdue tasks
    prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueDate: { lt: now },
      },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),

    // Completed since yesterday
    prisma.task.count({
      where: { status: 'DONE', updatedAt: { gte: from } },
    }),

    // Created since yesterday
    prisma.task.count({
      where: { createdAt: { gte: from } },
    }),

    // In progress total
    prisma.task.count({
      where: { status: 'IN_PROGRESS' },
    }),

    // Feishu message count
    prisma.feishuMessage.count({
      where: { timestamp: { gte: from } },
    }),

    // Top chats by message count
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: { timestamp: { gte: from } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),

    // Top senders by message count
    prisma.feishuMessage.groupBy({
      by: ['senderName'],
      where: { timestamp: { gte: from } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),

    // Pulse: new reports
    prisma.pulseReport.count({
      where: { uploadedAt: { gte: from } },
    }),

    // Pulse: completed analyses
    prisma.pulseAnalysisSession.count({
      where: { createdAt: { gte: from }, status: 'COMPLETED' },
    }),

    // Roundtable: completed discussions
    prisma.roundtableDiscussion.count({
      where: { updatedAt: { gte: from }, status: 'COMPLETED' },
    }),

    // Roundtable: new action items
    prisma.roundtableAction.count({
      where: { createdAt: { gte: from } },
    }),

    // Roundtable: new risks
    prisma.roundtableRisk.count({
      where: { createdAt: { gte: from } },
    }),

    // Sentiment: reviews collected since yesterday
    prisma.sentimentReview.findMany({
      where: { collectedAt: { gte: from } },
      select: {
        gameId: true,
        rating: true,
        sentimentLabel: true,
        keyIssues: true,
        game: { select: { name: true } },
      },
    }),

    // Priority: overdue tasks (top 5 for priority view)
    prisma.task.findMany({
      where: { status: { not: 'DONE' }, dueDate: { lt: now } },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),

    // Priority: unresolved HIGH/CRITICAL signals
    prisma.chatSignal.findMany({
      where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } },
      include: { chat: { select: { name: true } } },
      take: 5,
      orderBy: { detectedAt: 'desc' },
    }),

    // Priority: pending decisions
    prisma.decision.findMany({
      where: { status: 'PENDING' },
      take: 5,
      orderBy: { madeAt: 'desc' },
    }),
  ]);

  // Resolve chat names for top chats
  const chatIds = topChatsRaw.map(c => c.chatId);
  const chatNames = chatIds.length > 0
    ? await prisma.feishuChat.findMany({
        where: { chatId: { in: chatIds } },
        select: { chatId: true, name: true },
      })
    : [];
  const chatNameMap = new Map(chatNames.map(c => [c.chatId, c.name || c.chatId]));

  return {
    period: { from, to: now },
    tasks: {
      overdue: overdueTasks.map(t => ({
        title: t.title,
        assignee: t.assignee?.name || '未分配',
        dueDate: t.dueDate?.toISOString().split('T')[0] || '',
      })),
      completed: completedTasks,
      created: createdTasks,
      inProgress: inProgressTasks,
    },
    feishu: {
      totalMessages: feishuMessages,
      topChats: topChatsRaw.map(c => ({
        name: chatNameMap.get(c.chatId) || c.chatId,
        count: c._count.id,
      })),
      topSenders: topSendersRaw.map(s => ({
        name: s.senderName || '未知',
        count: s._count.id,
      })),
    },
    pulse: {
      newReports,
      completedAnalyses,
    },
    roundtable: {
      completedDiscussions,
      newActions,
      newRisks,
    },
    priorities: {
      overdueTasks: priorityOverdue.map(t => ({
        id: t.id,
        title: t.title,
        assignee: t.assignee?.name || '未分配',
        dueDate: t.dueDate?.toISOString() || '',
      })),
      unresolvedSignals: prioritySignals.map(s => ({
        id: s.id,
        type: s.signalType,
        severity: s.severity,
        title: s.title,
        chatName: s.chat.name || s.chatId,
      })),
      pendingDecisions: priorityDecisions.map(d => ({
        id: d.id,
        title: d.title,
        madeBy: d.madeBy || '未指定',
        madeAt: d.madeAt.toISOString(),
      })),
    },
    sentiment: (() => {
      const total = sentimentReviews.length;
      const positive = sentimentReviews.filter(r => r.sentimentLabel === 'POSITIVE').length;
      const neutral = sentimentReviews.filter(r => r.sentimentLabel === 'NEUTRAL').length;
      const negative = sentimentReviews.filter(r => r.sentimentLabel === 'NEGATIVE').length;

      // Aggregate top issues
      const issueMap = new Map<string, number>();
      for (const r of sentimentReviews) {
        for (const tag of (r.keyIssues as string[] || [])) {
          issueMap.set(tag, (issueMap.get(tag) || 0) + 1);
        }
      }
      const topIssues = Array.from(issueMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));

      // Aggregate per game
      const gameMap = new Map<string, { name: string; ratings: number[] }>();
      for (const r of sentimentReviews) {
        const gid = r.gameId;
        if (!gameMap.has(gid)) {
          gameMap.set(gid, { name: r.game?.name || gid, ratings: [] });
        }
        if (r.rating != null) gameMap.get(gid)!.ratings.push(r.rating);
      }
      const games = Array.from(gameMap.values()).map(g => ({
        name: g.name,
        reviewCount: g.ratings.length,
        avgRating: g.ratings.length > 0
          ? Math.round((g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length) * 10) / 10
          : null,
      }));

      return { totalReviews: total, positive, neutral, negative, topIssues, games };
    })(),
  };
}
