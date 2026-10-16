import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseKoreanEokInput } from '@/components/magazine/RoiCalculator';
import { shouldHideBottomBar } from '@/components/ui/bottom-bar-logic';
import {
  cleanScoreText,
  DEFAULT_SECTIONS,
  sanitizeDealAddress,
} from '@/lib/magazine/view-helpers';
import { ViewerBottomBar } from '@/components/magazine/ViewerBottomBar';

vi.mock('next/script', () => ({ default: () => null }));

describe('60대 독자 UX 개선 — 단위 검증 (ux60-reader-viewer)', () => {
  describe('parseKoreanEokInput (수지분석 계산기 한국어 금액 파서)', () => {
    it('단순 숫자 문자열("50")을 억 단위로 파싱한다', () => {
      expect(parseKoreanEokInput('50')).toBe(50);
    });

    it('억 단위 접미사("25억", "25.5억")를 파싱한다', () => {
      expect(parseKoreanEokInput('25억')).toBe(25);
      expect(parseKoreanEokInput('25.5억')).toBe(25.5);
    });

    it('복합 한국어 금액("1억 5천", "1억 5천만원")을 1.5억으로 파싱한다', () => {
      expect(parseKoreanEokInput('1억 5천')).toBe(1.5);
      expect(parseKoreanEokInput('1억 5천만원')).toBe(1.5);
    });

    it('원 단위 숫자("3,200,000,000") 입력 시 자동으로 32억으로 환산한다', () => {
      expect(parseKoreanEokInput('3,200,000,000')).toBe(32);
      expect(parseKoreanEokInput(3_200_000_000)).toBe(32);
    });

    it('만원 단위("3,500만원") 입력을 0.35억으로 파싱한다', () => {
      expect(parseKoreanEokInput('3,500만원')).toBeCloseTo(0.35, 5);
    });

    it('빈 문자열이나 숫자가 없는 입력은 null을 반환한다', () => {
      expect(parseKoreanEokInput('')).toBeNull();
      expect(parseKoreanEokInput('가격문의')).toBeNull();
    });
  });

  describe('shouldHideBottomBar (가상 키보드 / 입력창 포커스 시 하단 바 즉시 숨김)', () => {
    it('inputFocused가 true이면 viewportRatio가 1.0이어도 즉시 true를 반환한다 (R-09)', () => {
      expect(shouldHideBottomBar({ inputFocused: true, viewportRatio: 1.0 })).toBe(true);
      expect(shouldHideBottomBar({ inputFocused: true, viewportRatio: 0.95 })).toBe(true);
    });

    it('inputFocused가 false여도 viewportRatio가 임계값 미만이면 숨긴다', () => {
      expect(shouldHideBottomBar({ inputFocused: false, viewportRatio: 0.7 })).toBe(true);
      expect(shouldHideBottomBar({ inputFocused: false, viewportRatio: 1.0 })).toBe(false);
    });
  });

  describe('cleanScoreText & sanitizeDealAddress (한국어 조사·가격 파편 정제)', () => {
    it('점수 토큰(62/100) 제거 후 남는 고아 조사("으로", "로", "이며")를 자연스럽게 정제한다', () => {
      expect(cleanScoreText('전반적인 시장 심리는 62/100으로 관망세입니다')).toBe(
        '전반적인 시장 심리는 관망세입니다',
      );
      expect(cleanScoreText('투심은 55/100로 보합세입니다')).toBe('투심은 보합세입니다');
      expect(cleanScoreText('지수는 70/100이며 매수 우위입니다')).toBe('지수는 매수 우위입니다');
    });

    it('evidence=true일 때는 원문 점수와 조사를 그대로 보존한다', () => {
      expect(cleanScoreText('전반적인 시장 심리는 62/100으로 관망세입니다', true)).toBe(
        '전반적인 시장 심리는 62/100으로 관망세입니다',
      );
    });

    it('주소 필드에 잘못 들어간 가격 파편("매각가 230", "매매 150억")을 "위치 문의 시 안내"로 정제한다', () => {
      expect(sanitizeDealAddress('매각가 230')).toBe('위치 문의 시 안내');
      expect(sanitizeDealAddress('매매 150억')).toBe('위치 문의 시 안내');
      expect(sanitizeDealAddress('매각가 인근')).toBe('위치 문의 시 안내');
      expect(sanitizeDealAddress('서울 강남구 역삼동 인근')).toBe('서울 강남구 역삼동 인근');
    });
  });

  describe('DEFAULT_SECTIONS & ViewerBottomBar SSR 초기 렌더 보장 (R-14)', () => {
    it('DEFAULT_SECTIONS는 골든 E2E 계약을 그대로 유지한다', () => {
      expect(DEFAULT_SECTIONS.all[0]).toBe('ai_briefing');
      expect(DEFAULT_SECTIONS.seller.indexOf('market_data')).toBeLessThan(
        DEFAULT_SECTIONS.seller.indexOf('featured_deals'),
      );
    });

    it('ViewerBottomBar는 SSR(renderToStaticMarkup)에서 즉시 nav[data-magazine-bottom-bar]와 3대 액션을 렌더한다', () => {
      const html = renderToStaticMarkup(
        React.createElement(ViewerBottomBar, {
          phone: '010-1234-5678',
          brokerSlug: 'kim-jung-gae',
          brokerName: '김중개',
          brokerId: 'kim-jung-gae',
          headline: '강남 빌딩 시황',
          date: '2026-09-20',
          dateLabel: '2026년 9월 20일 (일)',
          target: 'all',
        }),
      );
      expect(html).toContain('aria-label="상담·공유 바로가기"');
      expect(html).toContain('data-magazine-bottom-bar');
      expect(html).toContain('href="tel:01012345678"');
      expect(html).toContain('전화 상담');
      expect(html).toContain('IM 요청');
      expect(html).toContain('공유');
    });
  });
});
