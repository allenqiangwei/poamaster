import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  const competitor = await prisma.competitor.findUnique({
    where: { id },
    include: {
      appSnapshots: { orderBy: { createdAt: 'desc' }, take: 10 },
      webChanges: { orderBy: { createdAt: 'desc' }, take: 10 },
      news: { orderBy: { createdAt: 'desc' }, take: 10 },
      alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { reviews: true, webChanges: true, news: true } },
    },
  });

  if (!competitor) {
    return NextResponse.json({ error: '竞品不存在' }, { status: 404 });
  }

  return NextResponse.json({ success: true, competitor });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name, company, appStoreId, googlePlayId, websiteUrl, monitorUrls, rssFeeds, keywords, enabled } = body;

  const data: Record<string, any> = {};
  if (name !== undefined) data.name = name.trim();
  if (company !== undefined) data.company = company?.trim() || null;
  if (appStoreId !== undefined) data.appStoreId = appStoreId?.trim() || null;
  if (googlePlayId !== undefined) data.googlePlayId = googlePlayId?.trim() || null;
  if (websiteUrl !== undefined) data.websiteUrl = websiteUrl?.trim() || null;
  if (monitorUrls !== undefined) data.monitorUrls = monitorUrls;
  if (rssFeeds !== undefined) data.rssFeeds = rssFeeds;
  if (keywords !== undefined) data.keywords = keywords;
  if (enabled !== undefined) data.enabled = enabled;

  const competitor = await prisma.competitor.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true, competitor });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  await prisma.competitor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
