import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始清理重复模板...\n');

  // 获取所有模板，按名称分组
  const templates = await prisma.roundtableTemplate.findMany({
    orderBy: { createdAt: 'asc' }, // 旧的在前
  });

  // 按名称分组
  const grouped = new Map<string, typeof templates>();
  templates.forEach(t => {
    if (!grouped.has(t.name)) {
      grouped.set(t.name, []);
    }
    grouped.get(t.name)!.push(t);
  });

  // 删除每个名称的旧模板，只保留最新的
  for (const [name, items] of grouped.entries()) {
    if (items.length > 1) {
      // 保留最新的（最后一个），删除其他的
      const toDelete = items.slice(0, -1);
      console.log(`"${name}" 有 ${items.length} 个重复，删除旧的 ${toDelete.length} 个...`);

      for (const t of toDelete) {
        await prisma.roundtableTemplate.delete({
          where: { id: t.id },
        });
      }
    }
  }

  console.log('\n✅ 清理完成!');

  // 显示最终结果
  const finalTemplates = await prisma.roundtableTemplate.findMany({
    select: { name: true, priority: true },
    orderBy: { priority: 'desc' },
  });

  console.log(`\n最终保留 ${finalTemplates.length} 个模板:`);
  finalTemplates.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name} (优先级: ${t.priority})`);
  });
}

main()
  .catch((e) => {
    console.error('❌ 清理失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
