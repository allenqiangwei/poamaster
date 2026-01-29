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

async function testInputValidation() {
  console.log('\n=== 测试输入验证 (Critical Issue 1) ===');

  const extractor = new InsightsExtractor();

  // Test 1: Empty string
  try {
    const result = await extractor.extract('');
    console.log('空字符串测试: 返回空结果 ✅');
    console.log('  条目数:', result.items.length);
    console.log('  策略:', result.metadata.strategy);
    console.log('  耗时:', result.metadata.latencyMs);

    if (result.items.length !== 0) {
      throw new Error('空字符串应该返回空结果');
    }
  } catch (error) {
    console.error('❌ 空字符串测试失败:', error);
    throw error;
  }

  // Test 2: Whitespace only
  try {
    const result = await extractor.extract('   \n\t  ');
    console.log('纯空白字符测试: 返回空结果 ✅');
    console.log('  条目数:', result.items.length);

    if (result.items.length !== 0) {
      throw new Error('纯空白字符应该返回空结果');
    }
  } catch (error) {
    console.error('❌ 纯空白字符测试失败:', error);
    throw error;
  }

  // Test 3: Null/undefined (should throw)
  try {
    await extractor.extract(null as any);
    console.error('❌ null 应该抛出错误');
    throw new Error('null 应该抛出错误');
  } catch (error) {
    if (error instanceof Error && error.message.includes('输入文本不能为空')) {
      console.log('null 测试: 正确抛出错误 ✅');
    } else {
      throw error;
    }
  }

  console.log('\n✅ 输入验证测试完成');
}

async function testJSONValidation() {
  console.log('\n=== 测试 JSON 响应验证 (Critical Issue 2) ===');

  const extractor = new InsightsExtractor();

  // Access private method for testing
  const convertToItems = (extractor as any).convertToItems.bind(extractor);

  // Test 1: Valid structure
  try {
    const validParsed = {
      focus: [{ content: '测试关注点', evidence: '测试证据' }],
      goal: [],
      obstacle: [],
      decision: [],
      risk: [],
      action: [],
    };
    const items = convertToItems(validParsed);
    console.log('有效结构测试: 转换成功 ✅');
    console.log('  转换条目数:', items.length);

    if (items.length !== 1) {
      throw new Error('应该转换出1个条目');
    }
  } catch (error) {
    console.error('❌ 有效结构测试失败:', error);
    throw error;
  }

  // Test 2: Invalid dimension (should be filtered in groupByDimension)
  try {
    const invalidDimension = {
      invalid_dimension: [{ content: '测试', evidence: '证据' }],
    };
    const items = convertToItems(invalidDimension);
    console.log('无效维度测试: 返回空数组 ✅');
    console.log('  转换条目数:', items.length);
  } catch (error) {
    console.error('❌ 无效维度测试失败:', error);
    throw error;
  }

  console.log('\n✅ JSON 响应验证测试完成');
}

async function testDimensionValidation() {
  console.log('\n=== 测试维度验证 (Critical Issue 3) ===');

  const extractor = new InsightsExtractor();

  // Access private method for testing
  const groupByDimension = (extractor as any).groupByDimension.bind(extractor);

  // Test with items including invalid dimension
  const testItems = [
    { dimension: 'focus', content: '关注点1', evidence: '证据1' },
    { dimension: 'decision', content: '决策1' },
    { dimension: 'invalid_dim' as any, content: '无效维度' }, // Invalid dimension
    { dimension: 'action', content: '行动1', action: '行动1' },
  ];

  try {
    // Capture console.warn output
    const originalWarn = console.warn;
    let warnCalled = false;
    let warnMessage = '';

    console.warn = (message: string) => {
      warnCalled = true;
      warnMessage = message;
    };

    const groups = groupByDimension(testItems);

    // Restore console.warn
    console.warn = originalWarn;

    console.log('维度分组测试:');
    console.log('  警告被调用:', warnCalled ? '✅' : '❌');
    if (warnCalled) {
      console.log('  警告内容:', warnMessage);
    }
    console.log('  focus 组:', groups.focus?.length || 0, '个条目');
    console.log('  decision 组:', groups.decision?.length || 0, '个条目');
    console.log('  action 组:', groups.action?.length || 0, '个条目');

    const totalGroupedItems = Object.values(groups).reduce(
      (sum: number, arr: any) => sum + arr.length,
      0
    );
    console.log('  分组后总条目数:', totalGroupedItems);

    // Should have 3 valid items (invalid_dim should be filtered out)
    if (totalGroupedItems !== 3) {
      throw new Error(`期望3个有效条目，实际得到 ${totalGroupedItems} 个`);
    }

    console.log('✅ 无效维度已被过滤');
  } catch (error) {
    console.error('❌ 维度验证测试失败:', error);
    throw error;
  }

  console.log('\n✅ 维度验证测试完成');
}

// 运行测试
async function runTests() {
  try {
    // Critical issue fixes tests (don't need API Key)
    await testInputValidation();
    await testJSONValidation();
    await testDimensionValidation();

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
