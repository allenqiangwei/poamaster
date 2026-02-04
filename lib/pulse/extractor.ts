import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import { EntryDimension, ReportType } from '@prisma/client';
import { AIExtractionResult, AICandidate } from './types';
import { DIMENSION_LABELS } from './constants';

const SYSTEM_PROMPT = `你是一个专业的项目状态分析助手。你的任务是从周报/日报中提取关键信息，归类到 12 个维度。

## 输出要求
1. 每条必须有【原文证据】- 从报告中摘录的原文（限 200 字内）
2. 不要编造 - 报告未提及的信息不得推断为事实
3. 同维度去冗余 - 高度相似的表述合并为一条，但保留所有证据

## 12 个维度定义
1. OVERALL_HEALTH: 总体健康度 - 项目整体状态的判断性描述
2. SCHEDULE: 进度与里程碑 - 时间节点、延期、提前等
3. SCOPE: 交付物与范围 - 需求变更、范围蔓延、交付物调整
4. RISKS: 风险 - 可能发生的负面事件
5. BLOCKERS: 问题与阻塞 - 已经发生、正在阻碍进展的问题
6. DEPENDENCIES: 依赖 - 对外部团队/资源的依赖
7. QUALITY: 质量 - Bug、稳定性、技术债务
8. RESOURCING: 资源 - 人力、产能、招聘
9. DECISIONS: 决策 - 需要上级拍板或支持的事项
10. KPI: 指标 - 数据、目标达成情况
11. PLAN_CREDIBILITY: 计划可信度 - 计划是否靠谱的判断
12. ALIGNMENT: 对齐风险 - 沟通、理解偏差、干系人问题

## 输出格式 (JSON)
{
  "candidates": [
    {
      "dimension": "RISKS",
      "title": "一句话标题（简洁明了）",
      "evidence_quote": "报告原文摘录（限200字）",
      "confidence": 0.9
    }
  ],
  "empty_dimensions": ["KPI", "QUALITY"],
  "warnings": ["报告未提及里程碑时间节点"]
}

请只输出 JSON，不要有其他文字。`;

export async function extractFromReport(
  parsedText: string,
  projectName: string,
  reportType: ReportType,
  reportDate: string,
  fileName: string,
  model?: string
): Promise<AIExtractionResult> {
  const openai = await getOpenAIClient();
  const modelToUse = model || await getOpenAIModel();

  const userPrompt = `## 报告信息
- 项目: ${projectName}
- 类型: ${reportType === 'DAILY' ? '日报' : reportType === 'WEEKLY' ? '周报' : '其他'}
- 日期: ${reportDate}
- 文件: ${fileName}

## 报告全文
${parsedText.slice(0, 30000)}

请提取项目状态条目。`;

  try {
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as AIExtractionResult;

    const validDimensions = Object.keys(DIMENSION_LABELS);
    result.candidates = (result.candidates || []).filter((c: AICandidate) =>
      validDimensions.includes(c.dimension as string) &&
      c.title &&
      c.evidence_quote
    );

    result.empty_dimensions = result.empty_dimensions || [];
    result.warnings = result.warnings || [];

    return result;
  } catch (error) {
    console.error('AI extraction failed:', error);
    throw error;
  }
}
