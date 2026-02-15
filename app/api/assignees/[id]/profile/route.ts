import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/assignees/[id]/profile
 * Returns a 7-day activity profile for an assignee, including:
 * - Feishu message count and active chat count
 * - Task completion rate and status breakdown
 * - Unresolved signal count
 * - Sentiment trend from TeamPulse
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const assignee = await prisma.assignee.findUnique({
      where: { id },
      select: { id: true, name: true, feishuUserId: true },
    });

    if (!assignee) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 }
      );
    }

    // Feishu message activity (match by senderName OR feishuUserId)
    const messageFilter: any = { timestamp: { gte: since } };
    if (assignee.feishuUserId) {
      messageFilter.OR = [
        { senderName: assignee.name },
        { senderId: assignee.feishuUserId },
      ];
    } else {
      messageFilter.senderName = assignee.name;
    }

    const [messageCount, activeChatIds, taskStats, signals] = await Promise.all([
      prisma.feishuMessage.count({ where: messageFilter }),
      prisma.feishuMessage.groupBy({
        by: ['chatId'],
        where: messageFilter,
        _count: { id: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: id },
        _count: { id: true },
      }),
      prisma.chatSignal.count({
        where: {
          isResolved: false,
          detectedAt: { gte: since },
          relatedUser: assignee.name,
        },
      }),
    ]);

    const taskCountByStatus = Object.fromEntries(
      taskStats.map((s) => [s.status, s._count.id])
    );
    const totalTasks = Object.values(taskCountByStatus).reduce(
      (a: number, b: any) => a + b,
      0
    );
    const doneTasks = (taskCountByStatus as any).DONE || 0;
    const completionRate =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const activeChatIdList = activeChatIds.map((c) => c.chatId);
    const sentimentTrend =
      activeChatIdList.length > 0
        ? await prisma.teamPulse.findMany({
            where: { chatId: { in: activeChatIdList }, date: { gte: since } },
            select: { date: true, sentimentScore: true },
            orderBy: { date: 'asc' },
          })
        : [];

    return NextResponse.json({
      success: true,
      data: {
        messageCount,
        activeChatCount: activeChatIds.length,
        completionRate,
        taskCountByStatus,
        unresolvedSignals: signals,
        sentimentTrend: sentimentTrend.map((s) => ({
          date: s.date,
          sentiment: s.sentimentScore,
        })),
      },
    });
  } catch (error) {
    console.error('Get assignee profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assignee profile' },
      { status: 500 }
    );
  }
}
