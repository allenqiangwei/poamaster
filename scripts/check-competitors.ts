import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCompetitors() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 获取所有启用的竞品
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    include: {
      news: {
        where: {
          createdAt: { gte: today, lt: tomorrow }
        },
        orderBy: { createdAt: 'desc' }
      },
      alerts: {
        where: {
          createdAt: { gte: today, lt: tomorrow }
        },
        orderBy: { createdAt: 'desc' }
      },
      reviews: {
        where: {
          createdAt: { gte: today, lt: tomorrow }
        },
        orderBy: { createdAt: 'desc' }
      },
      appSnapshots: {
        where: {
          createdAt: { gte: today, lt: tomorrow }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  console.log('\n=== 今日竞品情况 ===\n');
  console.log(`日期: ${today.toLocaleDateString('zh-CN')}\n`);

  if (competitors.length === 0) {
    console.log('⚠️  未配置任何竞品监控');
    return;
  }

  for (const comp of competitors) {
    console.log(`\n📱 ${comp.name} ${comp.company ? `(${comp.company})` : ''}`);
    console.log('─'.repeat(50));

    // 新闻
    if (comp.news.length > 0) {
      console.log(`\n📰 新闻 (${comp.news.length}条):`);
      comp.news.forEach(news => {
        console.log(`  • ${news.title}`);
        if (news.summary) console.log(`    ${news.summary.slice(0, 100)}...`);
        console.log(`    来源: ${news.source} | ${news.publishedAt?.toLocaleString('zh-CN') || '未知时间'}`);
      });
    }

    // 预警
    if (comp.alerts.length > 0) {
      console.log(`\n⚠️  预警 (${comp.alerts.length}条):`);
      comp.alerts.forEach(alert => {
        const emoji = alert.severity === 'HIGH' ? '🔴' : alert.severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`  ${emoji} [${alert.alertType}] ${alert.title}`);
        console.log(`    ${alert.summary}`);
      });
    }

    // 评论
    if (comp.reviews.length > 0) {
      console.log(`\n💬 用户评论 (${comp.reviews.length}条):`);
      comp.reviews.forEach(review => {
        console.log(`  • ${review.title || '(无标题)'} - ${review.rating}⭐`);
        console.log(`    ${review.content.slice(0, 100)}...`);
      });
    }

    // App快照
    if (comp.appSnapshots.length > 0) {
      console.log(`\n📊 应用数据:`);
      comp.appSnapshots.forEach(snap => {
        console.log(`  • ${snap.platform}: ${snap.rating?.toFixed(1)}⭐ (${snap.ratingCount?.toLocaleString()}评分)`);
        if (snap.version) console.log(`    版本: ${snap.version}`);
        if (snap.releaseNotes) console.log(`    更新说明: ${snap.releaseNotes.slice(0, 80)}...`);
      });
    }

    // 如果今天没有任何数据
    const totalToday = comp.news.length + comp.alerts.length + comp.reviews.length + comp.appSnapshots.length;
    if (totalToday === 0) {
      console.log('\n  ℹ️  今天暂无新数据');
    }
  }

  console.log('\n' + '='.repeat(50) + '\n');
}

checkCompetitors()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
