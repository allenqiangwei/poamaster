// lib/insights/prompts.ts

export const SYSTEM_PROMPT = `你是一位资深的 COO 助手，负责从与负责人的对话记录中提取关键信息。

你的任务是按照固定的 6 个维度提取结构化条目，帮助 COO 快速掌握负责人的状态、捕捉决策点、推动行动进入执行系统。

## 重要原则

1. **条目简洁清晰**：避免冗长背景描述，直接提炼核心信息
2. **同维度不重复**：同一维度内不要输出语义重复的条目
3. **证据必须原文**：evidence 字段必须是对话原文中的一句话
4. **准确分类**：确保条目归类到正确的维度`;

export function buildExtractionPrompt(text: string): string {
  return `
## 对话内容

${text}

## 提取要求

按以下 6 个维度提取结构化条目，输出 JSON 格式。

### 6 个维度

**1. focus（负责人的关注点）**
- 对方反复提及/最在意的主题、指标、依赖、约束等

**2. goal（负责人的目标）**
- 明确或隐含的目标（短中期均可）

**3. obstacle（负责人困扰）**
- 卡点、阻碍、抱怨、无法推进的原因

**4. decision（本次需要我拍板的事情）**
- **must_decide**：决策/批准/定优先级/资源分配/方案选择
- **need_intervene**：协调/推动/对齐/关键知会（不一定是决策）

**5. risk（负责人感觉到的风险）**
- 可能导致结果/进度/质量/团队/外部合作变差的风险

**6. action（负责人的行动项和 ETA）**
- 需要执行的具体行动 + 时间预期

## 输出格式

\`\`\`json
{
  "focus": [
    { "content": "条目内容", "evidence": "支持该条目的原文一句话" }
  ],
  "goal": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "obstacle": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "decision": [
    {
      "content": "条目内容",
      "evidence": "原文句子",
      "decisionType": "must_decide" 或 "need_intervene"
    }
  ],
  "risk": [
    { "content": "条目内容", "evidence": "原文句子" }
  ],
  "action": [
    {
      "action": "行动项描述",
      "etaText": "ETA 原文（如'下周五前'，可为空）",
      "evidence": "原文句子"
    }
  ]
}
\`\`\`

## 注意事项

- 如果某个维度没有内容，返回空数组 []
- 同一维度内语义相近的条目只保留一条最准确的
- evidence 必须是原文中的完整句子，不要改写
- decisionType 必须明确是 must_decide 或 need_intervene
- action 维度的 etaText 可以为空字符串（如果没有提到时间）

请严格按照上述格式输出 JSON。
`.trim();
}

export function buildMergePrompt(items: Array<{ content: string; evidence?: string }>): string {
  return `
以下是同一维度下语义相似的多条条目，请合并为一条简洁、准确的代表条目：

${items.map((item, i) => `${i + 1}. ${item.content}`).join('\n')}

要求：
- 保留所有关键信息
- 去除重复表述
- 输出一条简洁的合并后条目

只输出合并后的条目内容，不要其他说明。
`.trim();
}

export function buildSummaryPrompt(chunkResults: string[]): string {
  return `
以下是对长文本分段提取的结果，请汇总合并为最终的 6 维度条目：

${chunkResults.map((r, i) => `=== 第 ${i + 1} 段 ===\n${r}\n`).join('\n')}

要求：
- 合并所有段落的条目
- 同一维度内去除语义重复
- 保持 JSON 格式输出

输出格式与单次提取相同。
`.trim();
}

export function buildOutdatedCheckPrompt(item: { content: string; createdAt: Date }, dimension: string): string {
  const daysSinceCreated = Math.floor(
    (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return `
判断以下条目是否可能已经过时（不再相关或已被解决）：

维度：${dimension}
内容：${item.content}
创建时间：${item.createdAt.toLocaleDateString()}（${daysSinceCreated} 天前）

请分析并回答 JSON 格式：

\`\`\`json
{
  "isOutdated": true/false,
  "confidence": 0.0-1.0,
  "reason": "判断理由"
}
\`\`\`

只输出 JSON，不要其他说明。
`.trim();
}
