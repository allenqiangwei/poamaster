import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { material } = await request.json();

    if (!material) {
      return NextResponse.json(
        { error: 'Material is required' },
        { status: 400 }
      );
    }

    // 获取所有启用的模板
    const templates = await prisma.roundtableTemplate.findMany({
      where: { enabled: true },
      orderBy: { priority: 'desc' },
    });

    // 获取OpenAI API Key
    const apiKeyConfig = await prisma.config.findUnique({
      where: { key: 'openai_api_key' },
    });

    if (!apiKeyConfig) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: apiKeyConfig.value });

    // 使用AI选择最合适的模板
    const prompt = `根据以下材料，从给定的模板列表中选择最合适的讨论模板。

材料内容：
${material.substring(0, 1000)}

可选模板：
${templates.map((t, i) => `${i + 1}. ${t.name}：${t.description}\n   关键词：${(t.keywords as string[]).join('、')}`).join('\n\n')}

请分析材料内容，选择最合适的模板。输出JSON格式：
{
  "templateId": "选中的模板ID",
  "templateName": "模板名称",
  "confidence": "high/medium/low",
  "reasoning": "选择理由（一句话）"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');

    // 查找对应的模板
    const selectedTemplate = templates.find(t => t.id === result.templateId);

    return NextResponse.json({
      template: selectedTemplate,
      confidence: result.confidence,
      reasoning: result.reasoning,
    });
  } catch (error) {
    console.error('Failed to auto-select template:', error);
    return NextResponse.json(
      { error: 'Failed to auto-select template' },
      { status: 500 }
    );
  }
}
