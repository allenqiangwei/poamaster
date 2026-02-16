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
    overdueDecisions: Array<{ id: string; title: string; madeBy: string; reviewDate: string }>;
  };
  decisionStats?: {
    total: number;
    completed: number;
    executing: number;
    pending: number;
    revised: number;
    executionRate: number;
    avgClosureDays: number | null;
  };
  projectHealth?: Array<{
    name: string;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    overdueRate: number;
    signalCount: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  okrAtRisk?: Array<{
    krTitle: string;
    objectiveTitle: string;
    ownerName: string;
    progress: number;
    objectiveId: string;
  }>;
  competitor?: CompetitorDailyData;
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
    overdueDecisions,
    decisionStatusCounts,
    completedDecisions,
    tasksByAssignee,
    allActiveKRs,
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

    // Priority: overdue decisions (reviewDate passed, not completed/revised)
    prisma.decision.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'REVISED'] },
        reviewDate: { lt: now },
      },
      take: 5,
      orderBy: { reviewDate: 'asc' },
    }),

    // Decision stats
    prisma.decision.groupBy({
      by: ['status'],
      _count: true,
    }),

    // Decision closure time
    prisma.decision.findMany({
      where: { status: 'COMPLETED' },
      select: { madeAt: true, updatedAt: true },
    }),

    // Tasks grouped by assignee for project health
    prisma.task.groupBy({
      by: ['assigneeId'],
      _count: true,
      where: { assigneeId: { not: null } },
    }),

    // OKR: at-risk key results (progress < expected based on time elapsed in period)
    prisma.keyResult.findMany({
      where: {
        objective: { status: 'ACTIVE' },
        targetValue: { gt: 0 },
      },
      include: {
        owner: { select: { name: true } },
        objective: { select: { id: true, title: true, periodLabel: true } },
      },
    }),
  ]);

  // Compute at-risk KRs (less than 50% progress)
  const atRiskKRs = allActiveKRs.filter(kr => {
    const progress = kr.currentValue / kr.targetValue;
    return progress < 0.5;
  }).slice(0, 5);

  // --- Decision stats ---
  const decisionByStatus: Record<string, number> = {};
  for (const g of decisionStatusCounts) {
    decisionByStatus[g.status] = g._count;
  }
  const dTotal = Object.values(decisionByStatus).reduce((a, b) => a + b, 0);
  const dCompleted = decisionByStatus['COMPLETED'] || 0;
  const dRevised = decisionByStatus['REVISED'] || 0;
  const dDenominator = dTotal - dRevised;
  const executionRate = dDenominator > 0 ? Math.round((dCompleted / dDenominator) * 100) : 0;

  let avgClosureDays: number | null = null;
  if (completedDecisions.length > 0) {
    const totalDays = completedDecisions.reduce((sum: number, d: any) => {
      return sum + (d.updatedAt.getTime() - d.madeAt.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    avgClosureDays = Math.round((totalDays / completedDecisions.length) * 10) / 10;
  }

  // --- Project health ---
  const assigneeIds = tasksByAssignee.map((t: any) => t.assigneeId).filter(Boolean) as string[];
  const assigneeNames = assigneeIds.length > 0
    ? await prisma.assignee.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];
  const assigneeNameMap = new Map(assigneeNames.map((a: any) => [a.id, a.name]));

  const allAssigneeTasks = assigneeIds.length > 0
    ? await prisma.task.findMany({
        where: { assigneeId: { in: assigneeIds } },
        select: { assigneeId: true, status: true, dueDate: true },
      })
    : [];

  const projectHealthData = assigneeIds.map(aid => {
    const tasks = allAssigneeTasks.filter(t => t.assigneeId === aid);
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'DONE').length;
    const overdue = tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const overdueRate = total > 0 ? Math.round((overdue / total) * 100) : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (overdueRate > 30) status = 'critical';
    else if (overdueRate > 10) status = 'warning';

    return {
      name: assigneeNameMap.get(aid) || '未知',
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
      completionRate,
      overdueRate,
      signalCount: 0,
      status,
    };
  });

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
      overdueDecisions: overdueDecisions.map(d => ({
        id: d.id,
        title: d.title,
        madeBy: d.madeBy || '未指定',
        reviewDate: d.reviewDate?.toISOString() || '',
      })),
    },
    okrAtRisk: atRiskKRs.map(kr => ({
      krTitle: kr.title,
      objectiveTitle: kr.objective.title,
      ownerName: kr.owner?.name || '未指定',
      progress: Math.round((kr.currentValue / kr.targetValue) * 100),
      objectiveId: kr.objective.id,
    })),
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
    decisionStats: {
      total: dTotal,
      completed: dCompleted,
      executing: decisionByStatus['EXECUTING'] || 0,
      pending: decisionByStatus['PENDING'] || 0,
      revised: dRevised,
      executionRate,
      avgClosureDays,
    },
    projectHealth: projectHealthData,
  };
}

export interface CompetitorDailyData {
  competitors: Array<{
    name: string;
    appSnapshots: Array<{ platform: string; rating: number | null; version: string | null; releaseNotes: string | null }>;
    reviewSummary: { total: number; avgRating: number | null; topIssues: string[] };
    webChanges: Array<{ url: string; changeType: string; summary: string | null }>;
    news: Array<{ title: string; source: string; summary: string | null }>;
  }>;
  alerts: Array<{ competitorName: string; alertType: string; severity: string; title: string; summary: string }>;
}

export async function collectCompetitorData(since?: Date): Promise<CompetitorDailyData> {
  const from = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
  });

  const result: CompetitorDailyData = { competitors: [], alerts: [] };

  for (const comp of competitors) {
    const [snapshots, reviews, webChanges, news] = await Promise.all([
      prisma.competitorAppSnapshot.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.competitorReview.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
        select: { rating: true, tags: true },
      }),
      prisma.competitorWebChange.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from }, changeType: { not: 'baseline' } },
      }),
      prisma.competitorNews.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
      }),
    ]);

    // Aggregate review issues
    const issueMap = new Map<string, number>();
    for (const r of reviews) {
      for (const tag of (r.tags as string[] || [])) {
        issueMap.set(tag, (issueMap.get(tag) || 0) + 1);
      }
    }
    const topIssues = Array.from(issueMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    const avgRating = reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    // Only include competitor if there's any data
    if (snapshots.length > 0 || reviews.length > 0 || webChanges.length > 0 || news.length > 0) {
      result.competitors.push({
        name: comp.name,
        appSnapshots: snapshots.map(s => ({
          platform: s.platform,
          rating: s.rating,
          version: s.version,
          releaseNotes: s.releaseNotes,
        })),
        reviewSummary: { total: reviews.length, avgRating, topIssues },
        webChanges: webChanges.map(w => ({
          url: w.url,
          changeType: w.changeType,
          summary: w.summary,
        })),
        news: news.map(n => ({
          title: n.title,
          source: n.source,
          summary: n.summary,
        })),
      });
    }
  }

  // Collect recent alerts
  const alerts = await prisma.competitorAlert.findMany({
    where: { createdAt: { gte: from } },
    include: { competitor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  result.alerts = alerts.map(a => ({
    competitorName: a.competitor.name,
    alertType: a.alertType,
    severity: a.severity,
    title: a.title,
    summary: a.summary,
  }));

  return result;
}
