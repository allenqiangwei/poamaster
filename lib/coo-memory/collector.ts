import { prisma } from '@/lib/prisma';

/**
 * Full-database snapshot for COO memory.
 * Collected nightly, stored as JSON in CooMemoryEpisode.snapshot.
 */
export interface CooSnapshot {
  date: string; // YYYY-MM-DD
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    createdToday: number;
    completedToday: number;
    overdueCount: number;
    overdueList: Array<{ title: string; assignee: string; dueDate: string }>;
    byAssignee: Array<{ name: string; total: number; done: number; overdue: number }>;
  };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
    executionRate: number;
    overdueList: Array<{ title: string; madeBy: string; reviewDate: string }>;
  };
  okr: {
    totalObjectives: number;
    activeObjectives: number;
    completedObjectives: number;
    avgKrProgress: number;
    atRiskKrs: Array<{ title: string; objective: string; owner: string; progress: number }>;
  };
  teamPulse: {
    todayMessages: number;
    activeUsers: number;
    avgSentiment: number | null;
    avgResponseTime: number | null;
    peakHour: number | null;
  };
  sentiment: {
    totalReviews: number;
    positive: number;
    neutral: number;
    negative: number;
    avgRating: number | null;
    activeAlerts: number;
    topIssues: string[];
  };
  competitors: {
    trackedCount: number;
    newNews: number;
    newReviews: number;
    webChanges: number;
    activeAlerts: number;
  };
  feishu: {
    todayMessages: number;
    activeChats: number;
    unresolvedSignals: number;
    topChats: Array<{ name: string; count: number }>;
    recentSignals: Array<{ type: string; severity: string; title: string; summary: string; chat: string }>;
    messageDigest: Array<{ chat: string; sender: string; content: string; time: string }>;
  };
  insights: {
    todayCards: number;
    topicCount: number;
    briefingSummary: string | null;
    cards: Array<{
      category: string;
      priority: string;
      title: string;
      summary: string;
      impact: string | null;
      action: string | null;
    }>;
  };
}

export async function collectSnapshot(): Promise<CooSnapshot> {
  const now = new Date();
  const todayStart = new Date(now.toISOString().split('T')[0]);
  const dateStr = now.toISOString().split('T')[0];

  // ---- Tasks ----
  const [
    taskTotal,
    taskStatusGroups,
    taskCreatedToday,
    taskCompletedToday,
    taskOverdueCount,
    taskOverdueList,
    taskAssigneeGroups,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.groupBy({ by: ['status'], _count: true }),
    prisma.task.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.task.count({ where: { status: 'DONE', updatedAt: { gte: todayStart } } }),
    prisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
    prisma.task.findMany({
      where: { status: { not: 'DONE' }, dueDate: { lt: now } },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      _count: true,
      where: { assigneeId: { not: null } },
    }),
  ]);

  const taskByStatus: Record<string, number> = {};
  for (const g of taskStatusGroups) taskByStatus[g.status] = g._count;

  // Resolve assignee task breakdown
  const assigneeIds = taskAssigneeGroups.map((g: any) => g.assigneeId).filter(Boolean) as string[];
  let byAssignee: CooSnapshot['tasks']['byAssignee'] = [];
  if (assigneeIds.length > 0) {
    const [assigneeNames, allAssigneeTasks] = await Promise.all([
      prisma.assignee.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } }),
      prisma.task.findMany({ where: { assigneeId: { in: assigneeIds } }, select: { assigneeId: true, status: true, dueDate: true } }),
    ]);
    const nameMap = new Map(assigneeNames.map(a => [a.id, a.name]));
    byAssignee = assigneeIds.map(aid => {
      const tasks = allAssigneeTasks.filter(t => t.assigneeId === aid);
      return {
        name: nameMap.get(aid) || '未知',
        total: tasks.length,
        done: tasks.filter(t => t.status === 'DONE').length,
        overdue: tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length,
      };
    });
  }

  // ---- Decisions ----
  const [decisionStatusGroups, decisionOverdueList] = await Promise.all([
    prisma.decision.groupBy({ by: ['status'], _count: true }),
    prisma.decision.findMany({
      where: { status: { notIn: ['COMPLETED', 'REVISED'] }, reviewDate: { lt: now } },
      take: 10,
      orderBy: { reviewDate: 'asc' },
    }),
  ]);
  const decisionByStatus: Record<string, number> = {};
  for (const g of decisionStatusGroups) decisionByStatus[g.status] = g._count;
  const dTotal = Object.values(decisionByStatus).reduce((a, b) => a + b, 0);
  const dCompleted = decisionByStatus['COMPLETED'] || 0;
  const dRevised = decisionByStatus['REVISED'] || 0;
  const dDenom = dTotal - dRevised;
  const executionRate = dDenom > 0 ? Math.round((dCompleted / dDenom) * 100) : 0;

  // ---- OKR ----
  const [objectives, activeKRs] = await Promise.all([
    prisma.objective.groupBy({ by: ['status'], _count: true }),
    prisma.keyResult.findMany({
      where: { objective: { status: 'ACTIVE' }, targetValue: { gt: 0 } },
      include: { owner: { select: { name: true } }, objective: { select: { title: true } } },
    }),
  ]);
  const objByStatus: Record<string, number> = {};
  for (const g of objectives) objByStatus[g.status] = g._count;
  const totalObj = Object.values(objByStatus).reduce((a, b) => a + b, 0);
  const activeObj = objByStatus['ACTIVE'] || 0;
  const completedObj = objByStatus['COMPLETED'] || 0;
  const krProgresses = activeKRs.map(kr => kr.currentValue / kr.targetValue);
  const avgKrProgress = krProgresses.length > 0
    ? Math.round((krProgresses.reduce((a, b) => a + b, 0) / krProgresses.length) * 100)
    : 0;
  const atRiskKrs = activeKRs
    .filter(kr => (kr.currentValue / kr.targetValue) < 0.5)
    .slice(0, 10)
    .map(kr => ({
      title: kr.title,
      objective: kr.objective.title,
      owner: kr.owner?.name || '未指定',
      progress: Math.round((kr.currentValue / kr.targetValue) * 100),
    }));

  // ---- Team Pulse ----
  const latestPulse = await prisma.teamPulse.findFirst({
    where: { date: { gte: todayStart } },
    orderBy: { date: 'desc' },
  });

  // ---- Sentiment ----
  const [sentimentToday, sentimentAlerts] = await Promise.all([
    prisma.sentimentReview.findMany({
      where: { collectedAt: { gte: todayStart } },
      select: { sentimentLabel: true, rating: true, keyIssues: true },
    }),
    prisma.sentimentAlert.count({ where: { isRead: false } }),
  ]);
  const sentPositive = sentimentToday.filter(r => r.sentimentLabel === 'POSITIVE').length;
  const sentNeutral = sentimentToday.filter(r => r.sentimentLabel === 'NEUTRAL').length;
  const sentNegative = sentimentToday.filter(r => r.sentimentLabel === 'NEGATIVE').length;
  const sentRatings = sentimentToday.filter(r => r.rating != null).map(r => r.rating!);
  const sentAvgRating = sentRatings.length > 0
    ? Math.round((sentRatings.reduce((a, b) => a + b, 0) / sentRatings.length) * 10) / 10
    : null;
  const issueMap = new Map<string, number>();
  for (const r of sentimentToday) {
    for (const tag of (r.keyIssues as string[] || [])) {
      issueMap.set(tag, (issueMap.get(tag) || 0) + 1);
    }
  }
  const sentTopIssues = Array.from(issueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // ---- Competitors ----
  const [compCount, compNews, compReviews, compWebChanges, compAlerts] = await Promise.all([
    prisma.competitor.count({ where: { enabled: true } }),
    prisma.competitorNews.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.competitorReview.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.competitorWebChange.count({ where: { createdAt: { gte: todayStart }, changeType: { not: 'baseline' } } }),
    prisma.competitorAlert.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  // ---- Feishu ----
  const [feishuMsgCount, feishuActiveChats, feishuSignals, feishuTopChats] = await Promise.all([
    prisma.feishuMessage.count({ where: { timestamp: { gte: todayStart } } }),
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: { timestamp: { gte: todayStart } },
      _count: { id: true },
    }).then(groups => groups.length),
    prisma.chatSignal.count({ where: { isResolved: false } }),
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: { timestamp: { gte: todayStart } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ]);
  // Resolve chat names
  const chatIds = feishuTopChats.map(c => c.chatId);
  const chatNames = chatIds.length > 0
    ? await prisma.feishuChat.findMany({ where: { chatId: { in: chatIds } }, select: { chatId: true, name: true } })
    : [];
  const chatNameMap = new Map(chatNames.map(c => [c.chatId, c.name || c.chatId]));

  // Fetch recent signals (today + unresolved)
  const recentSignals = await prisma.chatSignal.findMany({
    where: {
      OR: [
        { detectedAt: { gte: todayStart } },
        { isResolved: false },
      ],
    },
    orderBy: { detectedAt: 'desc' },
    take: 10,
    include: { chat: { select: { name: true } } },
  });

  // Fetch key message samples — skip bot/automated messages, pick human messages
  const allChatIds = chatIds.length > 0 ? chatIds : [];
  const messageDigest = allChatIds.length > 0
    ? await prisma.feishuMessage.findMany({
        where: {
          timestamp: { gte: todayStart },
          chatId: { in: allChatIds },
          content: { not: '' },
          // Skip messages that look like automated reports (very long or contain structured data markers)
          NOT: { senderName: { startsWith: '6' } }, // Bot IDs are numeric
        },
        orderBy: { timestamp: 'desc' },
        take: 15,
        select: { chatId: true, senderName: true, content: true, timestamp: true },
      })
    : [];

  // Also grab a few bot messages that contain critical/alert keywords
  const alertMessages = await prisma.feishuMessage.findMany({
    where: {
      timestamp: { gte: todayStart },
      OR: [
        { content: { contains: 'CRITICAL' } },
        { content: { contains: '风险' } },
        { content: { contains: '告警' } },
        { content: { contains: '异常' } },
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: { chatId: true, senderName: true, content: true, timestamp: true },
  });

  // Merge and deduplicate
  const allDigestMessages = [...messageDigest, ...alertMessages];
  const seenIds = new Set<string>();
  const uniqueDigest = allDigestMessages.filter(m => {
    const key = `${m.chatId}-${m.timestamp.toISOString()}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  }).slice(0, 15);

  // ---- Insights ----
  const todayDate = new Date(todayStart);
  const [insightCardCount, topicCount, insightCards, todayBriefing] = await Promise.all([
    prisma.insightCard.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.insightTopic.count({ where: { isPaused: false } }),
    prisma.insightCard.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { category: true, priority: true, title: true, summary: true, impact: true, action: true },
      orderBy: { priority: 'asc' }, // high first (alphabetically h < l < m)
    }),
    prisma.insightBriefing.findFirst({
      where: { date: todayDate, status: 'ready' },
      select: { summary: true },
    }),
  ]);

  return {
    date: dateStr,
    tasks: {
      total: taskTotal,
      byStatus: taskByStatus,
      createdToday: taskCreatedToday,
      completedToday: taskCompletedToday,
      overdueCount: taskOverdueCount,
      overdueList: taskOverdueList.map(t => ({
        title: t.title,
        assignee: t.assignee?.name || '未分配',
        dueDate: t.dueDate?.toISOString().split('T')[0] || '',
      })),
      byAssignee,
    },
    decisions: {
      total: dTotal,
      byStatus: decisionByStatus,
      executionRate,
      overdueList: decisionOverdueList.map(d => ({
        title: d.title,
        madeBy: d.madeBy || '未指定',
        reviewDate: d.reviewDate?.toISOString().split('T')[0] || '',
      })),
    },
    okr: {
      totalObjectives: totalObj,
      activeObjectives: activeObj,
      completedObjectives: completedObj,
      avgKrProgress,
      atRiskKrs,
    },
    teamPulse: {
      todayMessages: latestPulse?.messageCount || 0,
      activeUsers: latestPulse?.activeUserCount || 0,
      avgSentiment: latestPulse?.sentimentScore || null,
      avgResponseTime: latestPulse?.avgResponseTime || null,
      peakHour: latestPulse?.peakHour || null,
    },
    sentiment: {
      totalReviews: sentimentToday.length,
      positive: sentPositive,
      neutral: sentNeutral,
      negative: sentNegative,
      avgRating: sentAvgRating,
      activeAlerts: sentimentAlerts,
      topIssues: sentTopIssues,
    },
    competitors: {
      trackedCount: compCount,
      newNews: compNews,
      newReviews: compReviews,
      webChanges: compWebChanges,
      activeAlerts: compAlerts,
    },
    feishu: {
      todayMessages: feishuMsgCount,
      activeChats: feishuActiveChats,
      unresolvedSignals: feishuSignals,
      topChats: feishuTopChats.map(c => ({
        name: chatNameMap.get(c.chatId) || c.chatId,
        count: c._count.id,
      })),
      recentSignals: recentSignals.map(s => ({
        type: s.signalType,
        severity: s.severity,
        title: s.title,
        summary: s.summary,
        chat: s.chat?.name || s.chatId,
      })),
      messageDigest: uniqueDigest.map(m => ({
        chat: chatNameMap.get(m.chatId) || m.chatId,
        sender: m.senderName || '未知',
        content: m.content.replace(/\0/g, '').substring(0, 200),
        time: m.timestamp.toISOString().substring(11, 16),
      })),
    },
    insights: {
      todayCards: insightCardCount,
      topicCount,
      briefingSummary: todayBriefing?.summary || null,
      cards: insightCards.map(c => ({
        category: c.category,
        priority: c.priority,
        title: c.title,
        summary: c.summary,
        impact: c.impact,
        action: c.action,
      })),
    },
  };
}
