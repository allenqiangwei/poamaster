/**
 * Global test setup — runs before all test files.
 *
 * Mocks the heavy dependencies (Prisma, auth, claude-worker) so that
 * API route handlers can be tested in isolation without a real DB or CLI.
 */
import { vi } from 'vitest';

// ── Mock Prisma ────────────────────────────────────────────────────
// Every model used in the chat feature gets a mock with chainable methods.
function makeMockModel() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(({ data }) => ({
      id: `mock-${Date.now()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    update: vi.fn().mockImplementation(({ data }) => ({ id: 'mock-id', ...data })),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockImplementation(({ create }) => ({
      id: `mock-${Date.now()}`,
      ...create,
    })),
    count: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue({}),
  };
}

export const mockPrisma = {
  botConversation: makeMockModel(),
  botMessage: makeMockModel(),
  alertRule: makeMockModel(),
  alertSenderWhitelist: makeMockModel(),
  feishuChat: makeMockModel(),
  config: makeMockModel(),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// ── Mock auth ──────────────────────────────────────────────────────
export const mockVerifySession = vi.fn();

vi.mock('@/lib/auth', () => ({
  verifySession: mockVerifySession,
}));

// ── Mock claude-worker ─────────────────────────────────────────────
export const mockStartClaudeJob = vi.fn();

vi.mock('@/lib/claude-worker', () => ({
  startClaudeJob: mockStartClaudeJob,
  cancelJob: vi.fn(),
  cleanupOrphanedJobs: vi.fn().mockResolvedValue(0),
}));
