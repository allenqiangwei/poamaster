import { prisma } from '@/lib/prisma';

/**
 * Load all three memory layers and assemble into an enhanced system prompt.
 * Called before each Claude CLI chat job.
 */
export async function loadCooSystemPrompt(): Promise<string> {
  // Layer 3: Semantic memory (core cognition)
  const core = await prisma.cooMemoryCore.findFirst({
    orderBy: { version: 'desc' },
    select: { content: true },
  });

  // Layer 2: Recent episodic memories (last 3 days)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const episodes = await prisma.cooMemoryEpisode.findMany({
    where: { date: { gte: threeDaysAgo } },
    orderBy: { date: 'desc' },
    select: { date: true, narrative: true, actions: true },
    take: 3,
  });

  // Layer 1: Working memory (real-time urgent data)
  const now = new Date();
  const [overdueCount, atRiskKRs, todayDecisions, unresolvedSignals] = await Promise.all([
    prisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
    prisma.keyResult.findMany({
      where: { objective: { status: 'ACTIVE' }, targetValue: { gt: 0 } },
      select: { currentValue: true, targetValue: true },
    }).then(krs => krs.filter(kr => (kr.currentValue / kr.targetValue) < 0.5).length),
    prisma.decision.count({
      where: { createdAt: { gte: new Date(now.toISOString().split('T')[0]) } },
    }),
    prisma.chatSignal.count({ where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } } }),
  ]);

  // Assemble system prompt
  let prompt = `你是 POA Master 的 COO AI 助手。你拥有对公司业务的深度理解和持续记忆。以行业前 1% COO 的专业水准回答用户的问题。提供深度分析、风险预警、和可执行的建议。用中文回答。\n\n`;

  // Core cognition
  if (core?.content) {
    prompt += `## 你对公司的认知\n\n${core.content}\n\n`;
  }

  // Recent episodes
  if (episodes.length > 0) {
    prompt += `## 最近发生的事\n\n`;
    for (const ep of episodes) {
      const dateStr = ep.date.toISOString().split('T')[0];
      prompt += `### ${dateStr}\n${ep.narrative}\n\n`;
      if (ep.actions) {
        prompt += `**当日建议行动：**\n${ep.actions}\n\n`;
      }
    }
  }

  // Real-time working memory
  prompt += `## 实时数据\n`;
  prompt += `- 逾期任务：${overdueCount} 个\n`;
  prompt += `- 风险 KR（进度 <50%）：${atRiskKRs} 个\n`;
  prompt += `- 今日新增决策：${todayDecisions} 个\n`;
  prompt += `- 未解决高危信号：${unresolvedSignals} 个\n`;

  return prompt;
}
