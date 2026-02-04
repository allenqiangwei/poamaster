import { PrismaClient } from '@prisma/client';
import { DiscussionEngine, DiscussionContext, RoundResult } from './discussion-engine';
import { sendFeishuNotification } from '../feishu';

const prisma = new PrismaClient();

/**
 * 解析 AI 返回的 deadline 字符串为 Date 对象
 * 支持：ISO 日期格式、中文相对时间描述（如"2周内"、"1个月内"）
 */
function parseDeadline(deadlineStr: string | null | undefined): Date | null {
  if (!deadlineStr || deadlineStr.trim() === '') {
    return null;
  }

  // 尝试直接解析 ISO 格式或标准日期格式
  const parsedDate = new Date(deadlineStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  // 解析中文相对时间描述
  const now = new Date();

  // 匹配 "X天内"、"X周内"、"X个月内"
  const dayMatch = deadlineStr.match(/(\d+)\s*天/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  const weekMatch = deadlineStr.match(/(\d+)\s*周/);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  }

  const monthMatch = deadlineStr.match(/(\d+)\s*个?月/);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + months);
    return futureDate;
  }

  // 无法解析，返回 null
  console.warn(`[TaskQueue] Cannot parse deadline: "${deadlineStr}", setting to null`);
  return null;
}

interface QueueTask {
  discussionId: string;
  apiKey: string;
  model?: string;
}

class TaskQueue {
  private queue: QueueTask[] = [];
  private processing = false;

  async enqueue(task: QueueTask) {
    this.queue.push(task);
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.queue.shift()!;

    try {
      await this.processDiscussion(task.discussionId, task.apiKey, task.model);
    } catch (error) {
      console.error(`Failed to process discussion ${task.discussionId}:`, error);

      // 标记为失败
      await prisma.roundtableDiscussion.update({
        where: { id: task.discussionId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    // 继续处理下一个
    setTimeout(() => this.processQueue(), 100);
  }

  private async processDiscussion(discussionId: string, apiKey: string, model?: string) {
    // 更新状态
    await prisma.roundtableDiscussion.update({
      where: { id: discussionId },
      data: {
        processingStartedAt: new Date(),
      },
    });

    // 获取讨论信息
    const discussion = await prisma.roundtableDiscussion.findUnique({
      where: { id: discussionId },
      include: {
        template: {
          include: {
            roles: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!discussion || !discussion.template) {
      throw new Error('Discussion or template not found');
    }

    const engine = new DiscussionEngine(model);
    const context: DiscussionContext = {
      material: discussion.materialText,
      template: {
        name: discussion.template.name,
        roles: discussion.template.roles.map(r => ({
          name: r.name,
          responsibility: r.responsibility,
          focusAreas: r.focusAreas,
        })),
      },
    };

    // 回合1：澄清
    const clarifyResult = await engine.runClarifyRound(context);
    await this.saveRound(discussionId, 1, 'clarify', clarifyResult);

    // 回合2：质疑
    const questionResult = await engine.runQuestionRound(context, clarifyResult);
    await this.saveRound(discussionId, 2, 'question', questionResult);

    // 保存假设和初步风险
    if (questionResult.assumptions) {
      await prisma.roundtableAssumption.createMany({
        data: questionResult.assumptions.map(a => ({
          discussionId,
          ...a,
        })),
      });
    }
    if (questionResult.risks) {
      await prisma.roundtableRisk.createMany({
        data: questionResult.risks.map(r => ({
          discussionId,
          ...r,
        })),
      });
    }

    // 回合3：反驳（串行）
    const rebuttalMessages: Array<{ roleName: string; content: string; order: number }> = [];
    for (let i = 0; i < context.template.roles.length; i++) {
      const role = context.template.roles[i];
      const result = await engine.runRebuttalRound(
        context,
        [clarifyResult, questionResult],
        role.name
      );
      rebuttalMessages.push({
        ...result,
        order: i + 1,
      });
    }
    await this.saveRound(discussionId, 3, 'rebuttal', { messages: rebuttalMessages });

    // 回合4：裁决
    const verdictResult = await engine.runVerdictRound(context, [
      clarifyResult,
      questionResult,
      { messages: rebuttalMessages },
    ]);

    await this.saveRound(discussionId, 4, 'verdict', {
      messages: [{
        roleName: '主持人/裁决官',
        content: `${verdictResult.conclusion}\n\n决策依据：\n${verdictResult.decisionReasoning}`,
        order: 1,
      }],
    });

    // 保存裁决结果
    await prisma.roundtableDiscussion.update({
      where: { id: discussionId },
      data: {
        conclusion: verdictResult.conclusion,
        conclusionType: verdictResult.conclusionType,
        decisionReasoning: verdictResult.decisionReasoning,
        status: 'completed',
        processingCompletedAt: new Date(),
      },
    });

    // 保存行动清单
    if (verdictResult.actions) {
      await prisma.roundtableAction.createMany({
        data: verdictResult.actions.map(a => ({
          discussionId,
          content: a.content,
          assignee: a.assignee,
          deadline: parseDeadline(a.deadline),
          acceptanceCriteria: a.acceptanceCriteria,
          priority: a.priority,
        })),
      });
    }

    // 更新风险清单（合并初步风险和最终风险）
    if (verdictResult.risks) {
      await prisma.roundtableRisk.createMany({
        data: verdictResult.risks.map(r => ({
          discussionId,
          ...r,
        })),
      });
    }

    // 发送飞书通知
    try {
      await this.sendCompletionNotification(discussionId);
    } catch (error) {
      console.error('Failed to send Feishu notification:', error);
    }
  }

  private async saveRound(
    discussionId: string,
    roundNumber: number,
    roundType: string,
    result: RoundResult
  ) {
    const round = await prisma.roundtableRound.create({
      data: {
        discussionId,
        roundNumber,
        roundType,
      },
    });

    if (result.messages) {
      await prisma.roundtableMessage.createMany({
        data: result.messages.map(m => ({
          roundId: round.id,
          ...m,
        })),
      });
    }
  }

  private async sendCompletionNotification(discussionId: string) {
    const discussion = await prisma.roundtableDiscussion.findUnique({
      where: { id: discussionId },
      include: {
        template: true,
        actions: true,
        risks: { where: { priority: 'high' } },
      },
    });

    if (!discussion) return;

    const config = await prisma.config.findUnique({
      where: { key: 'feishu_webhook_url' },
    });

    if (!config) return;

    const message = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: '圆桌会议讨论完成',
          },
          template: discussion.conclusionType === 'pass' ? 'green' : 'orange',
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**讨论标题**：${discussion.title}\n**使用模板**：${discussion.template.name}\n**裁决结果**：${discussion.conclusion}\n**行动项**：${discussion.actions.length}项\n**高风险项**：${discussion.risks.length}项`,
            },
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: {
                  tag: 'plain_text',
                  content: '查看完整报告',
                },
                url: `${process.env.NEXT_PUBLIC_BASE_URL}/roundtable/discussions/${discussionId}`,
                type: 'primary',
              },
            ],
          },
        ],
      },
    };

    await sendFeishuNotification(config.value, message);
  }
}

export const taskQueue = new TaskQueue();
