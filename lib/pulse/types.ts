// lib/pulse/types.ts

import { EntryDimension, ReportType } from '@prisma/client';

export interface Source {
  reportType: ReportType;
  reportDate: string;  // ISO 8601
  fileName: string;
  page?: number;
}

export interface EvidenceHistoryItem {
  evidence: string;
  source: Source;
  addedAt: string;  // ISO 8601
}

export interface AICandidate {
  dimension: EntryDimension;
  title: string;
  evidence_quote: string;
  confidence: number;
}

export interface AIExtractionResult {
  candidates: AICandidate[];
  empty_dimensions: EntryDimension[];
  warnings: string[];
}

export interface SimilarityResult {
  entryId: string;
  title: string;
  evidenceCurrent: string;
  sourceCurrent: Source;
  score: number;
  keywordScore: number;
  embeddingScore: number;
}

export interface BatchOperation {
  action: 'create' | 'update' | 'ignore';
  candidateIndex: number;
  targetEntryId?: string;
  dimension: EntryDimension;
  title: string;
  evidence: string;
  source: Source;
}

export interface ProjectStats {
  total: number;
  byDimension: Record<EntryDimension, number>;
}
