import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface DiscussionContext {
  material: string;
  template: {
    name: string;
    roles: Array<{
      name: string;
      responsibility: string;
      focusAreas: string;
    }>;
  };
}

export interface RoundResult {
  messages: Array<{
    roleName: string;
    content: string;
    order: number;
  }>;
  assumptions?: Array<{
    description: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  risks?: Array<{
    description: string;
    impact: string;
    mitigation: string;
    priority: 'high' | 'medium' | 'low';
    riskType: string;
  }>;
}

export interface VerdictResult {
  conclusion: string;
  conclusionType: 'pass' | 'conditional_pass' | 'reject' | 'need_more_info';
  decisionReasoning: string;
  actions: Array<{
    content: string;
    assignee: string;
    deadline: string;
    acceptanceCriteria: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  risks: Array<{
    description: string;
    impact: string;
    mitigation: string;
    priority: 'high' | 'medium' | 'low';
    riskType: string;
  }>;
  roleFeedbacks: Record<string, string>;
  strategicRisks: string[];
}

export class DiscussionEngine {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * 回合1：澄清回合（并行）
   */
  async runClarifyRound(context: DiscussionContext): Promise<RoundResult> {
    const prompt = this.buildClarifyPrompt(context);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result;
  }

  /**
   * 回合2：质疑回合（并行）
   */
  async runQuestionRound(
    context: DiscussionContext,
    clarifyResult: RoundResult
  ): Promise<RoundResult> {
    const prompt = this.buildQuestionPrompt(context, clarifyResult);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result;
  }

  /**
   * 回合3：反驳回合（串行）
   */
  async runRebuttalRound(
    context: DiscussionContext,
    previousRounds: RoundResult[],
    roleName: string
  ): Promise<{ roleName: string; content: string }> {
    const prompt = this.buildRebuttalPrompt(context, previousRounds, roleName);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    });

    return {
      roleName,
      content: response.choices[0]?.message?.content || '',
    };
  }

  /**
   * 回合4：裁决回合（串行）
   */
  async runVerdictRound(
    context: DiscussionContext,
    allRounds: RoundResult[]
  ): Promise<VerdictResult> {
    const prompt = this.buildVerdictPrompt(context, allRounds);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result;
  }

  // Prompt构建方法
  private buildClarifyPrompt(context: DiscussionContext): string {
    return `你是一个专业的讨论主持人，正在主持一场"${context.template.name}"的讨论。

材料内容：
${context.material}

参与角色：
${context.template.roles.map(r => `- ${r.name}：${r.responsibility}，关注${r.focusAreas}`).join('\n')}

请让每个角色提出2-3个澄清问题，以便更好地理解材料。

输出JSON格式：
{
  "messages": [
    {
      "roleName": "角色名称",
      "content": "问题内容（2-3个问题，用换行分隔）",
      "order": 1
    }
  ]
}`;
  }

  private buildQuestionPrompt(context: DiscussionContext, clarifyResult: RoundResult): string {
    return `继续讨论"${context.template.name}"。

材料内容：
${context.material}

澄清回合的问题：
${clarifyResult.messages.map(m => `${m.roleName}：\n${m.content}`).join('\n\n')}

现在请每个角色提出质疑：
1. 识别风险点
2. 指出数据缺失
3. 发现逻辑漏洞
4. 对缺失数据提供假设（标注置信度）

输出JSON格式：
{
  "messages": [
    {
      "roleName": "角色名称",
      "content": "质疑内容",
      "order": 1
    }
  ],
  "assumptions": [
    {
      "description": "假设内容",
      "confidence": "high/medium/low",
      "reasoning": "假设依据"
    }
  ],
  "risks": [
    {
      "description": "风险描述",
      "impact": "可能影响",
      "mitigation": "缓解措施",
      "priority": "high/medium/low",
      "riskType": "market/financial/operational/legal/technical/strategic"
    }
  ]
}`;
  }

  private buildRebuttalPrompt(
    context: DiscussionContext,
    previousRounds: RoundResult[],
    roleName: string
  ): string {
    const role = context.template.roles.find(r => r.name === roleName);

    return `你现在是${roleName}，职责是${role?.responsibility}，关注${role?.focusAreas}。

材料内容：
${context.material}

之前的讨论：
${this.formatPreviousRounds(previousRounds)}

请基于其他角色的质疑，提出你的反驳、认同或替代方案。要求：
1. 针对性回应其他角色的关切
2. 提供替代建议或补充方案
3. 如果是反对者角色，提供详细的替代建议
4. 保持专业和建设性

直接输出你的发言内容，不要JSON格式。`;
  }

  private buildVerdictPrompt(
    context: DiscussionContext,
    allRounds: RoundResult[]
  ): string {
    return `作为主持人和裁决官，请综合所有讨论，做出最终裁决。

材料内容：
${context.material}

完整讨论记录：
${this.formatAllRounds(allRounds)}

请提供：
1. 最终裁决结论（pass/conditional_pass/reject/need_more_info）
2. 详细的决策依据
3. 完整的行动清单
4. 最终风险清单
5. 长期战略风险提示
6. 每个角色的反馈总结

输出JSON格式：
{
  "conclusion": "裁决结论摘要",
  "conclusionType": "pass/conditional_pass/reject/need_more_info",
  "decisionReasoning": "详细的决策依据和推理过程",
  "actions": [
    {
      "content": "行动内容",
      "assignee": "建议负责人",
      "deadline": "建议截止时间（ISO格式或相对时间）",
      "acceptanceCriteria": "验收标准",
      "priority": "high/medium/low"
    }
  ],
  "risks": [
    {
      "description": "风险描述",
      "impact": "可能影响",
      "mitigation": "建议缓解措施",
      "priority": "high/medium/low",
      "riskType": "market/financial/operational/legal/technical/strategic"
    }
  ],
  "roleFeedbacks": {
    "角色名称": "该角色的专业视角总结"
  },
  "strategicRisks": ["长期战略风险1", "长期战略风险2"]
}`;
  }

  private formatPreviousRounds(rounds: RoundResult[]): string {
    return rounds.map((round, index) => {
      return `回合${index + 1}：\n${round.messages.map(m => `${m.roleName}：\n${m.content}`).join('\n\n')}`;
    }).join('\n\n---\n\n');
  }

  private formatAllRounds(rounds: RoundResult[]): string {
    return this.formatPreviousRounds(rounds);
  }
}
