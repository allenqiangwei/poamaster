import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 使用自定义认证系统
    const token = request.cookies.get('session')?.value;
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actionId = params.id;

    // 查找行动项
    const action = await prisma.roundtableAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      );
    }

    // 如果已经创建过任务，返回错误
    if (action.taskId) {
      return NextResponse.json(
        { error: 'Task already created for this action' },
        { status: 400 }
      );
    }

    // 查找或创建负责人
    let assignee = null;
    if (action.assignee) {
      assignee = await prisma.assignee.findUnique({
        where: { name: action.assignee },
      });

      if (!assignee) {
        assignee = await prisma.assignee.create({
          data: { name: action.assignee },
        });
      }
    }

    // 创建任务
    const task = await prisma.task.create({
      data: {
        title: action.content,
        dod: action.acceptanceCriteria || undefined,
        dueDate: action.deadline || undefined,
        assigneeId: assignee?.id,
        status: 'TODO',
      },
    });

    // 更新action记录，关联任务ID
    await prisma.roundtableAction.update({
      where: { id: actionId },
      data: { taskId: task.id },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
