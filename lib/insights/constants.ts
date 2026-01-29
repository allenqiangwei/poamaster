// lib/insights/constants.ts

import { DIMENSIONS } from './types';

// ========== 文件处理配置 ==========

export const FILE_UPLOAD_CONFIG = {
  ALLOWED_TYPES: [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_DIR: 'uploads/insights',
} as const;

// ========== LLM 提取配置 ==========

export const EXTRACTION_CONFIG = {
  SHORT_TEXT_THRESHOLD: 5000, // 字符
  CHUNK_SIZE: 3000,
  MODEL_NAME: 'gpt-4o',
  TEMPERATURE: 0.3,
  PROMPT_VERSION: '1.0',
} as const;

// ========== 去重配置 ==========

export const DEDUP_CONFIG = {
  SIMILARITY_THRESHOLD: 0.85,
  EMBEDDING_MODEL: 'text-embedding-3-small',
} as const;

// ========== 智能分析配置 ==========

export const SMART_ANALYSIS_CONFIG = {
  DUPLICATE_THRESHOLD: 0.90,
  OUTDATED_DAYS_THRESHOLD: 90,
} as const;

// ========== 维度显示配置 ==========

export const DIMENSION_LABELS: Record<string, string> = {
  [DIMENSIONS.DECISION]: '需要我拍板的事情',
  [DIMENSIONS.FOCUS]: '负责人的关注点',
  [DIMENSIONS.GOAL]: '负责人的目标',
  [DIMENSIONS.OBSTACLE]: '负责人困扰',
  [DIMENSIONS.RISK]: '负责人感觉到的风险',
  [DIMENSIONS.ACTION]: '负责人的行动项和 ETA',
} as const;

export const DIMENSION_ORDER = [
  DIMENSIONS.DECISION,   // 置顶
  DIMENSIONS.FOCUS,
  DIMENSIONS.GOAL,
  DIMENSIONS.OBSTACLE,
  DIMENSIONS.RISK,
  DIMENSIONS.ACTION,
] as const;
