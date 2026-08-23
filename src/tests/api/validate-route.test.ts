import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase for import resolution
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

describe('/api/im/validate', () => {
  let POST: typeof import('@/app/api/im/validate/route').POST;

  beforeEach(async () => {
    const mod = await import('@/app/api/im/validate/route');
    POST = mod.POST;
  });

  async function callValidate(body: Record<string, unknown>) {
    const req = new NextRequest('http://localhost/api/im/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    return res.json();
  }

  it('VR-01: income posture with all required fields returns canGenerate=true', async () => {
    const result = await callValidate({
      investment_posture: 'income',
      tier: 'basic',
      asking_price_manwon: 25000,
      monthly_rent_total_krw: 4657,
      resolved_address: '서울 영등포구',
      resolved_pnu: '1156010100',
    });
    expect(result.canGenerate).toBe(true);
    expect(result.grade).toBeDefined();
  });

  it('VR-02: income posture without asking_price returns error', async () => {
    const result = await callValidate({
      investment_posture: 'income',
      tier: 'basic',
      monthly_rent_total_krw: 4657,
    });
    expect(result.canGenerate).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('VR-03: development posture without address returns error', async () => {
    const result = await callValidate({
      investment_posture: 'development',
      tier: 'basic',
    });
    expect(result.canGenerate).toBe(false);
    expect(result.errors.some((e: string) => e.includes('주소') || e.includes('PNU'))).toBe(true);
  });

  it('VR-04: response includes grade and missingItems', async () => {
    const result = await callValidate({
      investment_posture: 'income',
      tier: 'basic',
      asking_price_manwon: 25000,
      monthly_rent_total_krw: 4657,
    });
    expect(result.grade).toBeDefined();
    expect(Array.isArray(result.missingItems)).toBe(true);
  });

  it('VR-05: pro tier with insufficient data returns error', async () => {
    const result = await callValidate({
      investment_posture: 'income',
      tier: 'pro',
      asking_price_manwon: 25000,
      monthly_rent_total_krw: 4657,
    });
    // Without address/PNU, grade is unlikely A, so pro should be blocked
    if (result.grade !== 'A') {
      expect(result.canGenerate).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Pro'))).toBe(true);
    }
  });
});
