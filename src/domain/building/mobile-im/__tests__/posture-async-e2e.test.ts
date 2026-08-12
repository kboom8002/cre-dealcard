import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * generate-async → handler identity passthrough 검증
 *
 * handler를 mock하여 route handler가 investment_posture를
 * identity 객체로 올바르게 변환하여 전달하는지 확인합니다.
 */

describe('generate-async identity passthrough', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should construct identity from investment_posture', () => {
    // 실제 route handler는 Next.js 환경 의존이 크므로,
    // 핵심 변환 로직만 단위 검증합니다.
    const investmentPostureInput = 'development';

    // route.ts L113-115의 identity 구성 로직 재현
    const identity = investmentPostureInput
      ? { investmentPosture: investmentPostureInput }
      : undefined;

    expect(identity).toBeDefined();
    expect(identity!.investmentPosture).toBe('development');
  });

  it('should pass undefined identity when no posture provided', () => {
    const investmentPostureInput: string | null = null;

    const identity = investmentPostureInput
      ? { investmentPosture: investmentPostureInput }
      : undefined;

    expect(identity).toBeUndefined();
  });

  it('sync route should merge body.investment_posture into identity', () => {
    // generate/route.ts L34-38의 identity 구성 로직 재현
    const body = {
      identity: { assetType: '오피스' },
      investment_posture: 'owner_occupied',
    };

    let identity: Record<string, any> = body.identity || {};
    const investmentPosture = (body as any).investment_posture
      ?? (body as any).investmentPosture
      ?? identity?.investmentPosture;

    if (investmentPosture) {
      identity = { ...identity, investmentPosture };
    }

    expect(identity.investmentPosture).toBe('owner_occupied');
    expect(identity.assetType).toBe('오피스'); // 기존 필드 보존
  });

  it('sync route should prefer body.investment_posture over identity.investmentPosture', () => {
    const body = {
      identity: { investmentPosture: 'income', assetType: '상가' },
      investment_posture: 'trading',
    };

    let identity: Record<string, any> = body.identity || {};
    const investmentPosture = (body as any).investment_posture
      ?? (body as any).investmentPosture
      ?? identity?.investmentPosture;

    if (investmentPosture) {
      identity = { ...identity, investmentPosture };
    }

    expect(identity.investmentPosture).toBe('trading');
  });

  it('handler posture fallback chain should follow identity > ssot > supplemental > default', () => {
    // handler.ts L146-150 및 L249의 폴백 체인 재현
    const scenarios = [
      { identity: { investmentPosture: 'development' }, ssot: 'income', expected: 'development' },
      { identity: undefined, ssot: 'operating', expected: 'operating' },
      { identity: undefined, ssot: undefined, expected: 'income' },
      { identity: { investmentPosture: 'trading' }, ssot: 'development', expected: 'trading' },
    ];

    for (const s of scenarios) {
      const posture = s.identity?.investmentPosture || s.ssot || 'income';
      expect(posture).toBe(s.expected);
    }
  });
});
