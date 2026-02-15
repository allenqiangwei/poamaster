/**
 * Bot Agent — LLM-powered conversational agent for the Feishu bot.
 *
 * Receives user messages, loads conversation history from BotConversation,
 * builds OpenAI function-calling requests with tool definitions for querying
 * tasks, people, team pulse, and decisions, then returns the assistant's reply.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

let prisma: PrismaClient;

export function initBotAgent(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

const MAX_HISTORY = 20;

// ---------------------------------------------------------------------------
// Config helpers (same decrypt pattern as notifier.ts / signal-detector.ts)
// ---------------------------------------------------------------------------

/** Decrypt AES-256-GCM (same logic as lib/crypto.ts) */
function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return encryptedText;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Read a config value from the database */
async function getConfig(key: string): Promise<string> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || '';
}

// ---------------------------------------------------------------------------
// Tool definitions for OpenAI function calling
// ---------------------------------------------------------------------------

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
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

// ---------------------------------------------------------------------------
// Main entry point — process a user message and return the bot reply
// ---------------------------------------------------------------------------

export async function processMessage(
  chatId: string,
  userMessage: string,
): Promise<string> {
  try {
    // Load conversation history
    const conv = await prisma.botConversation.findUnique({
      where: { chatId },
    });
    const history: Array<{ role: string; content: string }> =
      (conv?.messages as Array<{ role: string; content: string }>) || [];

    history.push({ role: 'user', content: userMessage });
    const trimmed = history.slice(-MAX_HISTORY);

    const systemMsg = [
      '你是 POA Master AI 助手，帮助COO管理团队。',
      '你可以查询任务、人员状态、团队脉搏、决策日志等数据。',
      '用简洁的中文回答，重点突出，格式清晰。',
      `当前时间: ${new Date().toLocaleString('zh-CN')}`,
    ].join('');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMsg },
      ...trimmed.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Get OpenAI config from database (encrypted) or env vars
    let apiKey = await getConfig('openai.apiKey');
    if (apiKey && apiKey.includes(':') && apiKey.split(':').length === 3) {
      apiKey = decrypt(apiKey);
    }
    if (!apiKey) apiKey = process.env.OPENAI_API_KEY || '';

    const modelName = (await getConfig('openai.model')) || 'gpt-4o';

    // Support HTTPS proxy (same pattern as main app)
    const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
    const clientConfig: Record<string, any> = { apiKey, timeout: 60000 };
    if (proxyUrl) {
      const { ProxyAgent } = await import('undici');
      clientConfig.fetchOptions = { dispatcher: new ProxyAgent(proxyUrl) };
    }

    const openai = new OpenAI(clientConfig);

    // First call — let the model decide which tools (if any) to call
    let response = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: TOOLS,
      temperature: 0.7,
      max_completion_tokens: 1500,
    });

    let assistantMsg = response.choices[0]?.message;

    // Handle tool calls — execute each, then send results back for final answer
    if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
      messages.push(assistantMsg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      for (const tc of assistantMsg.tool_calls) {
        if (tc.type !== 'function') continue;
        const args = JSON.parse(tc.function.arguments || '{}');
        logger.info(
          `[BotAgent] Tool call: ${tc.function.name}(${JSON.stringify(args)})`,
        );
        const result = await executeTool(tc.function.name, args);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Second call — model synthesizes tool results into a natural answer
      response = await openai.chat.completions.create({
        model: modelName,
        messages,
        temperature: 0.7,
        max_completion_tokens: 1500,
      });
      assistantMsg = response.choices[0]?.message;
    }

    const reply =
      assistantMsg?.content || '抱歉，我暂时无法处理这个请求。';

    // Persist conversation history
    trimmed.push({ role: 'assistant', content: reply });
    await prisma.botConversation.upsert({
      where: { chatId },
      create: {
        chatId,
        messages: trimmed.slice(-MAX_HISTORY) as any,
        lastActiveAt: new Date(),
      },
      update: {
        messages: trimmed.slice(-MAX_HISTORY) as any,
        lastActiveAt: new Date(),
      },
    });

    return reply;
  } catch (err: any) {
    logger.error(`[BotAgent] Error processing message: ${err.message}`);
    return '抱歉，处理消息时发生错误，请稍后重试。';
  }
}
