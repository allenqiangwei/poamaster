import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

export class FileProcessor {
  private openai: OpenAI;
  private uploadDir: string;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
    this.uploadDir = join(process.cwd(), 'public', 'uploads', 'roundtable');
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
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await this.openai.chat.completions.create({
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
              },
            },
          ],
        },
      ],
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content || '';
  }
}
