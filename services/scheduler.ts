import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { sendFeishuMessage } from '@/lib/feishu';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';

export async function sendDailyTaskNotification() {
  console.log('[Scheduler] 开始发送每日任务通知...');

  try {
    const chatId = await getConfig('feishu.chatId');
    const enabled = await getConfig('feishu.enabled');

    if (!chatId || enabled !== 'true') {
      console.log('[Scheduler] 飞书通知未启用或未配置');
      return;
    }

    const today = startOfDay(new Date());
    const tomorrow = endOfDay(today);
    const nextWeek = addDays(today, 7);

    // 今日任务
    const todayTasks = await prisma.task.findMany({
      where: {
        dueDate: {
          gte: today,
          lte: tomorrow
        },
        status: {
          notIn: ['DONE', 'CANCELLED']
        }
      },
      include: { assignee: true },
      orderBy: { dueDate: 'asc' }
    });

    // 本周任务
    const weekTasks = await prisma.task.findMany({
      where: {
        dueDate: {
          gt: tomorrow,
          lte: nextWeek
        },
        status: {
          notIn: ['DONE', 'CANCELLED']
        }
      },
      include: { assignee: true },
      orderBy: { dueDate: 'asc' }
    });

    // 构建消息卡片
    const elements: any[] = [
      {
        tag: 'div',
        text: {
          content: `**🔴 今日待办任务 (${todayTasks.length} 个)**`,
          tag: 'lark_md'
        }
      },
      { tag: 'hr' }
    ];

    todayTasks.forEach((task) => {
      const timeStr = task.dueDate
        ? format(new Date(task.dueDate), 'HH:mm')
        : '';
      elements.push({
        tag: 'div',
        text: {
          content: `• ${task.title}\n  负责人：${task.assignee?.name || '未分配'}\n  截止：今天 ${timeStr}${task.dod ? `\n  DoD：${task.dod}` : ''}`,
          tag: 'lark_md'
        }
      });
    });

    if (weekTasks.length > 0) {
      elements.push(
        { tag: 'hr' },
        {
          tag: 'div',
          text: {
            content: `**📅 本周待办任务 (${weekTasks.length} 个)**`,
            tag: 'lark_md'
          }
        }
      );

      weekTasks.slice(0, 5).forEach((task) => {
        const dateStr = task.dueDate
          ? format(new Date(task.dueDate), 'MM-dd')
          : '';
        elements.push({
          tag: 'div',
          text: {
            content: `• ${task.title}\n  负责人：${task.assignee?.name || '未分配'}\n  截止：${dateStr}`,
            tag: 'lark_md'
          }
        });
      });
    }

    const card = {
      header: {
        title: {
          content: '📋 今日任务提醒',
          tag: 'plain_text'
        },
        template: 'blue'
      },
      elements
    };

    await sendFeishuMessage(chatId, card);

    console.log(
      `[Scheduler] 任务通知发送成功 - 今日 ${todayTasks.length} 个，本周 ${weekTasks.length} 个`
    );
  } catch (error) {
    console.error('[Scheduler] 任务通知发送失败:', error);
  }
}

export function startScheduler() {
  // 每天早上 8:00（中国时区）
  cron.schedule(
    '0 8 * * *',
    async () => {
      await sendDailyTaskNotification();
    },
    {
      timezone: 'Asia/Shanghai'
    }
  );

  // Team Pulse — daily chat analysis at 8:30 AM
  cron.schedule('30 8 * * *', async () => {
    console.log('[Scheduler] Running daily team pulse analysis...');
    try {
      const { runDailyAnalysis } = await import('@/lib/team-pulse/chat-analyzer');
      const result = await runDailyAnalysis();
      console.log(`[Scheduler] Team pulse complete: ${result.chatsAnalyzed} chats, ${result.signalsCreated} signals`);

      // Send daily pulse summary to Feishu
      try {
        const { generatePulseSummary } = await import('@/lib/team-pulse/chat-analyzer');
        const summary = await generatePulseSummary();
        const { sendFeishuTextMessage } = await import('@/lib/feishu');
        await sendFeishuTextMessage(summary);
      } catch (e: any) {
        console.error('[Scheduler] Failed to send pulse to Feishu:', e.message);
      }
    } catch (error: any) {
      console.error('[Scheduler] Team pulse analysis failed:', error.message);
    }
  }, { timezone: 'Asia/Shanghai' });

  console.log('[Scheduler] 定时任务已启动 - 每天 8:00 发送通知, 8:30 团队脉搏分析');
}
