// lib/insights/types.ts

// ========== 维度枚举 ==========

export const DIMENSIONS = {
  FOCUS: 'focus',           // 负责人的关注点
  GOAL: 'goal',             // 负责人的目标
  OBSTACLE: 'obstacle',     // 负责人困扰
  DECISION: 'decision',     // 本次需要我拍板的事情
  RISK: 'risk',             // 负责人感觉到的风险
  ACTION: 'action',         // 负责人的行动项和 ETA
} as const;

export type Dimension = typeof DIMENSIONS[keyof typeof DIMENSIONS];

export const DECISION_TYPES = {
  MUST_DECIDE: 'must_decide',       // 必须拍板
  NEED_INTERVENE: 'need_intervene', // 需要介入
} as const;

export type DecisionType = typeof DECISION_TYPES[keyof typeof DECISION_TYPES];

export const ITEM_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ItemStatus = typeof ITEM_STATUS[keyof typeof ITEM_STATUS];

// ========== 解析结果类型 ==========

export interface ParseResult {
  text: string;
  charCount: number;
  pageCount?: number;
  metadata: {
    fileType: string;
    fileName: string;
  };
}

// ========== LLM 提取结果类型 ==========

export interface DraftItemData {
  dimension: Dimension;
  content: string;
  evidence?: string;
  decisionType?: DecisionType;
  action?: string;
  etaText?: string;
}

export interface ExtractionResult {
  items: DraftItemData[];
  metadata: {
    strategy: 'single' | 'chunked';
    modelName: string;
    latencyMs: number;
  };
}

// ========== 去重结果类型 ==========

export interface DedupeResult {
  dedupedItems: DraftItemData[];
  mergeCount: number;
  mergeDetails: Array<{
    keptId: string;
    mergedIds: string[];
    reason: string;
  }>;
}

// ========== 智能分析类型 ==========

export interface SmartFlags {
  isDuplicate: boolean;
  isOutdated: boolean;
  relatedIds: string[];
  confidence: number;  // 0-1
  reason?: string;
  checkedAt: string;
}

export interface SmartAnalysisResult {
  itemId: string;
  flags: SmartFlags;
}

// ========== ToDo 推送类型 ==========

export interface PushResult {
  itemId: string;
  success: boolean;
  todoTaskId?: string;
  error?: string;
}
