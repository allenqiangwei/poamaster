import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';

// 检查是否为支持 Chat Completions API 的模型
// 基于 OpenAI 官方文档 (2026): https://platform.openai.com/docs/guides/migrate-to-responses
//
// 注意：某些模型（如 gpt-5.2-pro）仅在 Responses API 中可用，不支持 Chat Completions API
function isChatModel(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase();

  // 首先排除明确不支持聊天的模型类型
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

  if (excludePatterns.some(pattern => lowerModelId.includes(pattern))) {
    return false;
  }

  // 排除仅限 Responses API 的模型（如 gpt-5.2-pro）
  // 这些模型不支持 Chat Completions API
  if (lowerModelId.endsWith('-pro')) {
    return false;
  }

  // 支持 Chat Completions API 的模型模式
  // 基于 OpenAI 2026 官方文档
  const chatModelPatterns = [
    // GPT-4 系列
    /^gpt-4o/i,              // gpt-4o, gpt-4o-mini 等
    /^gpt-4\.1/i,            // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
    /^gpt-4-turbo/i,         // gpt-4-turbo
    /^gpt-4-\d{4}/i,         // gpt-4-0125-preview 等带日期的版本
    /^gpt-4$/i,              // gpt-4 基础版本

    // GPT-3.5 系列
    /^gpt-3\.5-turbo/i,      // gpt-3.5-turbo 系列

    // GPT-5 系列 (仅非 -pro 变体)
    /^gpt-5\.2$/i,           // gpt-5.2 (Thinking, 不是 Pro)
    /^gpt-5\.1/i,            // gpt-5.1 系列
    /^gpt-5$/i,              // gpt-5 基础版本

    // ChatGPT 系列
    /^chatgpt/i,             // ChatGPT 系列

    // O 系列推理模型 (仅非 -pro 变体)
    /^o1-/i,                 // o1 系列
    /^o3$/i,                 // o3 (不包括 o3-pro)
    /^o3-mini/i,             // o3-mini
    /^o4-mini$/i,            // o4-mini (不包括 o4-mini-pro)
  ];

  // 检查是否匹配任何支持 Chat Completions 的模型模式
  return chatModelPatterns.some(pattern => pattern.test(modelId));
}

export async function GET(request: NextRequest) {
  try {
    const client = await getOpenAIClient();
    const response = await client.models.list();

    console.log('[Models API] 从 OpenAI 获取到', response.data.length, '个模型');

    // 过滤出支持聊天的 GPT 模型并按名称排序
    const allModels = response.data;
    const chatModels = allModels.filter(model => isChatModel(model.id));
    const excludedModels = allModels.filter(model => !isChatModel(model.id));

    console.log('[Models API] 支持 Chat Completions 的模型:', chatModels.length);
    console.log('[Models API] 已排除的模型:', excludedModels.length);

    // 记录前几个排除的模型用于调试
    if (excludedModels.length > 0) {
      console.log('[Models API] 排除的模型示例:', excludedModels.slice(0, 5).map(m => m.id).join(', '));
    }

    const sortedChatModels = chatModels
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

    return NextResponse.json({ models: sortedChatModels });
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
