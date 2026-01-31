// app/api/insights/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { DraftItemData } from '@/lib/insights/types';
import { DIMENSIONS } from '@/lib/insights/types';

// ========== Validation Function ==========

function validateItems(items: any[]): items is Array<{
  dimension: string;
  content: string;
  decisionType?: string;
  action?: string;
  etaText?: string;
}> {
  // Check array is non-empty
  if (items.length === 0) {
    throw new Error('确认项目列表不能为空');
  }

  // Check reasonable size limit
  if (items.length > 200) {
    throw new Error('确认项目数量过多（最多 200 个）');
  }

  const validDimensions = Object.values(DIMENSIONS);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Validate required fields
    if (!item || typeof item !== 'object') {
      throw new Error(`项目 #${i + 1}: 无效的项目格式`);
    }

    if (!item.dimension || typeof item.dimension !== 'string') {
      throw new Error(`项目 #${i + 1}: 缺少必需字段 dimension`);
    }

    if (!item.content || typeof item.content !== 'string' || item.content.trim().length === 0) {
      throw new Error(`项目 #${i + 1} (维度: ${item.dimension}): 缺少必需字段 content 或内容为空`);
    }

    // Validate dimension value
    if (!validDimensions.includes(item.dimension as any)) {
      throw new Error(`无效的维度值: ${item.dimension}`);
    }

    // Validate optional fields if present
    if (item.decisionType !== undefined && item.decisionType !== null) {
      if (typeof item.decisionType !== 'string') {
        throw new Error('decisionType 必须是字符串');
      }
    }

    if (item.action !== undefined && item.action !== null) {
      if (typeof item.action !== 'string') {
        throw new Error('action 必须是字符串');
      }
    }

    if (item.etaText !== undefined && item.etaText !== null) {
      if (typeof item.etaText !== 'string') {
        throw new Error('etaText 必须是字符串');
      }
    }
  }

  return true;
}

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

    console.log('[Confirm] Request received:', {
      artifactId,
      itemCount: Array.isArray(items) ? items.length : 'not array',
      firstItem: Array.isArray(items) && items.length > 0 ? items[0] : null
    });

    if (!artifactId || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: '缺少必需参数: artifactId 和 items' },
        { status: 400 }
      );
    }

    // Validate items content
    try {
      validateItems(items);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '无效的项目数据' },
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

    // Note: This is a single-user system (COO only). Session authentication
    // is sufficient authorization - the COO has access to all assignees and artifacts.
    // No per-assignee permission check is needed.

    // 4. Validate artifact status is 'ready' (extraction completed)
    if (artifact.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: `文件状态不正确: ${artifact.status}` },
        { status: 400 }
      );
    }

    // 5. Confirm items in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 5a. Atomically update status with condition (prevents race condition)
      const updated = await tx.artifact.updateMany({
        where: {
          id: artifactId,
          status: 'ready'  // Only update if still 'ready'
        },
        data: { status: 'confirmed' },
      });

      if (updated.count === 0) {
        throw new Error('文件已确认或状态不正确');
      }

      // 5b. Create ConfirmedItems from the provided items
      const confirmedItems = await tx.confirmedItem.createMany({
        data: items.map((item, index) => ({
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

      // 5c. Delete all DraftItems for this artifact
      await tx.draftItem.deleteMany({
        where: { artifactId },
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
