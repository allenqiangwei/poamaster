import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { Prisma } from '@prisma/client';

/**
 * GET /api/assignees
 * 获取负责人列表
 */
export async function GET(request: NextRequest) {
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

    // 查询负责人列表
    const assignees = await prisma.assignee.findMany({
      include: {
        _count: {
          select: { tasks: true }, // 统计每个负责人的任务数量
        },
      },
      orderBy: {
        createdAt: 'desc', // 最新创建的在前
      },
    });

    return NextResponse.json({
      success: true,
      data: assignees,
    });
  } catch (error) {
    console.error('Get assignees error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assignees' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/assignees
 * 创建负责人
 * Body: {
 *   name: string,
 *   feishuUserId?: string
 * }
 */
export async function POST(request: NextRequest) {
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

    // 解析请求体
    const body = await request.json();
    const { name, feishuUserId } = body;

    // 验证必填字段
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    try {
      // 创建负责人
      const assignee = await prisma.assignee.create({
        data: {
          name: name.trim(),
          feishuUserId: feishuUserId?.trim() || null,
        },
        include: {
          _count: {
            select: { tasks: true },
          },
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: assignee,
        },
        { status: 201 }
      );
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
    console.error('Create assignee error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create assignee' },
      { status: 500 }
    );
  }
}
