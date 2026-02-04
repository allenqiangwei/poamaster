// lib/insights/parser.ts

import { ParseResult } from './types';

export class FileParser {
  async parse(file: File): Promise<ParseResult> {
    const fileType = this.detectFileType(file);

    switch (fileType) {
      case 'txt':
        return this.parseTxt(file);
      case 'docx':
        return this.parseDocx(file);
      case 'pdf':
        return this.parsePdf(file);
      case 'image':
        return this.parseImage(file);
      default:
        throw new Error(`不支持的文件类型: ${file.type}`);
    }
  }

  private detectFileType(file: File): 'txt' | 'docx' | 'pdf' | 'image' {
    const type = file.type;

    if (type === 'text/plain') return 'txt';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'docx';
    }
    if (type === 'application/pdf') return 'pdf';
    if (type.startsWith('image/')) return 'image';

    throw new Error('不支持的文件类型');
  }

  private async parseTxt(file: File): Promise<ParseResult> {
    const text = await file.text();

    return {
      text,
      charCount: text.length,
      metadata: {
        fileType: 'txt',
        fileName: file.name
      }
    };
  }

  private async parseDocx(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 mammoth 解析 Word 文档
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      charCount: result.value.length,
      metadata: {
        fileType: 'docx',
        fileName: file.name
      }
    };
  }

  private async parsePdf(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // 使用 unpdf (serverless-friendly)
    const { extractText, getDocumentProxy, renderPageAsImage } = await import('unpdf');
    const pdf = await getDocumentProxy(buffer);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    // 如果提取的文本为空，说明是图片型 PDF，使用 OCR
    if (!text || text.trim().length === 0) {
      console.log('[Parser] PDF has no embedded text, using OCR for', totalPages, 'pages');
      const ocrText = await this.performPdfOcr(pdf, totalPages, file.name);

      return {
        text: ocrText,
        charCount: ocrText.length,
        pageCount: totalPages,
        metadata: {
          fileType: 'pdf',
          fileName: file.name,
          ocrUsed: true
        }
      };
    }

    return {
      text,
      charCount: text.length,
      pageCount: totalPages,
      metadata: {
        fileType: 'pdf',
        fileName: file.name
      }
    };
  }

  private async performPdfOcr(pdf: any, totalPages: number, fileName: string): Promise<string> {
    const { renderPageAsImage } = await import('unpdf');
    const { getOpenAIClient } = await import('@/lib/openai');
    const client = await getOpenAIClient();

    const pageTexts: string[] = [];

    // 限制最多处理前 10 页（避免成本过高）
    const pagesToProcess = Math.min(totalPages, 10);

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        console.log(`[Parser] OCR processing page ${pageNum}/${pagesToProcess}`);

        // 渲染页面为图片（unpdf 返回 PNG Buffer）
        const imageBuffer = await renderPageAsImage(pdf, pageNum, { canvas: null });

        // 确保是 Buffer 类型
        const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;

        // 使用 GPT-4 Vision API 提取文本
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `请仔细提取这个 PDF 页面中的所有文本内容。这是 ${fileName} 的第 ${pageNum} 页。

要求：
- 提取所有可见文字，保持原始格式和段落
- 如果是表格，保持表格结构
- 如果是列表，保持列表格式
- 不要添加解释或总结，只提取原始文字`
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

        const pageText = response.choices[0]?.message?.content || '';
        if (pageText.trim().length > 0) {
          pageTexts.push(`\n--- 第 ${pageNum} 页 ---\n${pageText}`);
        }
      } catch (error) {
        console.error(`[Parser] OCR failed for page ${pageNum}:`, error);
        pageTexts.push(`\n--- 第 ${pageNum} 页 ---\n[OCR 识别失败]`);
      }
    }

    if (totalPages > pagesToProcess) {
      pageTexts.push(`\n\n[注：PDF 共 ${totalPages} 页，已处理前 ${pagesToProcess} 页]`);
    }

    return pageTexts.join('\n');
  }

  private async parseImage(file: File): Promise<ParseResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${file.type};base64,${base64Image}`;

      // 使用 GPT-4 Vision API 提取图片中的文本
      const { getOpenAIClient, getOpenAIModel } = await import('@/lib/openai');
      const client = await getOpenAIClient();
      const model = await getOpenAIModel();
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `# 任务：OCR文本提取

请仔细分析这张图片，提取其中的所有文本内容。这是一段对话记录的截图。

## 提取要求：

1. **完整性**：提取图片中的每一个字符，包括：
   - 对话内容（消息文本）
   - 用户名/昵称
   - 时间戳
   - 系统提示
   - 表情符号和特殊字符

2. **格式保持**：
   - 保持原始的段落结构
   - 保持对话的顺序（从上到下，从左到右）
   - 用空行分隔不同的消息
   - 保持缩进和对齐关系

3. **对话结构**：
   - 如果能识别出发言人，用 [用户名] 标注
   - 如果有时间信息，保留时间信息
   - 保持对话的上下文关系

4. **处理原则**：
   - 逐行仔细扫描，不遗漏任何文字
   - 如果文字模糊但可以推断，标注 [可能是：XX]
   - 如果完全无法识别，标注 [无法识别的文字]
   - 保持原文语言（中文/英文等）

5. **特殊注意**：
   - 仔细识别小字、淡色字、背景文字
   - 注意截图边缘可能被裁切的文字
   - 识别可能的表情符号、emoji
   - 不要添加不存在的内容，不要总结或概括

请开始提取：`
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high' // 使用高细节模式以获得更好的文字识别
                }
              }
            ]
          }
        ],
        max_completion_tokens: 4096
      });

      const text = response.choices[0]?.message?.content || '';

      if (!text || text.trim().length === 0) {
        throw new Error('图片中未识别到文本内容');
      }

      return {
        text,
        charCount: text.length,
        metadata: {
          fileType: 'image',
          fileName: file.name
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        // 提供更友好的错误信息
        if (error.message.includes('Connection error') || error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
          throw new Error('图片识别失败：网络连接错误。请检查网络连接、代理设置，或稍后重试');
        }
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          throw new Error('图片识别超时。图片可能过大，请尝试压缩图片或稍后重试');
        }
        throw error; // 其他错误直接抛出
      }
      throw new Error('图片识别失败：未知错误');
    }
  }

  async parseFromPath(filePath: string): Promise<ParseResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      const text = buffer.toString('utf-8');
      return {
        text,
        charCount: text.length,
        metadata: {
          fileType: 'txt',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        charCount: result.value.length,
        metadata: {
          fileType: 'docx',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const uint8Buffer = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(uint8Buffer);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });

      // 如果提取的文本为空，说明是图片型 PDF，使用 OCR
      if (!text || text.trim().length === 0) {
        console.log('[Parser] PDF has no embedded text, using OCR for', totalPages, 'pages');
        const ocrText = await this.performPdfOcr(pdf, totalPages, path.basename(filePath));

        return {
          text: ocrText,
          charCount: ocrText.length,
          pageCount: totalPages,
          metadata: {
            fileType: 'pdf',
            fileName: path.basename(filePath),
            ocrUsed: true
          }
        };
      }

      return {
        text,
        charCount: text.length,
        pageCount: totalPages,
        metadata: {
          fileType: 'pdf',
          fileName: path.basename(filePath)
        }
      };
    }

    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      try {
        const base64Image = buffer.toString('base64');
        const mimeType = ext === '.png' ? 'image/png' :
                         ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        // 使用 GPT-4 Vision API 提取图片中的文本
        const { getOpenAIClient, getOpenAIModel } = await import('@/lib/openai');
        const client = await getOpenAIClient();
        const model = await getOpenAIModel();
        const response = await client.chat.completions.create({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `# 任务：OCR文本提取

请仔细分析这张图片，提取其中的所有文本内容。这是一段对话记录的截图。

## 提取要求：

1. **完整性**：提取图片中的每一个字符，包括：
   - 对话内容（消息文本）
   - 用户名/昵称
   - 时间戳
   - 系统提示
   - 表情符号和特殊字符

2. **格式保持**：
   - 保持原始的段落结构
   - 保持对话的顺序（从上到下，从左到右）
   - 用空行分隔不同的消息
   - 保持缩进和对齐关系

3. **对话结构**：
   - 如果能识别出发言人，用 [用户名] 标注
   - 如果有时间信息，保留时间信息
   - 保持对话的上下文关系

4. **处理原则**：
   - 逐行仔细扫描，不遗漏任何文字
   - 如果文字模糊但可以推断，标注 [可能是：XX]
   - 如果完全无法识别，标注 [无法识别的文字]
   - 保持原文语言（中文/英文等）

5. **特殊注意**：
   - 仔细识别小字、淡色字、背景文字
   - 注意截图边缘可能被裁切的文字
   - 识别可能的表情符号、emoji
   - 不要添加不存在的内容，不要总结或概括

请开始提取：`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high' // 使用高细节模式以获得更好的文字识别
                  }
                }
              ]
            }
          ],
          max_completion_tokens: 4096
        });

        const text = response.choices[0]?.message?.content || '';

        if (!text || text.trim().length === 0) {
          throw new Error('图片中未识别到文本内容');
        }

        return {
          text,
          charCount: text.length,
          metadata: {
            fileType: 'image',
            fileName: path.basename(filePath)
          }
        };
      } catch (error) {
        if (error instanceof Error) {
          // 提供更友好的错误信息
          if (error.message.includes('Connection error') || error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
            throw new Error('图片识别失败：网络连接错误。请检查网络连接、代理设置，或稍后重试');
          }
          if (error.message.includes('timeout') || error.message.includes('timed out')) {
            throw new Error('图片识别超时。图片可能过大，请尝试压缩图片或稍后重试');
          }
          throw error; // 其他错误直接抛出
        }
        throw new Error('图片识别失败：未知错误');
      }
    }

    throw new Error(`不支持的文件扩展名: ${ext}`);
  }
}
