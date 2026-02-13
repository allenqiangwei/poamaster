// lib/insights/parser.ts

import { ParseResult } from './types';
import { SmartOCR } from '@/lib/ocr/smart-ocr';

export class FileParser {
  private smartOCR: SmartOCR;

  constructor() {
    this.smartOCR = new SmartOCR();
  }
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
          fileName: file.name
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

  private async performPdfOcr(
    pdf: any,
    totalPages: number,
    fileName: string,
    selectedPages?: number[]
  ): Promise<string> {
    const { renderPageAsImage } = await import('unpdf');
    const { getOpenAIClient } = await import('@/lib/openai');
    const client = await getOpenAIClient();

    const pageTexts: string[] = [];

    // 如果指定了页码则只处理选中页，否则限制前 10 页
    const pagesToProcess = selectedPages
      ? selectedPages.filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
      : Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1);

    for (const pageNum of pagesToProcess) {
      try {
        console.log(`[Parser] OCR processing page ${pageNum} (${pagesToProcess.indexOf(pageNum) + 1}/${pagesToProcess.length})`);

        // 渲染页面为图片（unpdf 返回 PNG Buffer）
        const imageBuffer = await renderPageAsImage(pdf, pageNum, { } as any);

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

    if (!selectedPages && totalPages > pagesToProcess.length) {
      pageTexts.push(`\n\n[注：PDF 共 ${totalPages} 页，已处理前 ${pagesToProcess.length} 页]`);
    }

    return pageTexts.join('\n');
  }

  private async parseImage(file: File): Promise<ParseResult> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 使用智能 OCR 自动选择最佳识别方案
      console.log('[Parser] Processing image with SmartOCR...');
      const result = await this.smartOCR.extractWithBestMethod(buffer, file.type);

      console.log(`[Parser] Image OCR completed using ${result.method}`);
      if (result.hasCharts) {
        console.log('[Parser] Image contains charts');
      }

      const text = result.text;

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

  async getPdfPageCount(filePath: string): Promise<number> {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath);
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    return pdf.numPages;
  }

  async parseFromPath(filePath: string, selectedPages?: number[]): Promise<ParseResult> {
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
        const ocrText = await this.performPdfOcr(pdf, totalPages, path.basename(filePath), selectedPages);

        return {
          text: ocrText,
          charCount: ocrText.length,
          pageCount: totalPages,
          metadata: {
            fileType: 'pdf',
            fileName: path.basename(filePath),
          }
        };
      }

      // 如果指定了页码，逐页提取并只拼接选中页
      if (selectedPages && selectedPages.length > 0) {
        const { extractText: extractPerPage } = await import('unpdf');
        const perPageResult = await extractPerPage(pdf, { mergePages: false });
        const pages = perPageResult.text as unknown as string[];

        const filteredTexts: string[] = [];
        for (const pageNum of selectedPages.sort((a, b) => a - b)) {
          if (pageNum >= 1 && pageNum <= totalPages && pages[pageNum - 1]) {
            filteredTexts.push(pages[pageNum - 1]);
          }
        }
        const filteredText = filteredTexts.join('\n');

        return {
          text: filteredText,
          charCount: filteredText.length,
          pageCount: totalPages,
          metadata: {
            fileType: 'pdf',
            fileName: path.basename(filePath),
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
      const mimeType = ext === '.png' ? 'image/png' :
                       ext === '.webp' ? 'image/webp' : 'image/jpeg';

      // 使用 SmartOCR 统一处理图片（与 parse() 方法一致）
      console.log('[Parser] Processing image with SmartOCR...');
      const result = await this.smartOCR.extractWithBestMethod(buffer, mimeType);
      console.log(`[Parser] Image OCR completed using ${result.method}`);

      const text = result.text;
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
    }

    throw new Error(`不支持的文件扩展名: ${ext}`);
  }
}
