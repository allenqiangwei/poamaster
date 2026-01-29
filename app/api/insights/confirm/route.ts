// app/api/insights/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { DraftItemData } from '@/lib/insights/types';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify session
    const token = request.cookies.get('session')?.value;
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

    // 2. Parse request body
    const body = await request.json();
    const { artifactId, items } = body;

    if (!artifactId || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: '缺少必需参数: artifactId 和 items' },
        { status: 400 }
      );
    }

    // Validate artifactId format (CUID format: c + 24 alphanumeric chars)
    if (!/^c[a-z0-9]{24}$/.test(artifactId)) {
      return NextResponse.json(
        { success: false, error: '无效的 artifactId 格式' },
        { status: 400 }
      );
    }

    // 3. Fetch artifact with assignee
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { assignee: true },
    });

    if (!artifact) {
      return NextResponse.json(
        { success: false, error: '文件记录不存在' },
        { status: 404 }
      );
    }

    if (!artifact.assignee) {
      return NextResponse.json(
        { success: false, error: '关联的负责人不存在' },
        { status: 404 }
      );
    }

    // 4. Validate artifact status is 'ready' (extraction completed)
    if (artifact.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: `文件状态不正确: ${artifact.status}` },
        { status: 400 }
      );
    }

    // 5. Confirm items in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 5a. Create ConfirmedItems from the provided items
      const confirmedItems = await tx.confirmedItem.createMany({
        data: items.map((item: any, index: number) => ({
          assigneeId: artifact.assigneeId,
          artifactId: artifact.id,
          dimension: item.dimension,
          sortOrder: index,
          content: item.content,
          decisionType: item.decisionType || null,
          action: item.action || null,
          etaText: item.etaText || null,
          status: 'active',
        })),
      });

      // 5b. Delete all DraftItems for this artifact
      await tx.draftItem.deleteMany({
        where: { artifactId },
      });

      // 5c. Update Artifact status to 'confirmed'
      await tx.artifact.update({
        where: { id: artifactId },
        data: { status: 'confirmed' },
      });

      return { count: confirmedItems.count };
    });

    // 6. Return success
    return NextResponse.json({
      success: true,
      artifactId,
      confirmedCount: result.count,
    });
  } catch (error) {
    console.error('Confirmation error:', error);

    const message =
      error instanceof Error && error.message.includes('Invalid')
        ? error.message
        : '确认入库失败,请稍后重试';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
