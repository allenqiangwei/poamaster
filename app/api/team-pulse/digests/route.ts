import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const dateStr = url.searchParams.get('date');
  const chatId = url.searchParams.get('chatId');

  // Default to today
  const date = dateStr ? new Date(dateStr) : new Date();
  date.setHours(0, 0, 0, 0);

  const where: any = { date };
  if (chatId) where.chatId = chatId;

  const digests = await prisma.chatDigest.findMany({
    where,
    include: { chat: { select: { name: true, chatType: true } } },
    orderBy: { messageCount: 'desc' },
  });

  return NextResponse.json({ digests });
}
