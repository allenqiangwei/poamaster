import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.roundtableTemplate.findMany({
    select: {
      name: true,
      priority: true,
      createdAt: true,
    },
    orderBy: {
      priority: 'desc',
    },
  });

  console.log(`总共 ${templates.length} 个模板:\n`);
  templates.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name} (优先级: ${t.priority}) - ${t.createdAt.toISOString().split('T')[0]}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
