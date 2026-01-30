// lib/pulse/constants.ts

import { EntryDimension } from '@prisma/client';

export const DIMENSION_LABELS: Record<EntryDimension, string> = {
  OVERALL_HEALTH: '总体健康度',
  SCHEDULE: '进度与里程碑',
  SCOPE: '交付物与范围',
  RISKS: '风险',
  BLOCKERS: '问题与阻塞',
  DEPENDENCIES: '依赖与外部协作',
  QUALITY: '质量与稳定性',
  RESOURCING: '资源与产能',
  DECISIONS: '决策与需要支持',
  KPI: '目标指标与结果',
  PLAN_CREDIBILITY: '计划可信度',
  ALIGNMENT: '沟通与对齐风险',
};

// Display order (critical dimensions first)
export const DIMENSION_ORDER: EntryDimension[] = [
  'RISKS',
  'BLOCKERS',
  'DECISIONS',
  'SCHEDULE',
  'SCOPE',
  'DEPENDENCIES',
  'QUALITY',
  'RESOURCING',
  'KPI',
  'OVERALL_HEALTH',
  'PLAN_CREDIBILITY',
  'ALIGNMENT',
];

// Key dimensions shown on project cards
export const KEY_DIMENSIONS: EntryDimension[] = ['RISKS', 'BLOCKERS', 'DECISIONS'];

// Stale project threshold (days)
export const STALE_THRESHOLD_DAYS = 7;

// Soft delete cleanup threshold (ms) - 1 minute
export const DELETE_CLEANUP_THRESHOLD_MS = 60 * 1000;

// Undo window (ms) - 5 seconds
export const UNDO_WINDOW_MS = 5000;

// Similarity thresholds
export const SIMILARITY_THRESHOLD = 0.3;
export const KEYWORD_WEIGHT = 0.4;
export const EMBEDDING_WEIGHT = 0.6;

// File upload config
export const PULSE_UPLOAD_DIR = 'uploads/pulse';
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain'];
