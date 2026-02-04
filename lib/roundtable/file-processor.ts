import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getOpenAIClient } from '@/lib/openai';
import type OpenAI from 'openai';
import { SmartOCR } from '@/lib/ocr/smart-ocr';

export class FileProcessor {
  private openai: OpenAI | null = null;
  private uploadDir: string;
  private smartOCR: SmartOCR;

  constructor() {
    this.uploadDir = join(process.cwd(), 'public', 'uploads', 'roundtable');
    this.smartOCR = new SmartOCR();
  }

  private async getClient(): Promise<OpenAI> {
    if (!this.openai) {
      this.openai = await getOpenAIClient();
    }
    return this.openai;
  }

  /**
   * 处理上传的文件
   */
  async processFile(file: File, discussionId: string): Promise<{
    filepath: string;
    filename: string;
    filetype: string;
    filesize: number;
    extractedText: string;
  }> {
    // 创建讨论专属目录
    const discussionDir = join(this.uploadDir, discussionId);
    await mkdir(discussionDir, { recursive: true });

    // 生成唯一文件名
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const uniqueFilename = `${randomUUID()}.${ext}`;
    const filepath = join(discussionDir, uniqueFilename);

    // 保存文件
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // OCR处理
    const extractedText = await this.extractText(buffer, file.type);

    return {
      filepath: filepath.replace(process.cwd() + '/public', ''),
      filename: file.name,
      filetype: ext,
      filesize: buffer.length,
      extractedText,
    };
  }

  /**
   * 提取文本（根据文件类型选择不同的方法）
   */
  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    // PDF 文件：使用 unpdf 提取文本，如果是图片型 PDF 则使用 OCR
    if (mimeType === 'application/pdf') {
      return this.extractTextFromPdf(buffer);
    }

    // 图片文件：使用 Vision API
    if (mimeType.startsWith('image/')) {
      return this.extractTextFromImage(buffer, mimeType);
    }

    // 其他文件类型
    throw new Error(`不支持的文件类型: ${mimeType}。当前仅支持图片和PDF格式`);
  }

  /**
   * 从 PDF 提取文本
   */
  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      const { extractText, getDocumentProxy, renderPageAsImage } = await import('unpdf');
      const uint8Buffer = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(uint8Buffer);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });

      // 如果提取的文本为空，说明是图片型 PDF，使用 OCR
      if (!text || text.trim().length === 0) {
        console.log('[FileProcessor] PDF has no embedded text, using OCR for', totalPages, 'pages');
        return await this.performPdfOcr(pdf, totalPages);
      }

      console.log('[FileProcessor] Successfully extracted text from PDF:', text.length, 'characters');
      return text;
    } catch (error) {
      console.error('[FileProcessor] Failed to extract text from PDF:', error);
      throw new Error('PDF 文本提取失败。请确保 PDF 文件有效，或尝试将其转换为图片格式');
    }
  }

  /**
   * 使用 OCR 处理图片型 PDF
   */
  private async performPdfOcr(pdf: any, totalPages: number): Promise<string> {
    const { renderPageAsImage } = await import('unpdf');
    const client = await this.getClient();

    const pageTexts: string[] = [];

    // 限制最多处理前 10 页（避免成本过高和超时）
    const pagesToProcess = Math.min(totalPages, 10);

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        console.log(`[FileProcessor] OCR processing page ${pageNum}/${pagesToProcess}`);

        // 渲染页面为图片
        const imageBuffer = await renderPageAsImage(pdf, pageNum);

        // 确保是 Buffer 类型
        const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
        const base64Image = buffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;

        // 使用 GPT-4 Vision API 提取文本和图像信息
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `请仔细分析这个 PDF 页面（第 ${pageNum} 页），提取所有文本内容和图像信息。

# 文字提取要求：
1. 提取所有可见文字，保持原始格式和段落
2. 保持标题、段落、列表的层次结构
3. 如果有表格，使用 Markdown 表格格式
4. 保持数字、百分比、日期等关键数据的准确性

# 图像解读要求（关键）：
如果页面中包含图片、图表、图形，请详细描述：

**图表类（柱状图、折线图、饼图等）**：
- 图表类型和主题
- 坐标轴含义和单位
- 关键数据点和数值
- 趋势和对比关系
- 重要结论或异常值

**流程图/架构图**：
- 整体结构和流程方向
- 各个节点/模块的名称和关系
- 关键连接和依赖关系

**照片/截图**：
- 图片主题和内容
- 重要的文字或标注
- 图片想要传达的信息

**其他视觉元素**：
- 标注、箭头、高亮等关键提示
- 颜色编码的含义（如有）

# 输出格式：
1. 先输出页面的文字内容
2. 如果有图像，用【图像说明】标记：

例如：
文字内容...

【图像说明：销售趋势图】
- 图表类型：折线图
- X轴：2023年1-12月
- Y轴：销售额（万元）
- 关键数据：1月500万，6月峰值800万，12月回落至600万
- 趋势：上半年持续增长，下半年波动下降
- 备注：6月有促销活动标注

不要添加无关的总结，只提取和描述实际内容。`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_completion_tokens: 4096,
        });

        const pageText = response.choices[0]?.message?.content || '';
        if (pageText.trim().length > 0) {
          pageTexts.push(`\n--- 第 ${pageNum} 页 ---\n${pageText}`);
        }
      } catch (error) {
        console.error(`[FileProcessor] OCR failed for page ${pageNum}:`, error);
        pageTexts.push(`\n--- 第 ${pageNum} 页 ---\n[OCR 识别失败]`);
      }
    }

    if (totalPages > pagesToProcess) {
      pageTexts.push(`\n\n[注：PDF 共 ${totalPages} 页，已处理前 ${pagesToProcess} 页]`);
    }

    return pageTexts.join('\n');
  }

  /**
   * 使用智能 OCR 从图片提取文本
   * 自动选择最佳识别方案（本地 PaddleOCR 或 GPT-4 Vision）
   */
  private async extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      const result = await this.smartOCR.extractWithBestMethod(buffer, mimeType);

      console.log(`[FileProcessor] Image OCR completed using ${result.method}`);
      if (result.hasCharts) {
        console.log('[FileProcessor] Image contains charts, used hybrid approach');
      }

      return result.text;
    } catch (error) {
      console.error('Failed to extract text from image:', error);
      if (error instanceof Error) {
        // 提供更友好的错误信息
        if (error.message.includes('Connection error') || error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
          throw new Error('图片识别失败：网络连接错误。请检查网络连接、代理设置，或稍后重试');
        }
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          throw new Error('图片识别超时。图片可能过大，请尝试压缩图片或稍后重试');
        }
        throw new Error(`图片识别失败: ${error.message}`);
      }
      throw new Error('图片识别失败：未知错误');
    }
  }
}
