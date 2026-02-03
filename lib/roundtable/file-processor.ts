import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getOpenAIClient } from '@/lib/openai';
import type OpenAI from 'openai';

export class FileProcessor {
  private openai: OpenAI | null = null;
  private uploadDir: string;

  constructor() {
    this.uploadDir = join(process.cwd(), 'public', 'uploads', 'roundtable');
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
   * 使用OpenAI Vision提取文本
   */
  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      const base64Image = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      const client = await this.getClient();
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `请提取这个文件中的所有文字内容。如果有表格，请转换为Markdown格式。如果有图表，请详细描述图表内容和数据。

要求：
1. 完整提取所有文字
2. 表格转换为Markdown table格式
3. 图表提供详细描述
4. 提取关键数据点
5. 保持原有结构和层次

输出格式：纯文本，直接输出提取的内容，不要额外说明。`,
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
        max_tokens: 4000,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Failed to extract text from file:', error);
      if (error instanceof Error) {
        // 提供更友好的错误信息
        if (error.message.includes('Connection error') || error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
          throw new Error('文件识别失败：网络连接错误。请检查网络连接、代理设置，或稍后重试');
        }
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          throw new Error('文件识别超时。文件可能过大，请尝试压缩文件或稍后重试');
        }
        throw new Error(`文件识别失败: ${error.message}`);
      }
      throw new Error('文件识别失败：未知错误');
    }
  }
}
