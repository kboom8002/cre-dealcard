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
      expect(result.fallbackRegionNotice).toContain('구 단위');
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

  describe('H-13 Hardening: Phone, Email, Full-Name Titles, Compact Road/Parcel, N-ga & Spaced Building Names', () => {
    it('detects and masks phone numbers and emails before hyphenated parcel numbers', () => {
      const raw = [
        '직통 문의 010-1234-5678 또는 02-555-7890 연락 요망',
        '담당자 메일 broker.kim@credeal.co.kr 로 자료 요청',
        '국제전화 +82-10-9876-5432 가능',
      ];
      const validation = validateBlindPoints(raw);
      expect(validation.isValid).toBe(false);
      expect(validation.violations.some((v) => v.keyword === '010-1234-5678')).toBe(true);
      expect(validation.violations.some((v) => v.keyword === 'broker.kim@credeal.co.kr')).toBe(true);

      const cleaned = cleanBlindPoints(raw);
      expect(cleaned[0]).toContain('[연락처 비공개]');
      expect(cleaned[0]).not.toContain('010-1234-5678');
      expect(cleaned[0]).not.toContain('02-555-7890');
      expect(cleaned[0]).not.toContain('OO-OO');
      expect(cleaned[1]).toContain('[이메일 비공개]');
      expect(cleaned[1]).not.toContain('broker.kim@credeal.co.kr');
      expect(cleaned[2]).toContain('[연락처 비공개]');
      expect(cleaned[2]).not.toContain('9876-5432');
    });

    it('catches 2-4 char Korean full names + title without false positives on generic phrases', () => {
      const leaks = [
        '홍길동 대표 직접 보유 매물',
        '김철수 사장님 사옥 매각',
        '박영희 원장님 메디컬 운영',
        '이민수 건물주 급매',
        '최진호 임대인 조건 협의',
      ];
      const res = validateBlindPoints(leaks);
      expect(res.isValid).toBe(false);
      expect(res.violations.length).toBeGreaterThanOrEqual(5);

      const cleaned = cleanBlindPoints(leaks);
      for (const line of cleaned) {
        expect(line).toContain('관계자');
      }
      expect(cleaned[0]).not.toContain('홍길동');
      expect(cleaned[1]).not.toContain('김철수');
      expect(cleaned[2]).not.toContain('박영희');
      expect(cleaned[3]).not.toContain('이민수');
      expect(cleaned[4]).not.toContain('최진호');

      const safe = [
        '대표 매물 추천 수익형 자산',
        '임대인 협의 후 명도 가능',
        '기존 임대인 조건 승계 가능',
      ];
      const safeRes = validateBlindPoints(safe);
      expect(safeRes.isValid).toBe(true);
      expect(safeRes.violations).toHaveLength(0);
    });

    it('masks compact road/dong numbers and N-ga parcels properly', () => {
      const raw = [
        '테헤란로87길36 코너 위치',
        '역삼동823 대로변 상권',
        '성수동 1가 656 인근 코너',
      ];
      const res = validateBlindPoints(raw);
      expect(res.isValid).toBe(false);
      expect(res.violations).toHaveLength(3);

      const cleaned = cleanBlindPoints(raw);
      expect(cleaned[0]).toBe('테헤란로87길 인근 코너 위치');
      expect(cleaned[1]).toBe('역삼동 인근 대로변 상권');
      expect(cleaned[2]).toBe('성수동 1가 인근 코너');
      expect(cleaned[2]).not.toContain('인근가');
    });

    it('catches spaced proper building names, 1-char Latin prefixes, and expanded suffixes while allowing generic phrases', () => {
      const leaks = [
        '더 레드 빌딩 통매각',
        '호산당 빌딩 1층 상가',
        '삼원 타워 역세권 오피스',
        'W타워 인근 코너 매물',
        'K빌딩 급매 추천',
        '아크로 빌라 신축',
        '래미안 오피스텔 임대',
        '센트럴 파크 인접',
        '코엑스 몰 배후 상권',
        '세이브존 회관 앞',
        '대성 사옥 통임대',
      ];
      const res = validateBlindPoints(leaks);
      expect(res.isValid).toBe(false);
      expect(res.violations.length).toBeGreaterThanOrEqual(leaks.length);

      const cleaned = cleanBlindPoints(leaks);
      expect(cleaned[0]).toBe('OO빌딩 통매각');
      expect(cleaned[1]).toBe('OO빌딩 1층 상가');
      expect(cleaned[2]).toBe('OO타워 역세권 오피스');
      expect(cleaned[3]).toBe('OO타워 인근 코너 매물');
      expect(cleaned[4]).toBe('OO빌딩 급매 추천');
      expect(cleaned[5]).toBe('OO빌라 신축');
      expect(cleaned[6]).toBe('OO오피스텔 임대');
      expect(cleaned[7]).toBe('OO파크 인접');
      expect(cleaned[8]).toBe('OO몰 배후 상권');
      expect(cleaned[9]).toBe('OO회관 앞');
      expect(cleaned[10]).toBe('OO사옥 통임대');

      const safe = [
        '신축 빌딩 통임대 매매',
        '꼬마 빌딩 급매 추천',
        '근생 빌딩 수익형 매물',
        '수익형 오피스텔 만실 운영',
        '단독 사옥 활용 최적 입지',
      ];
      const safeRes = validateBlindPoints(safe);
      expect(safeRes.isValid).toBe(true);
      expect(safeRes.violations).toHaveLength(0);
    });
  });
});
