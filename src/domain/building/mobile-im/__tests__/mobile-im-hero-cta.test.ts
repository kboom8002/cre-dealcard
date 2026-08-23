// src/domain/building/mobile-im/__tests__/mobile-im-hero-cta.test.ts
import { describe, it, expect } from 'vitest';
import type { HeroCardData } from '@/domain/building/mobile-im/types';

describe('Mobile IM Hero Metrics & CTA Contracts (Phase 4.2)', () => {
  describe('Hero 2x2 Metric Grid Coverage', () => {
    it('HC-01: Income posture provides 4 key metrics', () => {
      const data: HeroCardData = {
        assetType: '소형빌딩',
        areaSignal: '강남구 역삼동',
        askingPriceDisplay: '100억 원',
        capRateBase: 4.2,
        noiBaseBil: 3.6,
        keyInvestmentPoint: '역삼역 도보 3분 입지 우수',
        keyRisk: '임차인 1개실 만기 도래',
        equityRequiredBil: 50.5,
        leveragedYieldPct: 5.2,
        readinessScore: 85,
        dcf10YearNpvBil: 12.5,
        posture: 'income',
      };

      expect(data.askingPriceDisplay).toBe('100억 원');
      expect(data.capRateBase).toBe(4.2);
      expect(data.equityRequiredBil).toBe(50.5);
      expect(data.readinessScore).toBe(85);
    });

    it('HC-02: Development posture provides land price and dev profit margin', () => {
      const data: HeroCardData = {
        assetType: '토지/개발부지',
        areaSignal: '성동구 성수동',
        askingPriceDisplay: '150억 원',
        capRateBase: null,
        noiBaseBil: null,
        keyInvestmentPoint: '준공업지역 신축 개발 최적지',
        keyRisk: '건축허가 사전심의 필요',
        equityRequiredBil: null,
        leveragedYieldPct: null,
        readinessScore: 80,
        dcf10YearNpvBil: null,
        posture: 'development',
        landPricePerPyeong: 120_000_000,
        zoning: '준공업지역',
        devProfitMarginPct: 18.5,
      };

      expect(data.landPricePerPyeong).toBe(120_000_000);
      expect(data.zoning).toBe('준공업지역');
      expect(data.devProfitMarginPct).toBe(18.5);
    });

    it('HC-03: OwnerOccupied posture provides savings and equity', () => {
      const data: HeroCardData = {
        assetType: '오피스/사옥',
        areaSignal: '영등포구 양평동',
        askingPriceDisplay: '80억 원',
        capRateBase: null,
        noiBaseBil: null,
        keyInvestmentPoint: '사옥 단독 브랜딩 및 주차 10대 확보',
        keyRisk: '일부 층 명도 협의 진행 중',
        equityRequiredBil: 35.0,
        leveragedYieldPct: null,
        readinessScore: 90,
        dcf10YearNpvBil: null,
        posture: 'owner_occupied',
        totalGrossAreaM2: 1200,
        ownVsLeaseSavingsBil: 2.5,
        breakevenYears: 14.0,
      };

      expect(data.totalGrossAreaM2).toBe(1200);
      expect(data.ownVsLeaseSavingsBil).toBe(2.5);
      expect(data.equityRequiredBil).toBe(35.0);
    });
  });
});
