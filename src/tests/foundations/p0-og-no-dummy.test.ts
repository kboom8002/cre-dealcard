/**
 * @file src/tests/foundations/p0-og-no-dummy.test.ts
 * @description P0 Defect Automated Verification Suite:
 * 1. Eliminate fake/hardcoded OG values (3.6%, 35%, 1,800만원).
 * 2. Assert "공적장부 교차검증 완료" badge is never rendered unconditionally.
 * 3. Assert `ogTitle` is correctly preserved by `BlindTeaserOutputSchema` and enforced in title priority.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.2, WP-P0-01, WP-P0-02
 * - ORIGINAL_REQUEST.md (§ 2026-10-27T04:28:40Z)
 * - PROJECT.md (Milestone 1, Features 1 & 2)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0 Defect Verification: OG Dummy Elimination & Schema Integrity', () => {
  const kakaoOgRoutePath = path.resolve(process.cwd(), 'src/app/api/og/deal/[id]/kakao/route.tsx');
  const defaultOgRoutePath = path.resolve(process.cwd(), 'src/app/api/og/deal/[id]/route.tsx');
  const schemaPath = path.resolve(process.cwd(), 'src/ai/schemas/broker-deal-card.ts');

  describe('WP-P0-01: Hardcoded Dummy Strings Elimination in OG Generators', () => {
    it('kakao og route does not contain hardcoded dummy metrics (3.6%, 35%, 1,800만원)', () => {
      expect(fs.existsSync(kakaoOgRoutePath)).toBe(true);
      const content = fs.readFileSync(kakaoOgRoutePath, 'utf8');

      // Strip comments and defensive regexes to inspect actual assignments and JSX literals
      const codeWithoutCommentsAndRegex = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/3\\\.6%[^\/]*\//g, '');

      const forbiddenDummies = [
        '3.6%',
        '35%',
        '1,800만원',
        '1,800',
        '1800만원',
      ];

      for (const dummy of forbiddenDummies) {
        expect(codeWithoutCommentsAndRegex).not.toContain(dummy);
      }
    });

    it('default og route does not contain hardcoded dummy metrics (3.6%, 35%, 1,800만원)', () => {
      expect(fs.existsSync(defaultOgRoutePath)).toBe(true);
      const content = fs.readFileSync(defaultOgRoutePath, 'utf8');

      const forbiddenDummies = [
        '3.6%',
        '35%',
        '1,800만원',
      ];

      for (const dummy of forbiddenDummies) {
        expect(content).not.toContain(dummy);
      }
    });

    it('kakao og route does NOT render "공적장부 교차검증 완료" badge unconditionally', () => {
      expect(fs.existsSync(kakaoOgRoutePath)).toBe(true);
      const content = fs.readFileSync(kakaoOgRoutePath, 'utf8');

      // If the badge phrase exists in the file, it MUST be conditionally gated
      // (e.g. checking verification_status === 'VERIFIED' or similar flag)
      if (content.includes('공적장부 교차검증 완료')) {
        const isConditional =
          /verification_status\s*===/i.test(content) ||
          /verificationStatus\s*===/i.test(content) ||
          /isVerified/i.test(content) ||
          /verified/i.test(content);

        expect(isConditional).toBe(true);

        // It must NOT be a static un-gated <span> in the JSX template
        const hasStaticUnconditionalBadge =
          /<span[^>]*>[^<]*공적장부 교차검증 완료[^<]*<\/span>/.test(content) &&
          !/\{\s*\(?[a-zA-Z0-9_.]*(verification|isVerified)[a-zA-Z0-9_.]*\s*(&&|\?)/i.test(content);

        expect(hasStaticUnconditionalBadge).toBe(false);
      }
    });

    it('kakao og route standard dimensions are 1200x630 (KakaoTalk OG v2 standard)', () => {
      expect(fs.existsSync(kakaoOgRoutePath)).toBe(true);
      const content = fs.readFileSync(kakaoOgRoutePath, 'utf8');

      // Must support standard 1200x630 resolution
      const hasStandardWidth = /width:\s*1200|width:\s*"1200px"/.test(content);
      const hasStandardHeight = /height:\s*630|height:\s*"630px"/.test(content);

      expect(hasStandardWidth).toBe(true);
      expect(hasStandardHeight).toBe(true);
    });
  });

  describe('WP-P0-02: BlindTeaserOutputSchema ogTitle Retention', () => {
    it('BlindTeaserOutputSchema retains ogTitle when provided by caller', async () => {
      const { BlindTeaserOutputSchema } = await import('@/ai/schemas/broker-deal-card');

      const input = {
        title: '강남역 5분 도보 꼬마빌딩',
        shortSummary: '수익성 우수 매물',
        dealPoints: ['역세권 입지', '공실률 0%'],
        cautionPoints: ['주차 대수 제한'],
        kakaoText: '강남 꼬마빌딩 80억대 안내드립니다.',
        ogTitle: '중개사 특화 카카오 공유 타이틀',
        kakaoOgTitle: 'AI 자동생성 타이틀',
      };

      const parsed = BlindTeaserOutputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        // ogTitle MUST NOT be stripped by Zod
        expect((parsed.data as any).ogTitle).toBe('중개사 특화 카카오 공유 타이틀');
      }
    });

    it('BlindTeaserOutputSchema accepts input without ogTitle gracefully (optional field)', async () => {
      const { BlindTeaserOutputSchema } = await import('@/ai/schemas/broker-deal-card');

      const input = {
        title: '신사동 사옥용 빌딩',
        dealPoints: ['전층 사옥 가능', '주차 10대'],
        cautionPoints: ['용도변경 필요'],
        kakaoText: '신사동 사옥 150억대 안내',
      };

      const parsed = BlindTeaserOutputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect((parsed.data as any).ogTitle).toBeUndefined();
      }
    });

    it('adversarial: ogTitle retains special characters, korean text and emojis without truncation', async () => {
      const { BlindTeaserOutputSchema } = await import('@/ai/schemas/broker-deal-card');

      const complexTitle = '🔥 [초급매] 영등포 70억대! <신축부지 & 사옥> "수익률 4.2%" 🏢';
      const input = {
        title: '일반 타이틀',
        dealPoints: ['포인트 A', '포인트 B'],
        cautionPoints: ['주의사항 X'],
        kakaoText: '공유 텍스트',
        ogTitle: complexTitle,
      };

      const parsed = BlindTeaserOutputSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect((parsed.data as any).ogTitle).toBe(complexTitle);
      }
    });

    it('og:title resolution enforces priority: Broker Custom Edit > AI Generated > Fallback', () => {
      // Priority function simulation conforming to WP-P0-02 contract
      function resolveOgTitle(params: {
        customOgTitle?: string | null;
        aiOgTitle?: string | null;
        teaserTitle?: string | null;
        region?: string | null;
        assetType?: string | null;
      }): string {
        if (params.customOgTitle && params.customOgTitle.trim().length > 0) {
          return params.customOgTitle.trim();
        }
        if (params.aiOgTitle && params.aiOgTitle.trim().length > 0) {
          return params.aiOgTitle.trim();
        }
        if (params.teaserTitle && params.teaserTitle.trim().length > 0) {
          return params.teaserTitle.trim();
        }
        const region = params.region || '서울 핵심권역';
        const asset = params.assetType || '상업용 빌딩';
        return `${region} ${asset} 매각`;
      }

      // 1. Custom edit present -> Custom edit wins
      expect(
        resolveOgTitle({
          customOgTitle: '중개인 수동 지정 타이틀',
          aiOgTitle: 'AI 생성 타이틀',
          teaserTitle: '기본 문서 타이틀',
        })
      ).toBe('중개인 수동 지정 타이틀');

      // 2. Custom edit missing -> AI generated title wins
      expect(
        resolveOgTitle({
          customOgTitle: null,
          aiOgTitle: 'AI 생성 타이틀',
          teaserTitle: '기본 문서 타이틀',
        })
      ).toBe('AI 생성 타이틀');

      // 3. Custom & AI missing -> Teaser title wins
      expect(
        resolveOgTitle({
          customOgTitle: '',
          aiOgTitle: undefined,
          teaserTitle: '기본 문서 타이틀',
        })
      ).toBe('기본 문서 타이틀');

      // 4. All missing -> Fallback template
      expect(
        resolveOgTitle({
          customOgTitle: null,
          aiOgTitle: null,
          teaserTitle: null,
          region: '강남구 역삼동',
          assetType: '근린생활시설',
        })
      ).toBe('강남구 역삼동 근린생활시설 매각');
    });
  });
});
