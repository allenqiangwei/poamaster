import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { extractTasksFromText, getOpenAIClient } from '@/lib/openai';

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

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传文件' },
        { status: 400 }
      );
    }

    const fileType = file.type;
    let extractedText = '';

    // 根据文件类型提取文本
    if (fileType === 'application/pdf') {
      // 处理 PDF 文件
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 动态导入 pdf-parse
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      extractedText = textResult.text;
      await parser.destroy();

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
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请仔细阅读这张图片中的所有文本内容，并完整地提取出来。保持原始格式和段落结构。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 4096
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
    const tasks = await extractTasksFromText(extractedText);

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
