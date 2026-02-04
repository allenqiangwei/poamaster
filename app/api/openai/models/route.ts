import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';

// 检查是否为聊天模型
// 策略：包含而不是排除，只排除明确不支持聊天的模型类型
function isChatModel(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase();

  // 排除明确不支持聊天的模型类型
  const excludePatterns = [
    'whisper',        // 语音识别
    'tts',           // 文本转语音
    'dall-e',        // 图像生成
    'embedding',     // 嵌入模型
    'davinci',       // 旧版补全模型（非聊天）
    'curie',         // 旧版补全模型
    'babbage',       // 旧版补全模型
    'ada',           // 旧版补全模型
    'text-',         // text-* 开头的通常是补全模型
    'code-',         // code-* 开头的代码补全模型
  ];

  // 如果匹配任何排除模式，不是聊天模型
  if (excludePatterns.some(pattern => lowerModelId.includes(pattern))) {
    return false;
  }

  // 包含这些关键词的通常是聊天模型
  const includePatterns = [
    'gpt-',          // GPT 系列（包括 gpt-3.5, gpt-4, gpt-5 等）
    'chatgpt',       // ChatGPT 系列
    'o1-',           // o1 系列推理模型
  ];

  // 如果匹配任何包含模式，是聊天模型
  return includePatterns.some(pattern => lowerModelId.includes(pattern));
}

export async function GET(request: NextRequest) {
  try {
    const client = await getOpenAIClient();
    const response = await client.models.list();

    // 过滤出支持聊天的 GPT 模型并按名称排序
    const chatModels = response.data
      .filter(model => isChatModel(model.id))
      .sort((a, b) => {
        // 优先显示 gpt-4o 系列
        if (a.id.startsWith('gpt-4o') && !b.id.startsWith('gpt-4o')) return -1;
        if (!a.id.startsWith('gpt-4o') && b.id.startsWith('gpt-4o')) return 1;
        return b.id.localeCompare(a.id);
      })
      .map(model => ({
        id: model.id,
        created: model.created,
        ownedBy: model.owned_by
      }));

    return NextResponse.json({ models: chatModels });
  } catch (error) {
    console.error('Failed to fetch OpenAI models:', error);

    // 如果 API 失败，返回常用聊天模型列表
    const fallbackModels = [
      { id: 'gpt-4o', created: 0, ownedBy: 'openai' },
      { id: 'gpt-4o-mini', created: 0, ownedBy: 'openai' },
      { id: 'gpt-4-turbo', created: 0, ownedBy: 'openai' },
      { id: 'gpt-4', created: 0, ownedBy: 'openai' },
      { id: 'gpt-3.5-turbo', created: 0, ownedBy: 'openai' },
    ];

    return NextResponse.json({
      models: fallbackModels,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
