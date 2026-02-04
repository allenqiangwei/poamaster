import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { extractTasksFromText, getOpenAIClient, getOpenAIModel } from '@/lib/openai';

/**
 * POST /api/tasks/extract-from-file
 * 从上传的文件（PDF 或图片）中提取任务
 */
export async function POST(request: NextRequest) {
  try {
    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const model = formData.get('model') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    const fileType = file.type;
    let extractedText = '';

    // 根据文件类型提取文本
    if (fileType === 'text/plain') {
      // 处理 TXT 文件 - 直接读取文本内容
      extractedText = await file.text();

      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'TXT 文件为空' },
          { status: 400 }
        );
      }
    } else if (fileType === 'application/pdf') {
      // 处理 PDF 文件 - 使用 unpdf (serverless-friendly)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // 动态导入 unpdf
      const { extractText, getDocumentProxy } = await import('unpdf');

      // 提取 PDF 文本
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      extractedText = text;

      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'PDF 文件为空或无法提取文本' },
          { status: 400 }
        );
      }
    } else if (fileType.startsWith('image/')) {
      // 处理图片文件 - 使用 OpenAI Vision API
      const arrayBuffer = await file.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${fileType};base64,${base64Image}`;

      const client = await getOpenAIClient();
      const visionModel = model || await getOpenAIModel();
      const response = await client.chat.completions.create({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `# 任务：OCR 文本提取

请提取这张图片中的所有文本内容。这是任务管理相关的截图或文档。

## 提取要求：

1. **完整性**：提取图片中的每一个字符，包括：
   - 任务标题和描述
   - 时间、日期信息
   - 负责人信息
   - 所有可见文字

2. **格式保持**：
   - 保持原始的段落结构
   - 保持文本的顺序（从上到下，从左到右）
   - 用空行分隔不同的段落或条目

3. **处理原则**：
   - 逐行仔细扫描，不遗漏任何文字
   - 保持原文语言（中文/英文等）
   - 不要添加不存在的内容
   - 不要总结或概括，只提取原始文字

请开始提取：`
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_completion_tokens: 4096
      });

      extractedText = response.choices[0]?.message?.content || '';

      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: '图片中未识别到文本内容' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: '不支持的文件格式' },
        { status: 400 }
      );
    }

    // 使用提取的文本提取任务
    console.log('[Task Extract] Extracted text length:', extractedText.length);
    console.log('[Task Extract] Text preview:', extractedText.substring(0, 500));

    const tasks = await extractTasksFromText(extractedText, model || undefined);

    console.log('[Task Extract] Tasks found:', tasks.length);
    if (tasks.length === 0) {
      console.log('[Task Extract] No tasks identified from text');
    }

    return NextResponse.json({
      success: true,
      tasks,
      extractedText: extractedText.substring(0, 1000) // 返回部分文本供调试
    });
  } catch (error) {
    console.error('Extract from file error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: '文件处理失败' },
      { status: 500 }
    );
  }
}
