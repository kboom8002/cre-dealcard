import { describe, it, expect } from 'vitest';
import {
  validateBlindPoints,
  cleanBlindPoints,
  checkAreaKAnonymity,
  suggestFallbackRegion,
} from '@/lib/deal-card/blind-guard';

describe('WP-P1-02: Blind-Guard & k-Anonymity Validation', () => {
  describe('Violation Detection', () => {
    it('rejects exact parcel numbers and street numbers (e.g. 11-47, 117-3번지)', () => {
      const points = [
        '당산동 117-3번지 신축 빌딩',
        '역세권 11-47 (호산당빌딩)',
        '안정적 임대수익률 4.2%',
      ];
      const result = validateBlindPoints(points);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      expect(result.violations.some((v) => v.reason.includes('지번'))).toBe(true);
    });

    it('rejects building names (e.g. 호산당빌딩, 삼원타워, 대성스퀘어)', () => {
      const points = [
        '역삼동 삼원타워 인근 위치',
        '호산당빌딩 1층 상가 매매',
        '대성스퀘어 프라자 상권',
      ];
      const result = validateBlindPoints(points);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.reason.includes('고유 명칭'))).toBe(true);
    });

    it('rejects unique tenant brands (e.g. 스타벅스, 맥도날드, 올리브영)', () => {
      const points = [
        '1층 스타벅스 직영점 장기 임차',
        '맥도날드 DT 매장 입점 완료',
        '대로변 우수 상권',
      ];
      const result = validateBlindPoints(points);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.keyword === '스타벅스')).toBe(true);
      expect(result.violations.some((v) => v.keyword === '맥도날드')).toBe(true);
    });

    it('rejects owner/PII terms (소유주, 대표자 등)', () => {
      const points = [
        '소유주 급매 요청 물건',
        '대표자 직접 상담 가능',
        '대지 150평 규모',
      ];
      const result = validateBlindPoints(points);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.reason.includes('소유권'))).toBe(true);
    });
  });

  describe('Negative Whitelist (Preserving Legitimate Commercial Metrics)', () => {
    it('does NOT falsely reject standard metrics and descriptions', () => {
      const safePoints = [
        '역 도보 3분 초역세권 대로변 위치',
        '수익률 3.1% 및 보증금 3억 / 월세 1,500만',
        '대지 120평 연면적 350평 (B1~5F) 2018년 준공',
      ];
      const result = validateBlindPoints(safePoints);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('does NOT falsely reject generic terms like 올근생, 꼬마빌딩, 신축빌딩', () => {
      const safePoints = [
        '올근생 신축 빌딩 통임대',
        '수익형 꼬마빌딩 급매 추천',
        '관리 우수한 근생 빌딩',
      ];
      const result = validateBlindPoints(safePoints);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('k-Anonymity Dong->Gu Fallback', () => {
    it('triggers fallback when region building density is low (k < 5)', () => {
      const result = validateBlindPoints(
        ['역세권 입지', '수익형 매물', '안정적 수익'],
        {
          region: '영등포구 양평동',
          assetType: '근린생활시설',
          buildingCountInRegion: 2, // k < 5
        }
      );

      expect(result.requiresDongToGuFallback).toBe(true);
      expect(result.fallbackRegionNotice).toContain('k-익명성');
      expect(result.suggestedRegion).toBe('영등포구');
    });

    it('triggers fallback for rare asset types (hotel, hospital, logistics) regardless of count', () => {
      const result = validateBlindPoints(
        ['역세권 입지', '수익형 매물', '안정적 수익'],
        {
          region: '강남구 역삼동',
          assetType: '호텔',
          buildingCountInRegion: 10,
        }
      );

      expect(result.requiresDongToGuFallback).toBe(true);
      expect(result.suggestedRegion).toBe('강남구');
    });

    it('does not trigger fallback when density >= 5 and normal asset type', () => {
      const result = validateBlindPoints(
        ['역세권 입지', '수익형 매물', '안정적 수익'],
        {
          region: '강남구 신사동',
          assetType: '근린생활시설',
          buildingCountInRegion: 15,
        }
      );

      expect(result.requiresDongToGuFallback).toBe(false);
      expect(result.suggestedRegion).toBe('강남구 신사동');
    });

    it('suggestFallbackRegion converts Dong to Gu properly', () => {
      expect(suggestFallbackRegion('서울특별시 영등포구 양평동')).toBe('서울특별시 영등포구');
      expect(suggestFallbackRegion('강남구 역삼동')).toBe('강남구');
      expect(suggestFallbackRegion('서초구')).toBe('서초구');
    });
  });

  describe('cleanBlindPoints Sanitization', () => {
    it('masks parcel numbers and sensitive building names', () => {
      const raw = [
        '117-3번지 호산당빌딩 매매',
        '1층 스타벅스 입점 완료',
        '소유주 급매 진행',
      ];
      const cleaned = cleanBlindPoints(raw);

      expect(cleaned[0]).not.toContain('117-3번지');
      expect(cleaned[0]).not.toContain('호산당빌딩');
      expect(cleaned[1]).not.toContain('스타벅스');
      expect(cleaned[2]).not.toContain('소유주');
    });
  });
});
