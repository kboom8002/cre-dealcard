import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card4ConfirmCard } from '@/components/broker/deal-card/Card4ConfirmCard';
import { KakaoBubblePreview } from '@/components/broker/deal-card/KakaoBubblePreview';
import { PreSendConfirmationSheet } from '@/components/broker/deal-card/PreSendConfirmationSheet';
import type { Card4Data } from '@/lib/deal-card/card4-schema';

describe('WP-P1-05 & WP-P1-08 & WP-P1-09: Deal Card UI Components (Static HTML Rendering)', () => {
  const baseCard4: Card4Data = {
    headline: '연 4.2% 우량임차 만실 코너',
    posture: 'income',
    region: '강남구 신사동',
    use: '근린생활시설',
    area: '연면적 350평',
    gfaPyung: 350,
    landAreaPyung: 120,
    priceBand: '90~100억',
    points: ['대로변 코너 각지 위치', '전층 우량임차 만실 운영', '수익률 4.2% 안정적'],
    provenance: {
      points: ['public', 'broker', 'ai'],
    },
    card4_version: 1,
    card4_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  describe('Card4ConfirmCard (WP-P1-05)', () => {
    it('renders the 3 distinct visual sections (어떤 매물인가요?, 카톡 썸네일, 장점 3줄) and 4 thumbnail inputs', () => {
      const html = renderToStaticMarkup(
        <Card4ConfirmCard card4={baseCard4} onChange={vi.fn()} />
      );

      // Verify 3 visually separated sections
      expect(html).toContain('card4-section-posture');
      expect(html).toContain('card4-section-og-editor');
      expect(html).toContain('card4-section-detail-points');
      expect(html).toContain('어떤 매물인가요?');
      expect(html).toContain('카톡 썸네일');
      expect(html).toContain('장점 3줄');

      // Verify 4 quadrant items present in rendered HTML
      expect(html).toContain('강남구 신사동');
      expect(html).toContain('근린생활시설');
      expect(html).toContain('연면적 350평');
      expect(html).toContain('90~100억');
      expect(html).toContain('대로변 코너 각지 위치');
    });

    it('omits cluttered character counters (23/18자) and verbose pointBrief textareas', () => {
      const html = renderToStaticMarkup(
        <Card4ConfirmCard card4={baseCard4} onChange={vi.fn()} />
      );

      expect(html).not.toContain('/18자');
      expect(html).not.toContain('말줄임 주의');
      expect(html).not.toContain('card4-point-brief-0');
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

      expect(html).toContain('상세 지번(번지)은 건물 위치 보호를 위해 적을 수 없어요');
      expect(html).toContain('건물 고유 명칭(호산당빌딩)은 위치가 드러나므로 적을 수 없어요');
    });
  });

  describe('KakaoBubblePreview (WP-P1-08)', () => {
    it('renders 4-quadrant OG preview, 18-char appeal title without OG description, and recipient detail view with 3 points + broker profile + 2 fixed buttons', () => {
      const html = renderToStaticMarkup(<KakaoBubblePreview card4={baseCard4} />);

      // Verify 4-quadrant OG image items
      expect(html).toContain('og-quadrant-region');
      expect(html).toContain('og-quadrant-use');
      expect(html).toContain('og-quadrant-area');
      expect(html).toContain('og-quadrant-price');
      expect(html).toContain('강남구 신사동');
      expect(html).toContain('근린생활시설');
      expect(html).toContain('연면적 350평');
      expect(html).toContain('90~100억');

      // Verify 18-char appeal OG title and CTA button
      expect(html).toContain('연 4.2% 우량임차 만실 코너');
      expect(html).toContain('자세히 보기');

      // Verify mobile detail view with 3 points, broker profile, call button, and IM request button
      expect(html).toContain('dealcard-mobile-detail-scroll');
      expect(html).toContain('대로변 코너 각지 위치');
      expect(html).toContain('preview-broker-profile-card');
      expect(html).toContain('전화하기');
      expect(html).toContain('IM 요청하기');
    });
  });

  describe('PreSendConfirmationSheet (WP-P1-09 & WP-P1-10)', () => {
    it('renders the simplified pre-send confirmation modal with thumbnail summary and Kakao/link actions when isOpen is true', () => {
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

      expect(html).toContain('카톡으로 보낼까요?');
      expect(html).toContain('강남구 신사동');
      expect(html).toContain('근린생활시설');
      expect(html).toContain('연면적 350평');
      expect(html).toContain('90~100억');
      expect(html).toContain('카카오톡으로 보내기');
      expect(html).toContain('링크 복사');
      expect(html).not.toContain('SHA-256');
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
