import { NextRequest, NextResponse } from 'next/server';
import { extractTasksFromText } from '@/lib/openai';

/**
 * POST /api/tasks/extract
 * 从文本中提取任务
 *
 * Request Body:
 * {
 *   text: string  // 用户输入的文本
 * }
 *
 * Response:
 * {
 *   tasks: Array<{
 *     title: string,
 *     assignee: string | null,
 *     dueDate: string | null,  // ISO 8601 format: YYYY-MM-DD
 *     dod: string | null
 *   }>
 * }
 *
 * Error Response:
 * {
 *   error: string,
 *   details?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { text } = body;

    // 验证输入
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的文本内容' },
        { status: 400 }
      );
    }

    if (text.trim().length === 0) {
      return NextResponse.json(
        { error: '文本内容不能为空' },
        { status: 400 }
      );
    }

    // 检查文本长度（避免过长的输入）
    const maxLength = 50000; // 约50KB
    if (text.length > maxLength) {
      return NextResponse.json(
        { error: `文本内容过长，最多支持 ${maxLength} 个字符` },
        { status: 400 }
      );
    }

    // 检查 OpenAI API Key 是否配置
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: 'OpenAI API Key 未配置',
          details: '请在环境变量中设置 OPENAI_API_KEY',
        },
        { status: 500 }
      );
    }

    // 调用 OpenAI 提取任务
    const tasks = await extractTasksFromText(text);

    // 返回提取的任务
    return NextResponse.json({
      tasks,
    });

  } catch (error) {
    console.error('任务提取错误:', error);

    // 处理特定错误类型
    if (error instanceof Error) {
      // OpenAI API 错误
      if (error.message.includes('API key')) {
        return NextResponse.json(
          {
            error: 'OpenAI API Key 无效',
            details: '请检查环境变量中的 OPENAI_API_KEY 是否正确',
          },
          { status: 500 }
        );
      }

      // 配额或限流错误
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return NextResponse.json(
          {
            error: 'OpenAI API 配额不足或请求过于频繁',
            details: '请稍后再试或检查您的 OpenAI 账户配额',
          },
          { status: 429 }
        );
      }

      // 网络错误
      if (error.message.includes('network') || error.message.includes('timeout')) {
        return NextResponse.json(
          {
            error: '网络连接错误',
            details: '请检查网络连接或稍后再试',
          },
          { status: 503 }
        );
      }

      // 通用错误
      return NextResponse.json(
        {
          error: '任务提取失败',
          details: error.message,
        },
        { status: 500 }
      );
    }

    // 未知错误
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
