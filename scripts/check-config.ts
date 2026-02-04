import { PrismaClient } from '@prisma/client';
import { getConfig } from '@/lib/config';

const prisma = new PrismaClient();

async function main() {
  console.log('检查配置...\n');

  // 检查数据库中的所有配置
  const configs = await prisma.config.findMany();
  console.log(`数据库中共有 ${configs.length} 个配置:\n`);
  configs.forEach(c => {
    console.log(`- ${c.key}: ${c.value.substring(0, 20)}${c.value.length > 20 ? '...' : ''}`);
  });

  console.log('\n尝试获取 openai.apiKey:');
  try {
    const apiKey = await getConfig('openai.apiKey');
    if (apiKey) {
      console.log(`✓ 找到 openai.apiKey: ${apiKey.substring(0, 10)}...`);
    } else {
      console.log('✗ openai.apiKey 未配置');
    }
  } catch (error) {
    console.error('✗ 获取失败:', error);
  }

  console.log('\n检查环境变量 OPENAI_API_KEY:');
  if (process.env.OPENAI_API_KEY) {
    console.log(`✓ 环境变量存在: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);
  } else {
    console.log('✗ 环境变量未设置');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
