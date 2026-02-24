import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { generateInsightPDF } from '@/lib/insights/pdf-report';
import { uploadFeishuFile, sendFeishuFileMessage } from '@/lib/feishu';

/**
 * POST /api/insights/cards/[id]/share
 * Generate a PDF for an insight card and send it to Feishu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;

    const card = await prisma.insightCard.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json(
        { error: '洞察卡片不存在' },
        { status: 404 }
      );
    }

    const chatId = await getConfig('feishu.chatId');
    if (!chatId) {
      return NextResponse.json(
        { error: '飞书群聊 ID 未配置，请在系统设置中配置' },
        { status: 400 }
      );
    }

    const sources = (card.sources as Array<{ title: string; url: string }>) || [];

    const pdfBuffer = await generateInsightPDF({
      title: card.title,
      category: card.category,
      priority: card.priority,
      summary: card.summary,
      details: card.details,
      impact: card.impact,
      action: card.action,
      sources,
      createdAt: card.createdAt.toISOString(),
    });

    const safeTitle = card.title
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `洞察报告_${safeTitle}.pdf`;

    const fileKey = await uploadFeishuFile(pdfBuffer, fileName, 'pdf');

    await sendFeishuFileMessage(chatId, fileKey);

    await prisma.insightCard.update({
      where: { id },
      data: { isCooFocus: true, sharedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const msg = error?.message || 'Unknown error';
    console.error('[Cards] Failed to share insight card:', error);

    if (msg.includes('飞书')) {
      return NextResponse.json(
        { error: `飞书发送失败: ${msg}` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: '分享洞察卡片失败，请稍后重试' },
      { status: 500 }
    );
  }
}
