import { PrismaClient } from '@prisma/client';
import { taskQueue } from '@/lib/roundtable/task-queue';
import { getConfig } from '@/lib/config';

const prisma = new PrismaClient();

async function main() {
  const apiKey = await getConfig('openai.apiKey') || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OpenAI API key not configured');
    process.exit(1);
  }

  const pendingDiscussions = await prisma.roundtableDiscussion.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`找到 ${pendingDiscussions.length} 个待处理的讨论\n`);

  for (const discussion of pendingDiscussions) {
    console.log(`✓ 重新加入队列: ${discussion.id}`);
    console.log(`  标题: ${discussion.title}`);
    await taskQueue.enqueue({
      discussionId: discussion.id,
      apiKey
    });
  }

  console.log('\n✅ 所有待处理讨论已重新加入队列');
  console.log('任务队列将在后台处理，可以在服务器日志中查看进度');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ 错误:', error);
  process.exit(1);
});
