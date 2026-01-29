// scripts/test-extractor.ts
// 手动测试脚本 - 需要配置 OpenAI API Key

import { InsightsExtractor } from '../lib/insights/extractor';

const SHORT_TEXT = `
产品经理张三今天汇报说，用户注册功能的开发进度比预期慢了两周。
主要原因是后端 API 文档不完整，前端开发时需要反复确认字段定义。

他提到目前最关注的是如何在下个月底前完成整个用户管理模块。
这是 Q1 的核心 KPI，直接影响公司的融资进度。

张三说需要我拍板一件事：是否要增加一名后端开发来加速进度，还是调整排期延后发布。

他还提到一个风险：如果继续按现有节奏，可能无法通过安全审计，因为密码加密方案还没确定。

最后，张三说他会在本周五前完成技术方案评审，下周三前提交给我审批。
`;

async function main() {
  console.log('🚀 开始测试 InsightsExtractor...\n');

  const extractor = new InsightsExtractor();

  try {
    console.log('测试文本长度:', SHORT_TEXT.length, '字符\n');

    const result = await extractor.extract(SHORT_TEXT);

    console.log('✅ 提取完成!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('策略:', result.metadata.strategy);
    console.log('模型:', result.metadata.modelName);
    console.log('耗时:', result.metadata.latencyMs, 'ms');
    console.log('提取条目数:', result.items.length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 按维度分组显示
    const byDimension: Record<string, any[]> = {};
    result.items.forEach(item => {
      if (!byDimension[item.dimension]) {
        byDimension[item.dimension] = [];
      }
      byDimension[item.dimension].push(item);
    });

    const dimensionLabels: Record<string, string> = {
      focus: '负责人的关注点',
      goal: '负责人的目标',
      obstacle: '负责人困扰',
      decision: '需要我拍板的事情',
      risk: '负责人感觉到的风险',
      action: '负责人的行动项和 ETA',
    };

    for (const [dimension, items] of Object.entries(byDimension)) {
      console.log(`\n📌 ${dimensionLabels[dimension] || dimension} (${items.length} 条)`);
      console.log('─'.repeat(50));

      items.forEach((item, index) => {
        console.log(`\n  [${index + 1}] ${item.content}`);
        if (item.evidence) {
          console.log(`      证据: "${item.evidence}"`);
        }
        if (item.decisionType) {
          console.log(`      类型: ${item.decisionType}`);
        }
        if (item.action) {
          console.log(`      行动: ${item.action}`);
        }
        if (item.etaText) {
          console.log(`      时间: ${item.etaText}`);
        }
      });
    }

    console.log('\n\n🎉 测试完成！');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
    }
    process.exit(1);
  }
}

main();
