import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const competitorId = sp.get('competitorId');
  const type = sp.get('type'); // 'news' | 'webchange' | null (all)
  const days = parseInt(sp.get('days') || '30', 10);
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = 20;

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const items: Array<{
      id: string;
      type: 'news' | 'webchange';
      competitorId: string | null;
      competitorName: string;
      title: string;
      summary: string | null;
      url: string | null;
      source: string;
      isHighImpact: boolean;
      createdAt: Date;
    }> = [];

    if (type !== 'webchange') {
      const newsWhere: any = { createdAt: { gte: since } };
      if (competitorId) newsWhere.competitorId = competitorId;

      const news = await prisma.competitorNews.findMany({
        where: newsWhere,
        orderBy: { createdAt: 'desc' },
        include: { competitor: { select: { name: true } } },
      });

      const highImpactTerms = ['融资', '收购', '合并', 'IPO', '上市', '裁员', '关闭', '倒闭'];

      for (const n of news) {
        const text = `${n.title} ${n.summary || ''}`.toLowerCase();
        items.push({
          id: n.id,
          type: 'news',
          competitorId: n.competitorId,
          competitorName: n.competitor?.name || '未知',
          title: n.title,
          summary: n.summary,
          url: n.url,
          source: n.source,
          isHighImpact: highImpactTerms.some((t) => text.includes(t)),
          createdAt: n.createdAt,
        });
      }
    }

    if (type !== 'news') {
      const changeWhere: any = { createdAt: { gte: since } };
      if (competitorId) changeWhere.competitorId = competitorId;

      const changes = await prisma.competitorWebChange.findMany({
        where: changeWhere,
        orderBy: { createdAt: 'desc' },
        include: { competitor: { select: { name: true } } },
      });

      for (const c of changes) {
        items.push({
          id: c.id,
          type: 'webchange',
          competitorId: c.competitorId,
          competitorName: c.competitor.name,
          title: c.summary || `${c.url} ${c.changeType}`,
          summary: c.diffText,
          url: c.url,
          source: c.changeType,
          isHighImpact: c.changeType === 'major_update',
          createdAt: c.createdAt,
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const total = items.length;
    const paged = items.slice((page - 1) * pageSize, page * pageSize);

    // Stats: news count per competitor (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newsStats = await prisma.competitorNews.groupBy({
      by: ['competitorId'],
      where: { createdAt: { gte: weekAgo }, competitorId: { not: null } },
      _count: true,
    });

    const competitors = await prisma.competitor.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
    });
    const nameMap = new Map(competitors.map((c) => [c.id, c.name]));

    const newsCountByCompetitor = newsStats.map((s) => ({
      name: nameMap.get(s.competitorId!) || '未知',
      count: s._count,
    }));

    return NextResponse.json({
      success: true,
      items: paged,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      newsCountByCompetitor,
      competitors: competitors.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (error) {
    console.error('Failed to get news feed:', error);
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 });
  }
}
