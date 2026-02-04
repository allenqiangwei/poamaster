import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';

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
  private openai: OpenAI | null = null;

  constructor() {
    // OpenAI client will be initialized lazily using getOpenAIClient()
  }

  private async getClient(): Promise<OpenAI> {
    if (!this.openai) {
      this.openai = await getOpenAIClient();
    }
    return this.openai;
  }

  /**
   * 回合1：澄清回合（并行）
   */
  async runClarifyRound(context: DiscussionContext): Promise<RoundResult> {
    const prompt = this.buildClarifyPrompt(context);
    const client = await this.getClient();
    const model = await getOpenAIModel();

    const response = await client.chat.completions.create({
      model,
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
    const client = await this.getClient();
    const model = await getOpenAIModel();

    const response = await client.chat.completions.create({
      model,
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
    const client = await this.getClient();
    const model = await getOpenAIModel();

    const response = await client.chat.completions.create({
      model,
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
    const client = await this.getClient();
    const model = await getOpenAIModel();

    const response = await client.chat.completions.create({
      model,
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

**重要原则：禁止空谈，必须基于材料的具体内容**

请让每个角色提出2-3个澄清问题，要求：
1. **必须引用材料中的具体数据、事实或段落**（用"材料中提到..."开头）
2. 针对具体内容提问，而非泛泛而谈
3. 聚焦可量化的数据、明确的时间线、具体的人/事/物
4. 避免抽象概念和理论讨论

示例：
❌ "这个方案的可行性如何？"（过于笼统）
✅ "材料中提到预算为500万，但实施周期长达18个月，请问这个预算是否包含了人力成本和市场推广费用？"

输出JSON格式：
{
  "messages": [
    {
      "roleName": "角色名称",
      "content": "问题内容（2-3个问题，每个问题必须引用具体内容，用换行分隔）",
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

**重要原则：禁止空谈，必须基于材料的具体内容**

现在请每个角色提出质疑，要求：
1. **必须引用材料中的具体数据、事实或段落**
2. 识别具体风险点（用数据支撑，而非泛泛描述）
3. 指出明确的数据缺失（列出缺失的具体指标）
4. 发现逻辑漏洞（指出材料中具体矛盾之处）
5. 对缺失数据提供有依据的假设

示例：
❌ "市场风险较高"（过于笼统）
✅ "材料中提到目标市场规模为100亿，但未说明现有竞争对手的市场份额。根据行业报告，前三名已占据65%份额，留给新进入者的空间有限。"

❌ "需要更多数据"（过于笼统）
✅ "材料缺少过去3年的用户增长率、留存率和客单价数据，无法评估增长趋势的可持续性。"

输出JSON格式：
{
  "messages": [
    {
      "roleName": "角色名称",
      "content": "质疑内容（必须包含具体引用和数据）",
      "order": 1
    }
  ],
  "assumptions": [
    {
      "description": "假设内容（必须具体、可验证）",
      "confidence": "high/medium/low",
      "reasoning": "假设依据（基于材料中的哪些信息推断）"
    }
  ],
  "risks": [
    {
      "description": "风险描述（必须引用材料中的具体内容）",
      "impact": "量化影响（尽可能用数字或百分比）",
      "mitigation": "具体可执行的缓解措施（非泛泛建议）",
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

**重要原则：禁止空谈，必须基于材料的具体内容**

请基于其他角色的质疑，提出你的反驳、认同或替代方案。要求：
1. **针对性回应其他角色的关切，引用材料中的具体数据和事实**
2. 提供具体的、可执行的替代建议（包含时间、成本、资源）
3. 如果是反对者角色，提供详细的替代方案（非泛泛否定）
4. 所有论点必须有数据或事实支撑

示例：
❌ "我认为这个方案不可行"（过于笼统）
✅ "材料中预算为500万，但根据同类项目经验，技术开发至少需要300万、市场推广200万、运营100万，总计600万。建议削减非核心功能或延长开发周期至24个月以控制成本。"

❌ "我们需要更多资源"（过于笼统）
✅ "材料显示当前团队5人，但要完成Q2的3个模块开发，按照每模块2人月计算，至少需要增加1名前端和1名后端工程师，或将交付时间延后1个月。"

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

**重要原则：裁决必须基于材料的具体内容和讨论中的数据事实**

请提供：
1. 最终裁决结论（基于具体证据，非主观判断）
2. 详细的决策依据（引用材料中的关键数据和讨论中的核心论点）
3. 完整的行动清单（具体、可执行、有明确时间和责任人）
4. 最终风险清单（量化影响，提供具体缓解措施）
5. 长期战略风险（基于材料中的趋势和数据推断）
6. 每个角色的反馈总结（提炼其基于材料提出的核心观点）

要求：
- 所有结论必须引用材料中的具体内容
- 行动项必须具体到可直接执行的程度
- 风险评估必须有数据或事实支撑
- 避免模糊表述，使用明确的时间、数字、责任人

示例：
❌ "建议加强市场调研"（过于笼统）
✅ "鉴于材料中目标市场规模仅为100亿且前三名占据65%份额，建议产品经理张三在2周内完成前5名竞品的功能对比分析，重点关注差异化功能点，产出竞品分析报告。"

输出JSON格式：
{
  "conclusion": "裁决结论摘要（必须引用关键数据）",
  "conclusionType": "pass/conditional_pass/reject/need_more_info",
  "decisionReasoning": "详细的决策依据和推理过程（引用材料中的具体内容和讨论中的数据论点）",
  "actions": [
    {
      "content": "具体行动内容（包含可验证的交付物）",
      "assignee": "建议负责人（如材料中提及的具体人名或职位）",
      "deadline": "明确截止时间（ISO格式或如'2周内'）",
      "acceptanceCriteria": "清晰的验收标准（可量化）",
      "priority": "high/medium/low"
    }
  ],
  "risks": [
    {
      "description": "风险描述（引用材料中的具体内容）",
      "impact": "量化影响（使用数字、百分比或明确后果）",
      "mitigation": "具体可执行的缓解措施（包含时间、资源、责任人）",
      "priority": "high/medium/low",
      "riskType": "market/financial/operational/legal/technical/strategic"
    }
  ],
  "roleFeedbacks": {
    "角色名称": "该角色基于材料提出的核心观点总结（引用具体论据）"
  },
  "strategicRisks": ["基于材料数据推断的长期战略风险（具体描述）"]
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
