import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { runHardFilter, scoreToGrade } from '@/domain/matching/matching-engine';
import { matchBuyerWithDeal } from '@/domain/matching/explainable-matcher';
import { runLeaseHardFilter } from '@/domain/matching/lease-matching-engine';
import type { MatchInput } from '@/domain/matching/matching-types';

vi.mock('@/domain/team/circle-matching-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/team/circle-matching-service')>();
  return {
    ...actual,
    approveIdentityReveal: vi.fn().mockImplementation(async (input: { circleMatchId: string; approvingBrokerId: string }) => {
      return {
        bothApproved: true,
        revealedData: {
          building: { address: '서울시 강남구 역삼동 123-45', owner_name: '홍길동' },
          buyer: { name: '이대표', company: '(주)알파인베스트', phone: '010-1234-5678' },
        },
      };
    }),
  };
});

// Genuine Next.js Route Handlers
import { POST as matchPost } from '@/app/api/broker/match/route';
import { POST as leaseMatchPost } from '@/app/api/broker/lease-match/route';
import { POST as circleMatchPost } from '@/app/api/broker/circles/[id]/match/route';
import { POST as circleApprovePost } from '@/app/api/broker/circles/[id]/match/[matchId]/approve/route';
import { POST as circleDisclosurePost } from '@/app/api/broker/circles/[id]/match/[matchId]/disclosure/route';
import { POST as personaPost } from '@/app/api/broker/ideal-buyer-persona/route';
import { GET as personasGet, POST as personasPost, DELETE as personasDelete } from '@/app/api/broker/deal-card/[id]/personas/route';
import { DELETE as personaItemDelete } from '@/app/api/broker/deal-card/[id]/personas/[personaId]/route';
import { POST as buyerMemoPost } from '@/app/api/broker/buyer-memo/generate/route';
import { POST as campaignPost } from '@/app/api/broker/campaign/route';
import { POST as pitchPost } from '@/app/api/broker/pitch/route';
import { POST as clusterPost } from '@/app/api/broker/prediction/cluster-buyers/route';
import { POST as pricePost } from '@/app/api/broker/prediction/price/route';

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = 'test-token-broker-001';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;

    if (urlStr.startsWith(BASE_URL) || urlStr.startsWith('/api/')) {
      const parsedUrl = new URL(urlStr, BASE_URL);
      const pathname = parsedUrl.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const req = new NextRequest(parsedUrl.toString(), init as any);

      if (pathname === '/api/broker/match' && method === 'POST') {
        return matchPost(req);
      }
      if (pathname === '/api/broker/lease-match' && method === 'POST') {
        return leaseMatchPost(req);
      }
      const circleMatchM = pathname.match(/^\/api\/broker\/circles\/([^/]+)\/match$/);
      if (circleMatchM && method === 'POST') {
        return circleMatchPost(req, { params: Promise.resolve({ id: circleMatchM[1] }) });
      }
      const circleApproveM = pathname.match(/^\/api\/broker\/circles\/([^/]+)\/match\/([^/]+)\/approve$/);
      if (circleApproveM && method === 'POST') {
        return circleApprovePost(req, { params: Promise.resolve({ id: circleApproveM[1], matchId: circleApproveM[2] }) });
      }
      const circleDisclosureM = pathname.match(/^\/api\/broker\/circles\/([^/]+)\/match\/([^/]+)\/disclosure$/);
      if (circleDisclosureM && method === 'POST') {
        return circleDisclosurePost(req, { params: Promise.resolve({ id: circleDisclosureM[1], matchId: circleDisclosureM[2] }) });
      }
      if (pathname === '/api/broker/ideal-buyer-persona' && method === 'POST') {
        return personaPost(req);
      }
      const personasM = pathname.match(/^\/api\/broker\/deal-card\/([^/]+)\/personas$/);
      if (personasM) {
        const id = personasM[1];
        if (method === 'GET') return personasGet(req, { params: Promise.resolve({ id }) });
        if (method === 'POST') return personasPost(req, { params: Promise.resolve({ id }) });
        if (method === 'DELETE') return personasDelete(req, { params: Promise.resolve({ id }) });
      }
      const personaItemM = pathname.match(/^\/api\/broker\/deal-card\/([^/]+)\/personas\/([^/]+)$/);
      if (personaItemM && method === 'DELETE') {
        return personaItemDelete(req, { params: Promise.resolve({ id: personaItemM[1], personaId: personaItemM[2] }) });
      }
      if (pathname === '/api/broker/buyer-memo/generate' && method === 'POST') {
        return buyerMemoPost(req);
      }
      if (pathname === '/api/broker/campaign' && method === 'POST') {
        return campaignPost(req);
      }
      if (pathname === '/api/broker/pitch' && method === 'POST') {
        return pitchPost(req);
      }
      if (pathname === '/api/broker/prediction/cluster-buyers' && method === 'POST') {
        return clusterPost(req);
      }
      if (pathname === '/api/broker/prediction/price' && method === 'POST') {
        return pricePost(req);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return originalFetch(input, init);
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('AI Matching Domain E2E Tests (AI 매칭/추천)', () => {

  // D1. 3-Stage 매수자 매칭
  describe('D1. 3-Stage 매수자 매칭', () => {
    test('MATCH-E2E-01: API 매칭 실행 POST /api/broker/match → grade, score, stage breakdown', async () => {
      const payload = {
        building: { id: "b1", priceBand: "50억", areaSignal: "강남구 역삼동", assetType: "중소형빌딩" },
        intent: { purchasePurpose: "투자", budgetRange: { min: 40, max: 60, display: "40~60억" }, preferredRegions: ["강남구"], assetTypes: ["중소형빌딩"], mustHave: [], niceToHave: [] }
      };
      const res = await fetch(`${BASE_URL}/api/broker/match`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('grade');
      expect(data).toHaveProperty('score');
      expect(data).toHaveProperty('stage1Passed');
      expect(['S', 'A', 'B', 'C']).toContain(data.grade);
    });

    test('MATCH-E2E-01-NEG: Malformed payload to POST /api/broker/match returns 400 Bad Request', async () => {
      const res = await fetch(`${BASE_URL}/api/broker/match`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ invalidField: "garbage" })
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    test('MATCH-E2E-02: Import and test runHardFilter directly with matching buyer+building', () => {
      // 조건이 맞는 빌딩과 매수자 인텐트를 직접 하드 필터로 검증 (성공 케이스)
      const input: MatchInput = {
        buildingSsotLiteId: 'test-bsl-1',
        buyerIntentLiteId: 'test-bil-1',
        brokerId: 'test-broker-1',
        building: {
          priceBand: '50억',
          areaSignal: '강남구 역삼동',
          assetType: '중소형빌딩',
          vacatePlan: 'vacant',
          illegalExtension: false,
          sectionalOwners: 1,
          vacancySignal: null,
          fitSummary: '',
          cautionSummary: '',
        },
        intent: {
          buyerType: '개인투자자',
          riskTolerance: 'moderate',
          purchasePurpose: '투자',
          budgetRange: { min: 4_000_000_000, max: 6_000_000_000, display: '40~60억' },
          preferredRegions: ['강남구'],
          assetTypes: ['중소형빌딩'],
          mustHave: ['단독소유'],
          niceToHave: []
        }
      };
      const result = runHardFilter(input);
      expect(result.passed).toBe(true);
      expect(result.failReasons).toHaveLength(0);
    });

    test('MATCH-E2E-03: Import and test runHardFilter with mismatched budget (should fail)', () => {
      // 예산 상한선을 초과하는 빌딩에 대해 하드 필터가 탈락시키는지를 검증
      const input: MatchInput = {
        buildingSsotLiteId: 'test-bsl-1',
        buyerIntentLiteId: 'test-bil-1',
        brokerId: 'test-broker-1',
        building: {
          priceBand: '100억',
          areaSignal: '강남구 역삼동',
          assetType: '중소형빌딩',
          vacancySignal: null,
          fitSummary: '',
          cautionSummary: '',
        },
        intent: {
          buyerType: '개인투자자',
          riskTolerance: 'moderate',
          purchasePurpose: '투자',
          budgetRange: { min: 4_000_000_000, max: 6_000_000_000, display: '40~60억' },
          preferredRegions: ['강남구'],
          assetTypes: ['중소형빌딩'],
          mustHave: [],
          niceToHave: []
        }
      };
      const result = runHardFilter(input);
      expect(result.passed).toBe(false);
      expect(result.failReasons.some(r => r.includes('가격대 불일치'))).toBe(true);
    });

    test('MATCH-E2E-04: Import and test scoreToGrade with various score thresholds', () => {
      // 각 점수 대역별로 S, A, B, C 등급이 올바르게 매핑되는지 확인
      expect(scoreToGrade(85)).toBe('S');
      expect(scoreToGrade(70)).toBe('A');
      expect(scoreToGrade(50)).toBe('B');
      expect(scoreToGrade(30)).toBe('C');
    });
  });

  // D2. 서클 교차 매칭
  describe('D2. 서클 교차 매칭', () => {
    test('MATCH-E2E-05: POST /api/broker/circles/[id]/match → match results', async () => {
      // 서클 교차 매칭 검색 결과 요청 테스트
      const res = await fetch(`${BASE_URL}/api/broker/circles/circle-123/match`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ targetDealId: "deal-456" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data.matches)).toBe(true);
    });

    test('MATCH-E2E-06: POST /api/broker/circles/[id]/match/[matchId]/approve → approval flow', async () => {
      // 서클 매칭 승인 플로우 테스트
      const res = await fetch(`${BASE_URL}/api/broker/circles/circle-123/match/match-789/approve`, {
        method: 'POST',
        headers: HEADERS
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.bothApproved).toBe(true);
      expect(data.revealedData.building.address).toBe('서울시 강남구 역삼동 123-45');
      expect(data.revealedData.buyer.company).toBe('(주)알파인베스트');
    });

    test('MATCH-E2E-06-NEG: POST /api/broker/circles/[id]/match/[matchId]/approve without auth returns 401 Unauthorized', async () => {
      const res = await fetch(`${BASE_URL}/api/broker/circles/circle-123/match/match-789/approve`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    test('MATCH-E2E-07: Test progressive disclosure: signal_only → basic_info → full_detail transitions', async () => {
      // 점진적 공개(Progressive Disclosure) 상태 변경 테스트
      const statuses = ['signal_only', 'basic_info', 'full_detail'];
      for (const status of statuses) {
        const res = await fetch(`${BASE_URL}/api/broker/circles/circle-123/match/match-789/disclosure`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ level: status })
        });
        expect(res.ok).toBe(true);
        const data = await res.json();
        expect(data.level).toBe(status);
      }
    });

    test('MATCH-E2E-07-NEG: Invalid disclosure level returns 400 Bad Request', async () => {
      const res = await fetch(`${BASE_URL}/api/broker/circles/circle-123/match/match-789/disclosure`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ level: 'invalid_level_xyz' })
      });
      expect(res.status).toBe(400);
    });
  });

  // D3. 페르소나 생성
  describe('D3. 페르소나 생성', () => {
    test('MATCH-E2E-08: POST /api/broker/ideal-buyer-persona → 3 persona archetypes', async () => {
      // 이상적인 매수자 페르소나 3종 생성 테스트
      const res = await fetch(`${BASE_URL}/api/broker/ideal-buyer-persona`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ dealId: "deal-100" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.personas).toHaveLength(3);
    });

    test('MATCH-E2E-09: GET/POST/DELETE /api/broker/deal-card/[id]/personas → CRUD operations', async () => {
      // 딜 카드 페르소나 CRUD 테스트
      
      // POST
      let res = await fetch(`${BASE_URL}/api/broker/deal-card/deal-100/personas`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ name: "수익형 투자자", type: "STABLE_INCOME" })
      });
      expect(res.ok).toBe(true);
      const { id } = await res.json();
      expect(id).toBeDefined();

      // GET
      res = await fetch(`${BASE_URL}/api/broker/deal-card/deal-100/personas`, { headers: HEADERS });
      expect(res.ok).toBe(true);

      // DELETE
      res = await fetch(`${BASE_URL}/api/broker/deal-card/deal-100/personas/${id}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      expect(res.ok).toBe(true);
    });
  });

  // D4. 매수자 메모 & 캠페인
  describe('D4. 매수자 메모 & 캠페인', () => {
    test('MATCH-E2E-10: POST /api/broker/buyer-memo/generate → kakao message + fitReasons + cautions', async () => {
      // 카카오톡 매수자 메모 생성 테스트
      const res = await fetch(`${BASE_URL}/api/broker/buyer-memo/generate`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ buyerId: "buyer-1", dealId: "deal-1" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('kakaoMessage');
      expect(data).toHaveProperty('fitReasons');
      expect(data).toHaveProperty('cautions');
    });

    test('MATCH-E2E-11: POST /api/broker/campaign → sms/instagram/blog copies', async () => {
      // 멀티 채널(SMS, IG, Blog) 캠페인 초안 생성 테스트
      const res = await fetch(`${BASE_URL}/api/broker/campaign`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ dealId: "deal-1" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('smsCopy');
      expect(data).toHaveProperty('instagramCopy');
      expect(data).toHaveProperty('blogCopy');
    });

    test('MATCH-E2E-12: POST /api/broker/pitch → warm/cold pitch messages', async () => {
      // Warm & Cold 피칭 메시지 생성 테스트
      const res = await fetch(`${BASE_URL}/api/broker/pitch`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ dealId: "deal-1", targetType: "cold" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('message');
    });
  });

  // D5. 임대 매칭
  describe('D5. 임대 매칭', () => {
    test('MATCH-E2E-13: POST /api/broker/lease-match → lease match result with grade', async () => {
      // 임대 매칭 엔진 API 실행 테스트
      const payload = {
        space: { id: "space-1", monthly_rent: 500, deposit: 5000 },
        intent: { id: "intent-1", budget_monthly_max: 600, budget_deposit_max: 6000 }
      };
      const res = await fetch(`${BASE_URL}/api/broker/lease-match`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('grade');
      expect(['S', 'A', 'B', 'C']).toContain(data.grade);
    });

    test('MATCH-E2E-13-NEG: Malformed payload to POST /api/broker/lease-match returns 400 Bad Request', async () => {
      const res = await fetch(`${BASE_URL}/api/broker/lease-match`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ malformed: true })
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    test('MATCH-E2E-14: Import and test runLeaseHardFilter with matching space+tenant', () => {
      // 임대 하드 필터 통과 케이스 테스트
      const result = runLeaseHardFilter({
        space: {
          id: 'space-test-1',
          floor: '3F',
          area_sqm: 100,
          space_type: 'office',
          deposit: 5000,
          monthly_rent: 500,
          maintenance_fee: 50,
          available_from: '2026-09-01',
          lease_term_months: 24,
          incentives: null,
          restrictions: [],
          area_signal: '강남구'
        },
        intent: {
          id: 'tenant-test-1',
          business_type: 'IT',
          preferred_regions: ['강남구'],
          area_min: 80,
          area_max: 120,
          budget_deposit_max: 6000,
          budget_monthly_max: 600,
          preferred_floors: ['3F'],
          move_in_target: '2026-09',
          must_have: [],
          nice_to_have: []
        }
      });
      expect(result.passed).toBe(true);
    });

    test('MATCH-E2E-15: Import and test runLeaseHardFilter with mismatched rent (should fail)', () => {
      // 임대 하드 필터 탈락 케이스 (예산 초과) 테스트
      const result = runLeaseHardFilter({
        space: {
          id: 'space-test-1',
          floor: '3F',
          area_sqm: 100,
          space_type: 'office',
          deposit: 5000,
          monthly_rent: 1000, // 1000만원
          maintenance_fee: 50,
          available_from: '2026-09-01',
          lease_term_months: 24,
          incentives: null,
          restrictions: [],
          area_signal: '강남구'
        },
        intent: {
          id: 'tenant-test-1',
          business_type: 'IT',
          preferred_regions: ['강남구'],
          area_min: 80,
          area_max: 120,
          budget_deposit_max: 6000,
          budget_monthly_max: 600, // 최대 600만원, 허용오차 20% 이내여도 1000만원은 오버
          preferred_floors: [],
          move_in_target: null,
          must_have: [],
          nice_to_have: []
        }
      });
      expect(result.passed).toBe(false);
      expect(result.failReasons.some(r => r.includes('월세 상한 초과'))).toBe(true);
    });
  });

  // D6. 예측 & 클러스터링
  describe('D6. 예측 & 클러스터링', () => {
    test('MATCH-E2E-16: POST /api/broker/prediction/cluster-buyers → cluster labels', async () => {
      // 매수자 인텐트 클러스터링 API 테스트
      const res = await fetch(`${BASE_URL}/api/broker/prediction/cluster-buyers`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ buyerIds: ["b1", "b2", "b3"] })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('clusters');
    });

    test('MATCH-E2E-17: POST /api/broker/prediction/price → price range', async () => {
      // 적정 거래가(Price Range) 예측 API 테스트
      const res = await fetch(`${BASE_URL}/api/broker/prediction/price`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ dealId: "deal-1" })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('predictedMin');
      expect(data).toHaveProperty('predictedMax');
    });

    test('MATCH-E2E-18: Import and test matchBuyerWithDeal from explainable-matcher.ts directly (S tier match)', () => {
      // 설명 가능한 매칭 엔진(Tier 매칭) S등급 부여 로직 테스트
      const result = matchBuyerWithDeal(
        {
          maxBudgetKrw: 10000000000, // 100억
          minYieldPct: 3.0,
          targetRegions: ['강남구', '서초구'],
          preferredArchetypes: ['STABLE_INCOME']
        },
        {
          dealId: 'd1',
          askingPriceKrw: 9000000000, // 90억
          capRatePct: 4.5,
          regionName: '강남구 역삼동',
          archetype: 'STABLE_INCOME'
        }
      );
      
      expect(result.isHardFilterPassed).toBe(true);
      expect(result.matchTier).toBe('S');
      expect(result.matchScore).toBeGreaterThanOrEqual(90);
    });
  });

});
