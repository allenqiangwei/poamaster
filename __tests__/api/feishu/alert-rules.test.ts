import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, mockVerifySession } from '../../setup';
import { authRequest, makeRequest } from '../../helpers/request';

describe('GET /api/feishu/alert-rules', () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockPrisma.alertRule.findMany.mockReset();
  });

  it('returns 401 without session', async () => {
    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = makeRequest('GET', '/api/feishu/alert-rules');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns rules list', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    const rules = [
      { id: '1', keyword: '严重', signalType: 'RISK', severity: 'CRITICAL', isSystem: true, isEnabled: true },
    ];
    mockPrisma.alertRule.findMany.mockResolvedValue(rules);

    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('GET', '/api/feishu/alert-rules');
    const res = await GET(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.rules).toEqual(rules);
  });

  it('filters by signalType', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    mockPrisma.alertRule.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('GET', '/api/feishu/alert-rules', {
      searchParams: { type: 'RISK' },
    });
    await GET(req);

    expect(mockPrisma.alertRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ signalType: 'RISK' }),
      })
    );
  });
});

describe('POST /api/feishu/alert-rules', () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockPrisma.alertRule.create.mockReset();
  });

  it('creates a new rule', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });
    mockPrisma.alertRule.create.mockResolvedValue({
      id: 'new-1', keyword: '测试', signalType: 'RISK', severity: 'HIGH',
      isSystem: false, isEnabled: true,
    });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '测试', signalType: 'RISK', severity: 'HIGH' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(mockPrisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        keyword: '测试',
        signalType: 'RISK',
        severity: 'HIGH',
        isSystem: false,
      }),
    });
  });

  it('rejects empty keyword', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '', signalType: 'RISK', severity: 'HIGH' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects invalid signalType', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '测试', signalType: 'INVALID', severity: 'HIGH' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects invalid severity', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1' });

    const { POST } = await import('@/app/api/feishu/alert-rules/route');
    const req = authRequest('POST', '/api/feishu/alert-rules', {
      body: { keyword: '测试', signalType: 'RISK', severity: 'INVALID' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
