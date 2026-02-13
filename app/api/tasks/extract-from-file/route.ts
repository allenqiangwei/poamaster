import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { extractTasksFromText, extractTasksFromImage } from '@/lib/openai';

export const maxDuration = 120;

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
      // 处理 PDF 文件 - 使用 unpdf
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      extractedText = text;

      // 图片型 PDF（无嵌入文字）：使用 FileParser 的 OCR 流程
      if (!extractedText || extractedText.trim().length === 0) {
        console.log('[Task Extract] PDF has no embedded text, trying OCR...');
        const { FileParser } = await import('@/lib/insights/parser');
        const parser = new FileParser();

        // 保存到临时文件供 parser 使用
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        const tmpPath = path.join(os.tmpdir(), `task-extract-${Date.now()}.pdf`);
        await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));

        try {
          const parseResult = await parser.parseFromPath(tmpPath);
          extractedText = parseResult.text;
        } finally {
          await fs.unlink(tmpPath).catch(() => {});
        }

        if (!extractedText || extractedText.trim().length === 0) {
          return NextResponse.json(
            { success: false, error: 'PDF 文件为空或无法提取文本' },
            { status: 400 }
          );
        }
      }
    } else if (fileType.startsWith('image/')) {
      // 处理图片文件 - 单次 Vision 调用直接提取任务（合并 OCR + 任务提取，避免超时）
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log('[Task Extract] Using single Vision call for image task extraction');
      const result = await extractTasksFromImage(buffer, fileType, model || undefined);

      console.log('[Task Extract] Vision extraction found', result.tasks.length, 'tasks');

      return NextResponse.json({
        success: true,
        tasks: result.tasks,
        extractedText: result.extractedText,
      });
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
