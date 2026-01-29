// lib/insights/__tests__/extractor.test.ts

import { InsightsExtractor } from '../extractor';

// 模拟短文本（< 5000 字符）
const SHORT_TEXT = `
产品经理张三今天汇报说，用户注册功能的开发进度比预期慢了两周。
主要原因是后端 API 文档不完整，前端开发时需要反复确认字段定义。

他提到目前最关注的是如何在下个月底前完成整个用户管理模块。
这是 Q1 的核心 KPI，直接影响公司的融资进度。

张三说需要我拍板一件事：是否要增加一名后端开发来加速进度，还是调整排期延后发布。

他还提到一个风险：如果继续按现有节奏，可能无法通过安全审计，因为密码加密方案还没确定。

最后，张三说他会在本周五前完成技术方案评审，下周三前提交给我审批。
`;

// 模拟长文本（>= 5000 字符）
const LONG_TEXT = SHORT_TEXT.repeat(30); // 约 15000 字符

async function testShortTextExtraction() {
  console.log('=== 测试短文本提取 ===');

  const extractor = new InsightsExtractor();

  try {
    const result = await extractor.extract(SHORT_TEXT);

    console.log('策略:', result.metadata.strategy); // 应该是 'single'
    console.log('模型:', result.metadata.modelName);
    console.log('耗时:', result.metadata.latencyMs, 'ms');
    console.log('提取条目数:', result.items.length);

    console.log('\n提取的条目:');
    result.items.forEach((item, index) => {
      console.log(`\n[${index + 1}] ${item.dimension}`);
      console.log('  内容:', item.content);
      if (item.evidence) {
        console.log('  证据:', item.evidence.substring(0, 50) + '...');
      }
      if (item.decisionType) {
        console.log('  决策类型:', item.decisionType);
      }
      if (item.action) {
        console.log('  行动:', item.action);
      }
      if (item.etaText) {
        console.log('  时间:', item.etaText);
      }
    });

    console.log('\n✅ 短文本提取测试完成');
  } catch (error) {
    console.error('❌ 短文本提取失败:', error);
    throw error;
  }
}

async function testLongTextExtraction() {
  console.log('\n=== 测试长文本提取 ===');

  const extractor = new InsightsExtractor();

  try {
    const result = await extractor.extract(LONG_TEXT);

    console.log('策略:', result.metadata.strategy); // 应该是 'chunked'
    console.log('模型:', result.metadata.modelName);
    console.log('耗时:', result.metadata.latencyMs, 'ms');
    console.log('提取条目数:', result.items.length);

    console.log('\n✅ 长文本提取测试完成');
  } catch (error) {
    console.error('❌ 长文本提取失败:', error);
    throw error;
  }
}

async function testTextChunking() {
  console.log('\n=== 测试文本分块 ===');

  const extractor = new InsightsExtractor();
  const chunkSize = 3000;

  // 使用反射访问私有方法（仅用于测试）
  const chunkText = (extractor as any).chunkText.bind(extractor);
  const chunks = chunkText(LONG_TEXT, chunkSize);

  console.log('文本长度:', LONG_TEXT.length);
  console.log('分块数量:', chunks.length);
  console.log('块大小范围:', chunks.map((c: string) => c.length).join(', '));

  // 验证所有块拼接后是否完整
  const reconstructed = chunks.join('');
  const isComplete = reconstructed.includes('用户注册功能');
  console.log('分块是否完整:', isComplete ? '✅' : '❌');

  console.log('\n✅ 文本分块测试完成');
}

// 运行测试
async function runTests() {
  try {
    // 测试文本分块（不需要 API Key）
    await testTextChunking();

    // 测试短文本提取（需要 API Key）
    // await testShortTextExtraction();

    // 测试长文本提取（需要 API Key）
    // await testLongTextExtraction();

    console.log('\n🎉 所有测试通过！');
  } catch (error) {
    console.error('\n💥 测试失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runTests();
}
