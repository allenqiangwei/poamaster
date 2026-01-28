import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { Prisma } from '@prisma/client';

/**
 * PATCH /api/assignees/[id]
 * 更新负责人
 * Body: {
 *   name?: string,
 *   feishuUserId?: string | null
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证 Session
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

    const { id } = await params;

    // 检查负责人是否存在
    const existingAssignee = await prisma.assignee.findUnique({
      where: { id },
    });

    if (!existingAssignee) {
      return NextResponse.json(
        { success: false, error: 'Assignee not found' },
        { status: 404 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const { name, feishuUserId } = body;

    // 验证名称
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Name cannot be empty' },
        { status: 400 }
      );
    }

    // 构建更新数据
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (feishuUserId !== undefined) {
      updateData.feishuUserId = feishuUserId ? feishuUserId.trim() : null;
    }

    try {
      // 更新负责人
      const assignee = await prisma.assignee.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: { tasks: true },
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: assignee,
      });
    } catch (error) {
      // 检查是否是唯一性约束冲突（名称已存在）
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return NextResponse.json(
            { success: false, error: 'Assignee name already exists' },
            { status: 409 }
          );
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Update assignee error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update assignee' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/assignees/[id]
 * 删除负责人
 * 删除时会自动将关联任务的 assigneeId 设置为 null（Prisma schema 默认行为）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证 Session
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

    const { id } = await params;

    // 检查负责人是否存在
    const assignee = await prisma.assignee.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    if (!assignee) {
      return NextResponse.json(
        { success: false, error: 'Assignee not found' },
        { status: 404 }
      );
    }

    // 删除负责人（关联的任务会自动将 assigneeId 设置为 null）
    // 这是由 Prisma schema 中的 onDelete 默认行为（SetNull）实现的
    await prisma.assignee.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Assignee deleted successfully',
      tasksAffected: assignee._count.tasks,
    });
  } catch (error) {
    console.error('Delete assignee error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete assignee' },
      { status: 500 }
    );
  }
}
