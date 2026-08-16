import { describe, test, expect } from 'vitest';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { computePromotionScore } from '@/domain/promotion/promotion-ranker';

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('Deal Card Pipeline E2E (딜카드 파이프라인 E2E)', () => {
  let createdBuildingId = '';
  let createdDealCardId = '';

  describe('A1. 메모→딜카드 생성 (DC-E2E-01~03)', () => {
    test('DC-E2E-01: 유효한 메모로 딜카드 생성 성공 (POST /api/broker/deal-card/from-memo)', async () => {
      if (AUTH_TOKEN === 'dummy-token') return;
      
      const payload = {
        memo: "강남구 역삼동 123-45 빌딩 매매 100억. 연면적 500평, 대지면적 150평. 엘리베이터 1대, 주차 5대 가능.",
        visibilityPreference: "blind"
      };

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buildingId).toBeDefined();
      expect(data.signalCardId).toBeDefined();

      createdBuildingId = data.buildingId;
      createdDealCardId = data.signalCardId;
    });

    test('DC-E2E-02: 너무 짧은 메모로 딜카드 생성 실패 (POST /api/broker/deal-card/from-memo)', async () => {
      if (AUTH_TOKEN === 'dummy-token') return;

      const payload = {
        memo: "역삼동",
        visibilityPreference: "blind"
      };

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      // 너무 짧은 메모는 reject 되어야 함
      expect(res.status).not.toBe(200);
    });

    test('DC-E2E-03: 개인정보(PII)가 포함된 메모로 생성 시 마스킹/제거 확인 (POST /api/broker/deal-card/from-memo)', async () => {
      if (AUTH_TOKEN === 'dummy-token') return;

      const payload = {
        memo: "강남구 역삼동 빌딩 매매. 소유자 홍길동(010-1234-5678). 수익률 5%.",
        visibilityPreference: "blind"
      };

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      // 개인정보(PII)가 응답 데이터에서 마스킹/제거되었는지 확인
      expect(data.hiddenFields).toBeDefined();
      expect(JSON.stringify(data)).not.toContain('010-1234-5678');
    });
  });

  describe('A2. 딜카드 편집 (DC-E2E-04~05)', () => {
    test('DC-E2E-04: 딜카드 제목 수정 성공 (PATCH /api/broker/deal-card/[id])', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const payload = {
        title: "역삼동 초역세권 수익형 빌딩 (수정됨)"
      };

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/${createdDealCardId}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
    });

    test('DC-E2E-05: 카카오톡 공유용 텍스트 수정 성공 (PATCH /api/broker/deal-card/[id])', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const payload = {
        kakaoText: "[강남 빌딩 매매] 역삼동 100억, 수익률 5% 보장"
      };

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/${createdDealCardId}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
    });
  });

  describe('A3. 파이프라인 상태 (DC-E2E-06~07)', () => {
    test('DC-E2E-06: 파이프라인 상태 전진 성공 - gate_requested (POST /api/broker/buildings/[id]/pipeline)', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdBuildingId) return;

      const payload = {
        transitionTo: "gate_requested"
      };

      const res = await fetch(`${BASE_URL}/api/broker/buildings/${createdBuildingId}/pipeline`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
    });

    test('DC-E2E-07: 파이프라인 상태 후진 불가 방어 확인 (POST /api/broker/buildings/[id]/pipeline)', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdBuildingId) return;

      // 이미 gate_requested 상태이므로, 이전 상태인 deal_card_created 등으로 이동 시도
      const payload = {
        transitionTo: "deal_card_created"
      };

      const res = await fetch(`${BASE_URL}/api/broker/buildings/${createdBuildingId}/pipeline`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
      });

      // 후진 전환은 reject 되어야 함
      expect(res.status).not.toBe(200);
    });
  });

  describe('A4. 등급 & 스코어 (DC-E2E-08~10)', () => {
    test('DC-E2E-08: computeDataGrade - 필수 데이터 모두 포함 시 Grade A 산출', () => {
      const fullData = {
        pnu: '1168010100',
        address: '서울시 강남구 역삼동',
        landAreaPyung: 100,
        totalFloorAreaPyung: 300,
        askingPriceKrw: 10000000000,
        zoningRegion: '일반상업지역',
        grossAnnualIncomeKrw: 500000000,
        approvalDate: '2020-01-01',
        farHeadroomPp: 50,
        evictionStatus: '명도완료',
        rentRoll: '첨부됨',
        officialLandPricePerSqm: 10000000,
        roadContactType: '광대로 한면',
        parkingCapacity: 10
      };

      const identity = { assetType: 'commercial', investmentPosture: 'income' };
      const result = computeDataGrade(fullData, identity);

      // 데이터가 충분하므로 A등급(85점 이상)을 기대
      expect(result.grade).toBe('A');
      expect(result.scorePct).toBeGreaterThanOrEqual(85);
    });

    test('DC-E2E-09: computeDataGrade - 최소 데이터만 포함 시 Grade D 산출', () => {
      const minimalData = {
        address: '서울시 강남구 역삼동'
      };

      const identity = { assetType: 'commercial', investmentPosture: 'income' };
      const result = computeDataGrade(minimalData, identity);

      // 데이터가 부족하므로 D등급(40점 미만)을 기대
      expect(result.grade).toBe('D');
      expect(result.scorePct).toBeLessThan(40);
    });

    test('DC-E2E-10: computePromotionScore - 스코어 범위 [0,1] 검증', () => {
      const input = {
        dealCuriosityScore: 85,
        matchedBuyerCount: 5,
        inquiryCount: 3,
        vacancyDemandVerified: true,
        createdAt: new Date().toISOString()
      };

      const result = computePromotionScore(input);

      // 프로모션 스코어는 0과 1 사이여야 함
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('A5. 블라인드 티저 (DC-E2E-11~12)', () => {
    test('DC-E2E-11: 블라인드 티저 발행 성공 (POST /api/broker/deal/[id]/teaser/publish)', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const res = await fetch(`${BASE_URL}/api/broker/deal/${createdDealCardId}/teaser/publish`, {
        method: 'POST',
        headers: HEADERS
      });

      expect(res.status).toBe(200);
      // 발행 상태 확인 등
    });

    test('DC-E2E-12: 공개된 티저 접근 시 주소 마스킹 확인 (GET /api/public/teaser/[id])', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const res = await fetch(`${BASE_URL}/api/public/teaser/${createdDealCardId}`, {
        method: 'GET'
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      // 공개 엔드포인트에서는 상세 번지수 등 주소가 마스킹되어야 함
      if (data.address) {
        expect(data.address).not.toMatch(/\d+-\d+/);
      }
    });
  });

  describe('A6. 딜카드 삭제 (DC-E2E-13~14)', () => {
    test('DC-E2E-13: 딜카드 삭제 성공 (DELETE /api/broker/deal-card/[id]/delete)', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/${createdDealCardId}/delete`, {
        method: 'DELETE',
        headers: HEADERS
      });

      expect(res.status).toBe(200);
    });

    test('DC-E2E-14: 삭제된 딜카드 재접근 시 404 반환 확인 (GET /api/broker/deal-card/[id])', async () => {
      if (AUTH_TOKEN === 'dummy-token' || !createdDealCardId) return;

      const res = await fetch(`${BASE_URL}/api/broker/deal-card/${createdDealCardId}`, {
        method: 'GET',
        headers: HEADERS
      });

      // 삭제된 카드는 조회 시 404를 반환해야 함
      expect(res.status).toBe(404);
    });
  });
});
