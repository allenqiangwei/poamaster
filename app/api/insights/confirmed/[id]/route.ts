import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * PATCH /api/insights/confirmed/[id]
 * 更新已确认的洞察条目
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话无效' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '内容不能为空' },
        { status: 400 }
      );
    }

    // 检查条目是否存在
    const existingItem = await prisma.confirmedItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: '条目不存在' },
        { status: 404 }
      );
    }

    // 更新条目
    const updatedItem = await prisma.confirmedItem.update({
      where: { id },
      data: { content: content.trim() },
    });

    return NextResponse.json({
      success: true,
      data: updatedItem,
    });
  } catch (error) {
    console.error('Update confirmed item error:', error);
    return NextResponse.json(
      { success: false, error: '更新失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/insights/confirmed/[id]
 * 删除已确认的洞察条目
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话无效' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 检查条目是否存在
    const existingItem = await prisma.confirmedItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: '条目不存在' },
        { status: 404 }
      );
    }

    // 删除条目
    await prisma.confirmedItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete confirmed item error:', error);
    return NextResponse.json(
      { success: false, error: '删除失败' },
      { status: 500 }
    );
  }
}
