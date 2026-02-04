import { PaddleOCR } from './paddle-ocr';
import { getOpenAIClient } from '@/lib/openai';

/**
 * 智能 OCR 路由器
 * 根据内容自动选择最佳识别方案：
 * - 纯文字：使用 PaddleOCR（快速、免费、高精度）
 * - 包含图表：使用 GPT-4 Vision（深度理解）
 */
export class SmartOCR {
  private paddleOCR: PaddleOCR;
  private useLocal: boolean;

  constructor() {
    this.paddleOCR = new PaddleOCR();
    this.useLocal = process.env.USE_LOCAL_OCR === 'true';
  }

  /**
   * 智能 OCR：自动选择最佳方案
   * @returns 包含识别文字、使用的方法、是否包含图表
   */
  async extractWithBestMethod(
    buffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; method: string; hasCharts: boolean }> {

    // 如果未启用本地 OCR，直接使用 GPT-4 Vision
    if (!this.useLocal) {
      console.log('[SmartOCR] Local OCR disabled, using GPT-4 Vision');
      const text = await this.extractWithVision(buffer, mimeType);
      return {
        text,
        method: 'gpt4-vision',
        hasCharts: false
      };
    }

    // 检查 PaddleOCR 是否可用
    const isAvailable = await this.paddleOCR.isAvailable();
    if (!isAvailable) {
      console.log('[SmartOCR] PaddleOCR not available, falling back to GPT-4 Vision');
      const text = await this.extractWithVision(buffer, mimeType);
      return {
        text,
        method: 'gpt4-vision-fallback',
        hasCharts: false
      };
    }

    try {
      // 第一步：使用 PaddleOCR 快速提取文字
      console.log('[SmartOCR] Extracting text with PaddleOCR...');
      const ocrText = await this.paddleOCR.extractText(buffer, mimeType);
      console.log('[SmartOCR] PaddleOCR extracted', ocrText.length, 'characters');

      // 第二步：检测是否包含图表
      const hasCharts = await this.detectCharts(buffer, ocrText);
      console.log('[SmartOCR] Chart detection:', hasCharts ? 'yes' : 'no');

      if (!hasCharts) {
        // 纯文字内容，直接返回 OCR 结果
        return {
          text: ocrText,
          method: 'paddleocr',
          hasCharts: false
        };
      }

      // 第三步：有图表时，使用 GPT-4V 进行深度分析
      console.log('[SmartOCR] Image contains charts, using GPT-4 Vision for analysis...');
      const chartAnalysis = await this.analyzeChartsWithVision(buffer, mimeType, ocrText);

      return {
        text: `${ocrText}\n\n${chartAnalysis}`,
        method: 'hybrid',
        hasCharts: true
      };
    } catch (error) {
      // PaddleOCR 失败时，回退到 GPT-4 Vision
      console.warn('[SmartOCR] PaddleOCR failed, falling back to GPT-4 Vision:', error);
      const text = await this.extractWithVision(buffer, mimeType);
      return {
        text,
        method: 'gpt4-vision-fallback',
        hasCharts: false
      };
    }
  }

  /**
   * 检测是否包含图表（启发式方法）
   */
  private async detectCharts(buffer: Buffer, ocrText: string): Promise<boolean> {
    // 方法1：检查文件大小
    // 图表通常需要较大的文件来保存颜色和图形信息
    const sizeThreshold = 50 * 1024; // 50KB
    if (buffer.length < sizeThreshold) {
      return false;
    }

    // 方法2：检查文字密度
    // 纯文字截图：文字密度高（每 KB 有较多字符）
    // 图表截图：文字密度低（主要是图形，文字少）
    const wordCount = ocrText.trim().split(/\s+/).filter(w => w.length > 0).length;
    const density = wordCount / (buffer.length / 1024); // 每 KB 字数

    // 如果文字密度低于阈值，可能包含大量图表
    // 中文对话截图通常 > 100 字/KB
    // 图表截图通常 < 30 字/KB
    const densityThreshold = 50;

    console.log('[SmartOCR] Text density:', density.toFixed(2), 'words/KB');
    return density < densityThreshold;
  }

  /**
   * 使用 GPT-4 Vision 分析图表
   * 仅分析视觉元素，不重复已识别的文字
   */
  private async analyzeChartsWithVision(
    buffer: Buffer,
    mimeType: string,
    existingText: string
  ): Promise<string> {
    const client = await getOpenAIClient();
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `图片中的文字已经识别完成：

${existingText}

现在请专注于分析图片中的图表、图形、流程图等视觉元素。
不要重复已识别的文字，只需描述视觉信息：

**如果有图表（柱状图、折线图、饼图等）**：
- 图表类型和主题
- 坐标轴含义和单位
- 关键数据点和数值
- 趋势和对比关系

**如果有流程图/架构图**：
- 整体结构和流程方向
- 各个节点/模块的名称
- 关键连接和依赖关系

**如果有其他视觉元素**：
- 标注、箭头、高亮
- 颜色编码的含义

用【图表分析】标记开始。如果没有明显的图表或图形，简单说明"无明显图表"即可。`
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' }
            }
          ]
        }
      ],
      max_completion_tokens: 2000
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * 纯 GPT-4 Vision 提取（作为后备方案）
   */
  private async extractWithVision(buffer: Buffer, mimeType: string): Promise<string> {
    const client = await getOpenAIClient();
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请提取这个图片中的所有文字内容。

要求：
1. 完整提取所有文字
2. 保持原有结构和格式
3. 如果有表格，转换为 Markdown 格式
4. 如果有图表，提供详细描述

直接输出提取的内容，不要额外说明。`
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' }
            }
          ]
        }
      ],
      max_completion_tokens: 4000
    });

    return response.choices[0]?.message?.content || '';
  }
}
