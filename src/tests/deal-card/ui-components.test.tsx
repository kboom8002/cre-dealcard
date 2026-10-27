import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card4ConfirmCard } from '@/components/broker/deal-card/Card4ConfirmCard';
import { KakaoBubblePreview } from '@/components/broker/deal-card/KakaoBubblePreview';
import { PreSendConfirmationSheet } from '@/components/broker/deal-card/PreSendConfirmationSheet';
import type { Card4Data } from '@/lib/deal-card/card4-schema';

describe('WP-P1-05 & WP-P1-08 & WP-P1-09: Deal Card UI Components (Static HTML Rendering)', () => {
  const baseCard4: Card4Data = {
    region: '강남구 신사동',
    use: '근린생활시설',
    priceBand: '90~100억',
    points: ['대로변 코너 각지 위치', '대지 120평 연면적 350평', '수익률 4.2% 안정적'],
    provenance: {
      points: ['public', 'broker', 'ai'],
    },
    card4_version: 1,
    card4_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  describe('Card4ConfirmCard (WP-P1-05)', () => {
    it('renders the 4 core items and provenance badges', () => {
      const html = renderToStaticMarkup(
        <Card4ConfirmCard card4={baseCard4} onChange={vi.fn()} />
      );

      // Verify 4 items present in rendered HTML
      expect(html).toContain('강남구 신사동');
      expect(html).toContain('근린생활시설');
      expect(html).toContain('90~100억');
      expect(html).toContain('대로변 코너 각지 위치');

      // Verify provenance badges
      expect(html).toContain('공적장부');
      expect(html).toContain('직접입력');
      expect(html).toContain('AI제안');
    });

    it('shows character counter warning alert when point exceeds 18 chars', () => {
      const longPointCard: Card4Data = {
        ...baseCard4,
        points: [
          '이 문장은 열여덟 글자를 훨씬 초과하여 작성된 아주 긴 특징입니다',
          '정상 길이 특징입니다',
          '추천 근생 매물',
        ],
      };

      const html = renderToStaticMarkup(
        <Card4ConfirmCard card4={longPointCard} onChange={vi.fn()} />
      );

      // Warning label about mobile bubble truncation
      expect(html).toContain('말풍선 말줄임 위험');
    });

    it('displays blind-guard violation warning when parcel number or building name is entered', () => {
      const violatedCard: Card4Data = {
        ...baseCard4,
        points: [
          '당산동 117-3번지 호산당빌딩 급매',
          '정상 특징 문구',
          '수익률 4.0%',
        ],
      };

      const html = renderToStaticMarkup(
        <Card4ConfirmCard card4={violatedCard} onChange={vi.fn()} />
      );

      expect(html).toContain('상세 지번(번지)은 블라인드 보안을 위해 기재할 수 없습니다');
      expect(html).toContain('건물 고유 명칭(호산당빌딩)은 블라인드 원칙에 위배됩니다');
    });
  });

  describe('KakaoBubblePreview (WP-P1-08)', () => {
    it('renders the bubble preview with title, bullet points and CTA button', () => {
      const html = renderToStaticMarkup(<KakaoBubblePreview card4={baseCard4} />);

      // Verify preview title and bullet points
      expect(html).toContain('강남구 신사동 근린생활시설 90~100억');
      expect(html).toContain('대로변 코너 각지 위치');
      expect(html).toContain('대지 120평 연면적 350평');
      expect(html).toContain('자세히 보기');
      expect(html).toContain('카카오톡 공유 말풍선 미리보기');
    });
  });

  describe('PreSendConfirmationSheet (WP-P1-09 & WP-P1-10)', () => {
    it('renders the 4-step checklist and send action buttons when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <PreSendConfirmationSheet
          isOpen={true}
          onClose={vi.fn()}
          card4={baseCard4}
          dealId="deal-999"
          isSaved={true}
          onFlushSave={vi.fn(async () => true)}
        />
      );

      // Verify 4 steps are displayed
      expect(html).toContain('1단계: 서버 저장 반영');
      expect(html).toContain('2단계: 딜카드 버전 해시 확정');
      expect(html).toContain('3단계: 블라인드 안심 점검');
      expect(html).toContain('4단계: 발송 대상 선택');

      // Verify 3 send action buttons
      expect(html).toContain('나에게 먼저 보내기');
      expect(html).toContain('고객에게 보내기');
      expect(html).toContain('딜카드 공개 링크 1초 복사');
    });

    it('renders null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <PreSendConfirmationSheet
          isOpen={false}
          onClose={vi.fn()}
          card4={baseCard4}
          dealId="deal-999"
          isSaved={true}
          onFlushSave={vi.fn(async () => true)}
        />
      );

      expect(html).toBe('');
    });
  });
});
