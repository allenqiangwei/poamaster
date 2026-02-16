import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const competitors = await prisma.competitor.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          reviews: true,
          webChanges: true,
          news: true,
          alerts: { where: { acknowledged: false } },
        },
      },
    },
  });

  return NextResponse.json({ success: true, competitors });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await request.json();
  const { name, company, appStoreId, googlePlayId, websiteUrl, monitorUrls, rssFeeds, keywords } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: '竞品名称必填' }, { status: 400 });
  }

  const competitor = await prisma.competitor.create({
    data: {
      name: name.trim(),
      company: company?.trim() || null,
      appStoreId: appStoreId?.trim() || null,
      googlePlayId: googlePlayId?.trim() || null,
      websiteUrl: websiteUrl?.trim() || null,
      monitorUrls: monitorUrls || [],
      rssFeeds: rssFeeds || [],
      keywords: keywords || [],
    },
  });

  return NextResponse.json({ success: true, competitor });
}
