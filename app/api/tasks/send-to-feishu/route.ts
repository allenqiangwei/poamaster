import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { sendFeishuTextMessage } from '@/lib/feishu';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * POST /api/tasks/send-to-feishu
 * 发送任务列表到飞书
 * Body: {
 *   taskIds: string[]  // 要发送的任务 ID 列表
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
    const { taskIds } = body;

    // 验证输入
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '请选择要发送的任务' },
        { status: 400 }
      );
    }

    // 查询任务详情
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
      },
      include: {
        assignee: {
          select: {
            name: true,
            feishuUserId: true,
          },
        },
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    if (tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: '未找到要发送的任务' },
        { status: 404 }
      );
    }

    // 格式化任务列表为飞书消息
    const message = formatTasksForFeishu(tasks);

    // 发送到飞书
    await sendFeishuTextMessage(message);

    return NextResponse.json({
      success: true,
      message: `成功发送 ${tasks.length} 个任务到飞书`,
      count: tasks.length,
    });
  } catch (error) {
    console.error('发送任务到飞书失败:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: '发送失败，请检查飞书配置' },
      { status: 500 }
    );
  }
}

/**
 * 格式化任务列表为飞书富文本消息
 */
function formatTasksForFeishu(tasks: any[]): string {
  const now = new Date();
  const timestamp = format(now, 'yyyy-MM-dd HH:mm', { locale: zhCN });

  let message = `📋 **任务列表推送** (${timestamp})\n`;
  message += `共 ${tasks.length} 个任务\n\n`;

  // 按状态分组
  const tasksByStatus: Record<string, any[]> = {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
    CANCELLED: [],
    POSTPONED: [],
  };

  tasks.forEach((task) => {
    if (tasksByStatus[task.status]) {
      tasksByStatus[task.status].push(task);
    }
  });

  const statusLabels: Record<string, string> = {
    TODO: '📌 待办',
    IN_PROGRESS: '🔄 进行中',
    DONE: '✅ 已完成',
    CANCELLED: '❌ 已取消',
    POSTPONED: '⏸️ 已推迟',
  };

  // 按状态输出任务
  Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
    if (statusTasks.length === 0) return;

    message += `\n**${statusLabels[status]}** (${statusTasks.length})\n`;
    message += '─────────────────\n';

    statusTasks.forEach((task, index) => {
      message += `${index + 1}. ${task.title}\n`;

      if (task.assignee) {
        message += `   👤 负责人: ${task.assignee.name}\n`;
      }

      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const dueDateStr = format(dueDate, 'MM月dd日', { locale: zhCN });
        const isOverdue = dueDate < now && task.status !== 'DONE';
        const isToday = format(dueDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');

        if (isOverdue) {
          message += `   ⚠️ 截止: ${dueDateStr} (已逾期)\n`;
        } else if (isToday) {
          message += `   🔥 截止: 今天\n`;
        } else {
          message += `   📅 截止: ${dueDateStr}\n`;
        }
      }

      if (task.dod) {
        message += `   ✓ DoD: ${task.dod}\n`;
      }

      message += '\n';
    });
  });

  message += '\n────────────────────\n';
  message += '💡 通过 POA Master 发送';

  return message;
}
