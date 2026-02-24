import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';

/**
 * Update the COO's semantic memory (core cognition) by merging
 * today's narrative with the existing understanding.
 */
export async function updateCoreMemory(
  narrative: string,
  changes: string,
  actions: string,
): Promise<void> {
  console.log('[COO Memory] Updating core memory...');

  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  // Fetch current core memory
  const current = await prisma.cooMemoryCore.findFirst({
    orderBy: { version: 'desc' },
  });

  const currentContent = current?.content || '（初始状态，尚无历史认知）';
  const currentVersion = current?.version || 0;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一位世界顶级的 COO。你维护着一份对公司业务的持续认知文档——这是你的"长期记忆"。

每天晚上，你会根据当天发生的事情更新这份认知。

更新原则：
1. **保留仍然正确的认知**——不要删掉仍然有效的信息
2. **修正已过时的认知**——如果今天的数据证明之前的判断不再正确，更新它
3. **添加新的认知**——今天的叙事中有哪些新的理解值得长期记住
4. **删除不再相关的内容**——清理已经解决的问题或不再重要的信息
5. **保持结构清晰**——使用 Markdown 标题组织内容
6. **控制总长度在 1500-2500 字**——这是你的工作记忆容量，太长会影响效率

建议的结构：
## 公司概况
## 团队画像
## 当前业务状态
## 关键趋势
## 主要风险
## 经验教训`,
      },
      {
        role: 'user',
        content: `## 当前认知（版本 ${currentVersion}）\n\n${currentContent}\n\n---\n\n## 今天发生了什么\n\n${narrative}\n\n## 今天的变化\n\n${changes}\n\n## 今天的行动建议\n\n${actions}\n\n---\n\n请根据今天的信息更新你的认知文档。直接输出更新后的完整 Markdown 内容，不要包含任何解释。`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 3000,
  });

  const updatedContent = response.choices[0]?.message?.content;
  if (!updatedContent) {
    console.error('[COO Memory] LLM returned empty response for core memory update');
    return;
  }

  // Upsert: if core record exists, update it; otherwise create new
  if (current) {
    await prisma.cooMemoryCore.update({
      where: { id: current.id },
      data: {
        content: updatedContent,
        version: currentVersion + 1,
      },
    });
  } else {
    await prisma.cooMemoryCore.create({
      data: {
        content: updatedContent,
        version: 1,
      },
    });
  }

  console.log(`[COO Memory] Core memory updated to version ${currentVersion + 1}`);
}
