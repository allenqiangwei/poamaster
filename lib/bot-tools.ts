/**
 * Shared bot tools module — OpenAI function calling tool definitions and
 * Prisma-based execution logic, shared between the web chat API and the
 * Feishu bot agent.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const BOT_SYSTEM_PROMPT = [
  '你是 POA Master AI 助手，帮助COO管理团队。',
  '你可以查询任务、人员状态、团队脉搏、决策日志等数据。',
  '用简洁的中文回答，重点突出，格式清晰。',
].join('');

// ---------------------------------------------------------------------------
// Tool definitions for OpenAI function calling
// ---------------------------------------------------------------------------

export const BOT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_today_priorities',
      description: '获取今日优先事项：逾期任务、未处理信号、待执行决策',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_person_status',
      description: '获取某人的状态概要：活跃度、任务进展、情绪状态',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '人员姓名' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_list',
      description: '查询任务列表，可按负责人和状态筛选',
      parameters: {
        type: 'object',
        properties: {
          assignee: { type: 'string', description: '负责人姓名（可选）' },
          status: {
            type: 'string',
            enum: ['TODO', 'IN_PROGRESS', 'DONE'],
            description: '任务状态（可选）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_team_pulse',
      description: '获取团队脉搏概览：消息活跃度、情绪趋势、关键信号',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '查看最近几天，默认7' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_decisions',
      description: '查询决策日志，可按状态筛选',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'REVISED'],
            description: '决策状态（可选）',
          },
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution — runs Prisma queries and returns JSON results
// ---------------------------------------------------------------------------

export async function executeBotTool(
  name: string,
  args: Record<string, any>,
  prisma: PrismaClient,
): Promise<string> {
  const days = (args.days as number) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  switch (name) {
    case 'get_today_priorities': {
      const [overdue, signals, decisions] = await Promise.all([
        prisma.task.findMany({
          where: { status: { not: 'DONE' }, dueDate: { lt: new Date() } },
          include: { assignee: { select: { name: true } } },
          take: 5,
        }),
        prisma.chatSignal.findMany({
          where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } },
          include: { chat: { select: { name: true } } },
          take: 5,
          orderBy: { detectedAt: 'desc' },
        }),
        prisma.decision.findMany({
          where: { status: 'PENDING' },
          take: 5,
          orderBy: { madeAt: 'desc' },
        }),
      ]);
      return JSON.stringify({
        overdueTasks: overdue.map((t) => ({
          title: t.title,
          assignee: t.assignee?.name,
          dueDate: t.dueDate,
        })),
        signals: signals.map((s) => ({
          type: s.signalType,
          severity: s.severity,
          title: s.title,
          chat: s.chat.name,
        })),
        pendingDecisions: decisions.map((d) => ({
          title: d.title,
          madeBy: d.madeBy,
        })),
      });
    }

    case 'get_person_status': {
      const assignee = await prisma.assignee.findFirst({
        where: { name: { contains: args.name as string } },
      });
      if (!assignee) {
        return JSON.stringify({ error: `未找到名为"${args.name}"的人员` });
      }
      const [msgCount, tasks] = await Promise.all([
        prisma.feishuMessage.count({
          where: { senderName: assignee.name, timestamp: { gte: since } },
        }),
        prisma.task.findMany({ where: { assigneeId: assignee.id } }),
      ]);
      const byStatus: Record<string, number> = {};
      tasks.forEach((t) => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });
      return JSON.stringify({
        name: assignee.name,
        weekMessages: msgCount,
        tasks: byStatus,
        overdue: tasks
          .filter(
            (t) =>
              t.status !== 'DONE' &&
              t.dueDate &&
              new Date(t.dueDate) < new Date(),
          )
          .map((t) => t.title),
      });
    }

    case 'get_task_list': {
      const where: Record<string, any> = {};
      if (args.assignee) {
        const a = await prisma.assignee.findFirst({
          where: { name: { contains: args.assignee as string } },
        });
        if (a) where.assigneeId = a.id;
      }
      if (args.status) where.status = args.status;
      const tasks = await prisma.task.findMany({
        where,
        include: { assignee: { select: { name: true } } },
        take: 15,
        orderBy: { dueDate: 'asc' },
      });
      return JSON.stringify(
        tasks.map((t) => ({
          title: t.title,
          status: t.status,
          assignee: t.assignee?.name,
          dueDate: t.dueDate,
        })),
      );
    }

    case 'get_team_pulse': {
      const [msgCount, signals, sentiment] = await Promise.all([
        prisma.feishuMessage.count({
          where: { timestamp: { gte: since } },
        }),
        prisma.chatSignal.findMany({
          where: { detectedAt: { gte: since } },
          include: { chat: { select: { name: true } } },
          take: 5,
        }),
        prisma.teamPulse.findMany({
          where: { date: { gte: since } },
          select: { sentimentScore: true },
        }),
      ]);
      const avgSentiment =
        sentiment.length > 0
          ? sentiment.reduce((s, p) => s + (p.sentimentScore || 0), 0) /
            sentiment.length
          : null;
      return JSON.stringify({
        totalMessages: msgCount,
        avgSentiment,
        recentSignals: signals.map((s) => ({
          type: s.signalType,
          severity: s.severity,
          title: s.title,
          chat: s.chat.name,
        })),
      });
    }

    case 'get_decisions': {
      const where: Record<string, any> = {};
      if (args.status) where.status = args.status;
      const decisions = await prisma.decision.findMany({
        where,
        take: 10,
        orderBy: { madeAt: 'desc' },
      });
      return JSON.stringify(
        decisions.map((d) => ({
          title: d.title,
          status: d.status,
          madeBy: d.madeBy,
          madeAt: d.madeAt,
        })),
      );
    }

    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}
