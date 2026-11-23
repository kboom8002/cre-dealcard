import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_LEGAL_CONFIG,
  SUB_PROCESSORS,
  hasPlaceholderLegalConfig,
} from '@/config/company-legal';
import PrivacyPage, { metadata as privacyMetadata } from '@/app/(public)/privacy/page';
import TermsPage, { metadata as termsMetadata } from '@/app/(public)/terms/page';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import {
  polishImCopyWithLexicon,
  polishImCopyWithLexiconSync,
} from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { applyLexiconFilter } from '@/domain/building/mobile-im/presentation/cre-lexicon-filter';
import {
  DEMO_MOBILE_IM_DATA,
  SEOCHO_MEDICAL_DEMO,
} from '@/lib/demo/mobile-im-demo-data';
import { FULL_LOOP_V2_ALL_STEPS } from '@/lib/testguide/full-loop-v2-holdout-data';
import { BROKER_FULL_LOOP_ALL_STEPS } from '@/lib/testguide/broker-full-loop-data';
import nextConfig from '../../../next.config';

describe('Wave 3 A6: Legal Config, Domain/CSP, Lexicon ("배당"), and 4-Guide Label Sync', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('A6-07, A6-02, A6-08: Legal SSOT, D4 Codename Removal, Metadata Titles, UpgradeModal & next.config.ts', () => {
    it('provides verified 제이에스부동산중개(주) defaults & credeal.net emails when env vars are unset', () => {
      vi.stubEnv('NEXT_PUBLIC_COMPANY_NAME', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_CEO', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_BIZ_NO', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', '');
      vi.stubEnv('NEXT_PUBLIC_PRIVACY_OFFICER_NAME', '');
      vi.stubEnv('NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL', '');
      vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', '');

      expect(COMPANY_LEGAL_CONFIG.serviceName).toBe('크리딜 (CREDEAL)');
      expect(COMPANY_LEGAL_CONFIG.domain).toBe('credeal.net');
      expect(COMPANY_LEGAL_CONFIG.companyName).toBe('제이에스부동산중개(주)');
      expect(COMPANY_LEGAL_CONFIG.representativeName).toBe('차상혁');
      expect(COMPANY_LEGAL_CONFIG.businessRegNumber).toBe('114-87-22003');
      expect(COMPANY_LEGAL_CONFIG.address).toBe(
        '서울특별시 서초구 강남대로85길 5, 대유빌딩 3층 (반포동)',
      );
      expect(COMPANY_LEGAL_CONFIG.privacyOfficerName).toBe('차상혁 (대표이사)');
      expect(COMPANY_LEGAL_CONFIG.privacyContactEmail).toBe('privacy@credeal.net');
      expect(COMPANY_LEGAL_CONFIG.supportEmail).toBe('support@credeal.net');
      expect(COMPANY_LEGAL_CONFIG.effectiveDate).toBe('2026년 11월 23일');
      expect(hasPlaceholderLegalConfig()).toBe(false);
    });

    it('detects placeholder values or empty bizNo via hasPlaceholderLegalConfig()', () => {
      expect(
        hasPlaceholderLegalConfig({
          companyName: '제이에스부동산중개(주)',
          representativeName: '대표자 별도 고지',
          businessRegNumber: '114-87-22003',
          address: '서울특별시 서초구 강남대로85길 5, 대유빌딩 3층 (반포동)',
          privacyOfficerName: '차상혁 (대표이사)',
          privacyContactEmail: 'privacy@credeal.net',
          supportEmail: 'support@credeal.net',
        }),
      ).toBe(true);

      expect(
        hasPlaceholderLegalConfig({
          companyName: '제이에스부동산중개(주)',
          representativeName: '차상혁',
          businessRegNumber: '114-87-22003',
          address: '서울특별시 (상세 주소 고객센터 문의)',
          privacyOfficerName: '차상혁 (대표이사)',
          privacyContactEmail: 'privacy@credeal.net',
          supportEmail: 'support@credeal.net',
        }),
      ).toBe(true);

      expect(
        hasPlaceholderLegalConfig({
          companyName: '제이에스부동산중개(주)',
          representativeName: '차상혁',
          businessRegNumber: '',
          address: '서울특별시 서초구 강남대로85길 5, 대유빌딩 3층 (반포동)',
          privacyOfficerName: '차상혁 (대표이사)',
          privacyContactEmail: 'privacy@credeal.net',
          supportEmail: 'support@credeal.net',
        }),
      ).toBe(true);
    });

    it('removes internal D4 codename from Solapi sub-processor and rendered legal pages', () => {
      vi.stubEnv('NEXT_PUBLIC_COMPANY_NAME', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_CEO', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_BIZ_NO', '');
      vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', '');
      vi.stubEnv('NEXT_PUBLIC_PRIVACY_OFFICER_NAME', '');
      vi.stubEnv('NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL', '');
      vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', '');

      const solapi = SUB_PROCESSORS.find((p) => p.id === 'solapi');
      expect(solapi).toBeDefined();
      expect(solapi!.purpose).toBe('카카오 알림톡 및 문자메시지 발송 연동 (알림톡 기능 활성화 시 적용)');
      expect(solapi!.statusNote).toBe('예정(비활성 · 현재 이메일 발송만 운영 중)');
      expect(JSON.stringify(SUB_PROCESSORS)).not.toContain('D4');

      const privacyHtml = renderToStaticMarkup(React.createElement(PrivacyPage));
      const termsHtml = renderToStaticMarkup(React.createElement(TermsPage));
      for (const html of [privacyHtml, termsHtml]) {
        expect(html).toContain('제이에스부동산중개(주)');
        expect(html).toContain('차상혁');
        expect(html).toContain('114-87-22003');
        expect(html).toContain('privacy@credeal.net');
        expect(html).toContain('support@credeal.net');
        expect(html).not.toContain('D4');
        expect(html).not.toContain('credeal.kr');
        expect(html).not.toContain('별도 고지');
        expect(html).not.toContain('고객센터 문의');
      }
    });

    it('removes duplicate "| 크리딜 (CREDEAL)" suffix from /privacy and /terms metadata.title', () => {
      expect(privacyMetadata.title).toBe('개인정보처리방침 및 수집·이용 안내');
      expect(termsMetadata.title).toBe('통합 서비스 이용약관');
    });

    it('wires UpgradeModal to COMPANY_LEGAL_CONFIG.supportEmail (support@credeal.net)', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', '');
      const html = renderToStaticMarkup(
        React.createElement(UpgradeModal, {
          isOpen: true,
          onClose: () => {},
          estimatedSavingsMoney: 0,
          currentCount: 10,
          maxLimit: 10,
        }),
      );
      expect(html).toContain('support@credeal.net');
      expect(html).not.toContain('support@credeal.kr');
    });

    it('removes retired dealcard.kr from next.config.ts CSP connect-src and CORS origin regex', async () => {
      const rules = await nextConfig.headers!();
      const globalCsp = rules
        .find((r) => r.source === '/:path*')
        ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
      expect(globalCsp).toContain('https://credeal.net');
      expect(globalCsp).toContain('https://www.credeal.net');
      expect(globalCsp).not.toContain('dealcard.kr');

      const corsRule = rules.find(
        (r) => r.source === '/api/:path*' && Array.isArray(r.has) && r.has.length > 0,
      );
      const originPattern = (corsRule!.has![0] as { value: string }).value;
      const originRe = new RegExp(`^${originPattern}$`);
      expect(originRe.test('https://credeal.net')).toBe(true);
      expect(originRe.test('https://www.credeal.net')).toBe(true);
      expect(originRe.test('https://dealcard.kr')).toBe(false);
      expect(originRe.test('https://www.dealcard.kr')).toBe(false);
    });
  });

  describe('A6-01: Remove Stock Jargon ("배당") Across Enhancer, Demo Data & Lexicon Filter', () => {
    it('normalizes retired-generation copy to "안정 임대수익 선호 매수자" with harmonized postposition', async () => {
      const syncOut = polishImCopyWithLexiconSync('은퇴 세대 맞춤으로 추천되는 빌딩입니다.');
      expect(syncOut).toContain('안정 임대수익 선호 매수자로');
      expect(syncOut).not.toContain('배당');

      const asyncOut = await polishImCopyWithLexicon('은퇴 부부를 위한 건물입니다.');
      expect(asyncOut).toContain('안정 임대수익 선호 매수자');
      expect(asyncOut).not.toContain('배당');
    });

    it('replaces "배당 소득" in mobile-im-demo-data.ts with "임대 순수익"', () => {
      const serialized = JSON.stringify({ DEMO_MOBILE_IM_DATA, SEOCHO_MEDICAL_DEMO });
      expect(serialized).toContain('임대 순수익');
      expect(serialized).not.toContain('배당');
    });

    it('flags and normalizes "배당" and "배당수익률" in cre-lexicon-filter.ts', () => {
      const res1 = applyLexiconFilter('안정적 배당 및 연 4.2% 배당수익률');
      expect(res1.violations.length).toBeGreaterThanOrEqual(2);
      expect(res1.filteredText).not.toContain('배당');
      expect(res1.filteredText).toContain('임대수익');
      expect(res1.filteredText).toContain('임대수익률');
    });
  });

  describe('A6-12..A6-16: 4-Guide Label Sync (Holdout V2 + Broker Full-Loop)', () => {
    it('ensures all 4 guide files + 2 TS datasets have zero stale labels and synced new labels', () => {
      const guideFiles = [
        'docs/finaltest/FULL_LOOP_V2_HOLDOUT_HUMAN_TEST_GUIDE.md',
        'docs/finaltest/FULL_LOOP_V2_HOLDOUT_HUMAN_TEST_GUIDE.html',
        'docs/finaltest/BROKER_FULL_LOOP_10PHOTOS_AND_BYOD_GUIDE.md',
        'docs/finaltest/BROKER_FULL_LOOP_10PHOTOS_AND_BYOD_GUIDE.html',
        'src/lib/testguide/full-loop-v2-holdout-data.ts',
        'src/lib/testguide/broker-full-loop-data.ts',
      ];

      for (const rel of guideFiles) {
        const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
        expect(text, `${rel} still contains [+ 새 호수 만들기]`).not.toContain('[+ 새 호수 만들기]');
        expect(text, `${rel} still contains [새 매물 입력]`).not.toContain('[새 매물 입력]');
        expect(text, `${rel} still contains [상세 IM 자료 요청하기]`).not.toContain(
          '[상세 IM 자료 요청하기]',
        );
        expect(text, `${rel} still contains /m/... 또는 /newsletter/...`).not.toContain(
          '/m/... 또는 /newsletter/...',
        );
        expect(text, `${rel} missing 이번 달 뉴스레터 새로 쓰기`).toContain(
          '이번 달 뉴스레터 새로 쓰기',
        );
        expect(text, `${rel} missing 상세 제안서(IM) 요청`).toContain('상세 제안서(IM) 요청');
        expect(text, `${rel} missing 자료 보내기(승인)`).toContain('자료 보내기(승인)');
        expect(text, `${rel} missing 확인·승인하기 ›`).toContain('확인·승인하기 ›');
      }

      expect(FULL_LOOP_V2_ALL_STEPS.find((s) => s.id === 'H1-S5')?.copySnippets).toHaveLength(5);
      expect(FULL_LOOP_V2_ALL_STEPS.find((s) => s.id === 'H2-S5')?.copySnippets).toHaveLength(8);
      expect(BROKER_FULL_LOOP_ALL_STEPS.find((s) => s.id === 'B1-S5')?.copySnippets).toHaveLength(5);
    });
  });
});
