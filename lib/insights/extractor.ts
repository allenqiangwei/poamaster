// lib/insights/extractor.ts

import OpenAI from 'openai';
import { getOpenAIClient } from '@/lib/openai';
import { EXTRACTION_CONFIG } from './constants';
import { DIMENSIONS } from './types';
import type { ExtractionResult, DraftItemData, Dimension } from './types';
import {
  SYSTEM_PROMPT,
  buildExtractionPrompt,
  buildMergePrompt,
} from './prompts';

/**
 * LLM 提取引擎
 * 实现混合策略：短文本单次提取，长文本分块并行提取 + LLM 合并
 */
export class InsightsExtractor {
  private client: OpenAI | null = null;

  /**
   * 从文本中提取 insights
   */
  async extract(text: string): Promise<ExtractionResult> {
    // Add validation at the start
    if (typeof text !== 'string') {
      throw new Error('输入文本不能为空');
    }

    if (text.trim().length === 0) {
      // Return empty result for empty text
      return {
        items: [],
        metadata: {
          strategy: 'single',
          modelName: EXTRACTION_CONFIG.MODEL_NAME,
          latencyMs: 0,
        },
      };
    }

    const startTime = Date.now();
    const isShortText = text.length < EXTRACTION_CONFIG.SHORT_TEXT_THRESHOLD;

    let items: DraftItemData[];

    if (isShortText) {
      items = await this.extractSinglePass(text);
    } else {
      items = await this.extractChunked(text);
    }

    const latencyMs = Date.now() - startTime;

    return {
      items,
      metadata: {
        strategy: isShortText ? 'single' : 'chunked',
        modelName: EXTRACTION_CONFIG.MODEL_NAME,
        latencyMs,
      },
    };
  }

  /**
   * 单次提取（适用于短文本）
   */
  private async extractSinglePass(text: string): Promise<DraftItemData[]> {
    const client = await this.getClient();

    try {
      const response = await client.chat.completions.create({
        model: EXTRACTION_CONFIG.MODEL_NAME,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildExtractionPrompt(text) },
        ],
        response_format: { type: 'json_object' },
        temperature: EXTRACTION_CONFIG.TEMPERATURE,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI 返回了空响应');
      }

      // Add validation before parsing
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`无法解析 LLM 响应: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Validate that parsed is an object
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('LLM 响应格式不正确: 期望对象类型');
      }

      // Validate expected structure (has at least one dimension key)
      const validDimensions = Object.values(DIMENSIONS);
      const hasDimensionKey = validDimensions.some(dim => dim in parsed);
      if (!hasDimensionKey) {
        throw new Error(`LLM 响应缺少维度字段,期望至少包含以下维度之一: ${validDimensions.join(', ')}`);
      }

      // 转换为 DraftItemData[] 格式
      return this.convertToItems(parsed);
    } catch (error) {
      if (error instanceof Error) {
        // 提供更友好的连接错误信息
        if (error.message.includes('Connection error') || error.message.includes('ECONNRESET') || error.message.includes('fetch failed')) {
          throw new Error('网络连接错误。请检查网络连接、代理设置，或稍后重试');
        }
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          throw new Error('请求超时。请稍后重试或检查网络连接');
        }
        throw new Error(`提取失败: ${error.message}`);
      }
      throw new Error('提取失败: 未知错误');
    }
  }

  /**
   * 分块提取（适用于长文本）
   */
  private async extractChunked(text: string): Promise<DraftItemData[]> {
    // 1. 分块
    const chunks = this.chunkText(text, EXTRACTION_CONFIG.CHUNK_SIZE);

    // 2. 并行提取
    const chunkResults = await Promise.all(
      chunks.map(chunk => this.extractSinglePass(chunk))
    );

    // 3. 合并所有结果
    const allItems = chunkResults.flat();

    // 4. 按维度分组
    const itemsByDimension = this.groupByDimension(allItems);

    // 5. 对每个维度，如果有多个条目，调用 merge
    const mergedItems: DraftItemData[] = [];

    for (const dimension of Object.values(DIMENSIONS)) {
      const items = itemsByDimension[dimension] || [];

      if (items.length === 0) {
        // 无条目，跳过
        continue;
      } else if (items.length === 1) {
        // 单条目，直接保留
        mergedItems.push(...items);
      } else {
        // 多条目，调用 merge
        const merged = await this.mergeItems(items, dimension);
        mergedItems.push(...merged);
      }
    }

    return mergedItems;
  }

  /**
   * 合并同维度的多个条目（去重）
   */
  private async mergeItems(
    items: DraftItemData[],
    dimension: Dimension
  ): Promise<DraftItemData[]> {
    const client = await this.getClient();

    try {
      // 构建合并提示
      const mergePrompt = buildMergePrompt(
        items.map(item => ({
          content: item.content,
          evidence: item.evidence,
        }))
      );

      const response = await client.chat.completions.create({
        model: EXTRACTION_CONFIG.MODEL_NAME,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: mergePrompt },
        ],
        temperature: EXTRACTION_CONFIG.TEMPERATURE,
      });

      const mergedContent = response.choices[0]?.message?.content?.trim();

      if (!mergedContent) {
        // 如果合并失败，返回原始条目
        return items;
      }

      // 返回合并后的单条目
      // 保留第一个条目的元数据（evidence, decisionType, action, etaText）
      const firstItem = items[0];

      return [{
        dimension,
        content: mergedContent,
        evidence: firstItem.evidence,
        decisionType: firstItem.decisionType,
        action: firstItem.action,
        etaText: firstItem.etaText,
      }];
    } catch (error) {
      // 合并失败，返回原始条目
      console.error('Merge error:', error);
      return items;
    }
  }

  /**
   * 文本分块（简单的基于字符数的分块，尽量在句子边界处分割）
   */
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      let endIndex = currentIndex + chunkSize;

      // 如果不是最后一块，尝试在句子边界处分割
      if (endIndex < text.length) {
        // 在接下来的 200 个字符内查找句子结束符
        const searchEnd = Math.min(endIndex + 200, text.length);
        const remaining = text.substring(endIndex, searchEnd);

        // 查找句子结束符（句号、问号、感叹号、换行符）
        const sentenceEndMatch = remaining.match(/[。？！\n]/);

        if (sentenceEndMatch && sentenceEndMatch.index !== undefined) {
          // 在句子边界处分割
          endIndex += sentenceEndMatch.index + 1;
        }
      } else {
        // 最后一块，取到文本末尾
        endIndex = text.length;
      }

      const chunk = text.substring(currentIndex, endIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      currentIndex = endIndex;
    }

    return chunks;
  }

  /**
   * 将 LLM 返回的 JSON 转换为 DraftItemData[]
   */
  private convertToItems(parsed: any): DraftItemData[] {
    const items: DraftItemData[] = [];
    let globalSortOrder = 0;

    // 遍历所有维度
    for (const dimension of Object.values(DIMENSIONS)) {
      const dimensionItems = parsed[dimension] || [];

      if (!Array.isArray(dimensionItems)) {
        continue;
      }

      for (const item of dimensionItems) {
        const draftItem: DraftItemData = {
          dimension,
          content: item.content || '',
          evidence: item.evidence || undefined,
        };

        // decision 维度的特殊字段
        if (dimension === DIMENSIONS.DECISION) {
          draftItem.decisionType = item.decisionType || undefined;
        }

        // action 维度的特殊字段
        if (dimension === DIMENSIONS.ACTION) {
          draftItem.action = item.action || item.content; // 如果没有 action 字段，使用 content
          draftItem.etaText = item.etaText || undefined;
        }

        items.push(draftItem);
        globalSortOrder++;
      }
    }

    return items;
  }

  /**
   * 按维度分组
   */
  private groupByDimension(items: DraftItemData[]): Record<Dimension, DraftItemData[]> {
    const validDimensions = Object.values(DIMENSIONS);
    const groups: Record<string, DraftItemData[]> = {};

    for (const dimension of Object.values(DIMENSIONS)) {
      groups[dimension] = [];
    }

    for (const item of items) {
      // Validate dimension before grouping
      if (!validDimensions.includes(item.dimension)) {
        console.warn(`跳过无效维度: ${item.dimension}`);
        continue;
      }

      if (groups[item.dimension]) {
        groups[item.dimension].push(item);
      }
    }

    return groups as Record<Dimension, DraftItemData[]>;
  }

  /**
   * 获取 OpenAI 客户端
   */
  private async getClient(): Promise<OpenAI> {
    if (!this.client) {
      this.client = await getOpenAIClient();
    }
    return this.client;
  }
}
