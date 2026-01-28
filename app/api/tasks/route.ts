import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { TaskStatus } from '@prisma/client';
import { startScheduler } from '@/services/scheduler';

// 启动定时任务（仅在生产环境）
if (process.env.NODE_ENV === 'production') {
  startScheduler();
}

/**
 * GET /api/tasks
 * 获取任务列表（支持筛选和排序）
 * Query Parameters:
 *   - status: TaskStatus (可选，筛选状态)
 *   - assigneeId: string (可选，筛选负责人)
 *   - dueBefore: ISO 8601 日期字符串 (可选，筛选截止日期早于指定日期的任务)
 *   - dueAfter: ISO 8601 日期字符串 (可选，筛选截止日期晚于指定日期的任务)
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

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as TaskStatus | null;
    const assigneeId = searchParams.get('assigneeId');
    const dueBefore = searchParams.get('dueBefore');
    const dueAfter = searchParams.get('dueAfter');

    // 构建筛选条件
    const where: any = {};

    if (status && Object.values(TaskStatus).includes(status)) {
      where.status = status;
    }

    if (assigneeId) {
      where.assigneeId = assigneeId;
    }

    if (dueBefore || dueAfter) {
      where.dueDate = {};
      if (dueBefore) {
        where.dueDate.lt = new Date(dueBefore);
      }
      if (dueAfter) {
        where.dueDate.gt = new Date(dueAfter);
      }
    }

    // 查询任务列表
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            feishuUserId: true,
          },
        },
      },
      orderBy: [
        { dueDate: 'asc' }, // 截止时间升序（越早越靠前）
        { createdAt: 'desc' }, // 创建时间降序（最新的靠前）
      ],
    });

    return NextResponse.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 * 创建任务
 * Body: {
 *   title: string,
 *   dod?: string,
 *   dueDate?: string (ISO 8601),
 *   status?: TaskStatus,
 *   assigneeId?: string
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
    const { title, dod, dueDate, status, assigneeId } = body;

    // 验证必填字段
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    // 验证状态枚举
    if (status && !Object.values(TaskStatus).includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    // 验证负责人是否存在
    if (assigneeId) {
      const assignee = await prisma.assignee.findUnique({
        where: { id: assigneeId },
      });
      if (!assignee) {
        return NextResponse.json(
          { success: false, error: 'Assignee not found' },
          { status: 404 }
        );
      }
    }

    // 创建任务
    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        dod: dod?.trim() || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status || TaskStatus.TODO,
        assigneeId: assigneeId || null,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            feishuUserId: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: task,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
