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

  const changes = await prisma.competitorWebChange.findMany({
    where: { competitorId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, url: true, changeType: true,
      summary: true, diffText: true, createdAt: true,
      previousHash: true, currentHash: true,
    },
  });

  return NextResponse.json({ success: true, changes });
}
