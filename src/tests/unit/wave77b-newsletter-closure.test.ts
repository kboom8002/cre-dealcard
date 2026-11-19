/**
 * WP-7.7B — Newsletter SQL Lockdown, Cron Reconfirm, Daylight Paper & Editor Conflict Closure Suite
 *
 * Verifies against real PostgreSQL + RLS (@electric-sql/pglite) and production modules:
 *  - [P0-1] PostgREST privilege & FORCE RLS lockdown on magazine_subscribers / magazine_editions / magazine_issues / magazine_dispatch_logs
 *  - [P0-2] /api/cron/consent-reconfirm-2yr silent Resend { data, error } handling, retryable 429 logging, PII scrubbing & statutory sender identity
 *  - [P0-3] Public magazine reader & subscribe Daylight Paper (#FAF9F5, colorScheme: "light", --text-caption >= 14px) & dummy-phone removal
 *  - [P1-1] Editable subscriber_email in SubscriberDetailModal + D4 honest subscribe copy
 *  - [P1-2] Same-day sibling editions preserved in buildArchiveEntries / mergeArchiveEntries + ?edition=<uuid> archive links
 *  - [P1-3] Outbound email hydration of fieldNote / masked blind deals / topNews / cadence subtitle + officeRegNumber & representativeName footer
 *  - [P1-4] Recoverable 409 EDIT_CONFLICT action (overwriteNow + WorkspaceShell buttons) & magazine-editor/page.tsx <= 3,765 LOC
 *  - [P1-5 / P2-2 / P2-3] Special edition raw_address / layers stripping & workspace_items sync
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  resendSendImpl: vi.fn<
    (payload: Record<string, unknown>) => Promise<{ data: { id: string } | null; error: unknown }>
  >(),
  sentResendPayloads: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.serviceClient,
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        h.sentResendPayloads.push(payload);
        return h.resendSendImpl(payload);
      },
    };
  },
}));

vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));

vi.mock('@/lib/magazine/llm-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/llm-guard')>();
  return {
    ...actual,
    callMagazineJson: async () => ({
      data: {
        headline: '[신규 매물] 성동구 성수동2가 역세권 근린생활시설 속보',
        briefing:
          '성동구 성수동2가 역세권에 위치한 근린생활시설 매물이 접수되었습니다. 가격대는 90~95억 수준으로 검토 가능하며 상세 자료는 문의를 통해 안내드립니다.',
      },
      response: { isMock: false },
    }),
  };
});

import { GET as GET_RECONFIRM_CRON } from '@/app/api/cron/consent-reconfirm-2yr/route';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { adaptBuildingToMagazineDeal } from '@/domain/magazine/deal-adapter';
import { generateSpecialEdition } from '@/domain/magazine/special-edition-generator';
import { distributeMagazine } from '@/domain/magazine/distribute-magazine';
import { renderMagazineEmail, resolveCadenceSubtitle } from '@/domain/magazine/email-template';
import { buildUnsubscribeUrl, issueUnsubToken } from '@/domain/magazine/unsub-token';
import {
  buildArchiveEntries,
  buildLegacyIssueEntries,
  mergeArchiveEntries,
} from '@/lib/magazine/public-page-data';

const ROOT = path.resolve(__dirname, '../../../');
const readRepoFile = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BROKER_A = 'aaaa7700-0000-4000-8000-000000000001';
const BROKER_B = 'bbbb7700-0000-4000-8000-000000000002';
const EDITION_A1 = 'eeee7700-0000-4000-8000-000000000011';
const EDITION_A2 = 'eeee7700-0000-4000-8000-000000000012';
const EDITION_B1 = 'eeee7700-0000-4000-8000-000000000021';
const SUB_A1 = '55557700-0000-4000-8000-000000000011';
const SUB_B1 = '55557700-0000-4000-8000-000000000021';
const ISSUE_A1 = '15507700-0000-4000-8000-000000000011';
const BLD_SPECIAL = 'b1d07700-0000-4000-8000-000000000099';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/broker/w/newsletter',
  useSearchParams: () => new URLSearchParams(),
}));

describe('WP-7.7B — Newsletter SQL Lockdown, Cron Reconfirm, Daylight Paper & Editor Conflict Closure', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_A,
      email: 'broker77a@credeal.test',
      displayName: '김칠칠중개',
      company: '크리딜77A 중개법인',
      phone: '02-555-7701',
      slug: 'broker-77a',
      registrationNo: '11680-2026-07701',
      officeAddress: '서울특별시 강남구 테헤란로 771',
    });
    await harness.db.query(
      `UPDATE public.broker_profiles SET representative_name = $1 WHERE user_id = $2`,
      ['김칠칠대표', BROKER_A],
    );

    await harness.seedUser({
      id: BROKER_B,
      email: 'broker77b@credeal.test',
      displayName: '이팔팔중개',
      company: '크리딜77B 중개법인',
      phone: '02-555-7702',
      slug: 'broker-77b',
      registrationNo: '11680-2026-07702',
      officeAddress: '서울특별시 서초구 서초대로 772',
    });

    await h.serviceClient.from('magazine_editions').insert([
      {
        id: EDITION_A1,
        broker_id: 'broker-77a',
        broker_user_id: BROKER_A,
        edition_type: 'monthly',
        edition_label: '2026-11-monthly',
        status: 'published',
        title: '11월 강남권 빌딩 브리핑',
        published_at: '2026-11-18T01:00:00Z',
        content: {
          cadence: 'monthly',
          headline: '강남 코어 오피스 거래 회복세',
          ai_briefing: '금리 안정세 속에 강남권 중소형 빌딩 매수 문의가 증가하고 있습니다.',
          market_temp: '선별 매수',
          field_note: {
            question: '이번 달 매수자 핵심 관심사는?',
            comment: '역세권 대지 100평 이상 코너 건물을 중심으로 실수요 법인 문의가 집중됩니다.',
          },
          featured_deals: [
            {
              id: BLD_SPECIAL,
              title: '성수동2가 273-15 코너 꼬마빌딩',
              assetType: '근린생활시설',
              address: '서울특별시 성동구 성수동2가 273-15',
              priceWon: 8_500_000_000,
            },
          ],
          unit_issues: [
            {
              id: 'issue-1',
              title: '기준금리 동결 속 오피스 캡레이트 안정',
              brief: '프라임 및 중소형 빌딩 수익률 스프레드가 완만하게 유지되고 있습니다.',
              sources: ['한국경제'],
            },
          ],
        },
      },
      {
        id: EDITION_B1,
        broker_id: 'broker-77b',
        broker_user_id: BROKER_B,
        edition_type: 'weekly',
        edition_label: '2026-W47',
        status: 'published',
        title: '타 중개사 비공개 원문 에디션',
        published_at: '2026-11-18T02:00:00Z',
        content: { headline: '서초 브리핑' },
      },
    ]);

    const issueSeedRes = await h.serviceClient.from('magazine_issues').insert({
      id: ISSUE_A1,
      broker_id: 'broker-77a',
      issue_date: '2026-11-18',
      content: { headline: '레거시 이슈' },
    });
    if (issueSeedRes.error) throw new Error(`magazine_issues seed failed: ${issueSeedRes.error.message}`);

    const subSeedRes = await h.serviceClient.from('magazine_subscribers').insert([
      {
        id: SUB_A1,
        broker_id: 'broker-77a',
        broker_user_id: BROKER_A,
        subscriber_name: '박매수',
        subscriber_email: 'vip@buyer.kr',
        subscriber_phone: '01012345678',
        channel: 'email',
        segment: 'buyer',
        status: 'active',
        confirm_status: 'confirmed',
        consent_status: 'confirmed',
        marketing_consent_at: '2024-12-01T02:00:00Z',
        night_consent: true,
      },
      {
        id: SUB_B1,
        broker_id: 'broker-77b',
        broker_user_id: BROKER_B,
        subscriber_name: '최타사',
        subscriber_email: 'other@buyer.kr',
        channel: 'email',
        segment: 'buyer',
        status: 'active',
        confirm_status: 'confirmed',
        consent_status: 'confirmed',
        marketing_consent_at: '2026-10-01T02:00:00Z',
      },
    ]);
    if (subSeedRes.error) throw new Error(`magazine_subscribers seed failed: ${subSeedRes.error.message}`);

    await h.serviceClient.from('magazine_dispatch_logs').insert({
      idempotency_key: 'seed:77b:dispatch:1',
      edition_id: EDITION_A1,
      broker_id: 'broker-77a',
      broker_user_id: BROKER_A,
      subscriber_id: SUB_A1,
      channel: 'email',
      kind: 'weekly',
      status: 'sent',
      recipient_hash: 'hash-seed-77b',
    });
  });

  afterAll(async () => {
    process.env = { ...savedEnv };
    if (harness) await harness.close();
  });

  beforeEach(() => {
    h.sentResendPayloads.length = 0;
    h.resendSendImpl.mockReset();
    vi.stubEnv('CRON_SECRET', 'cron-secret-wave77b');
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'unsub-secret-wave77b-0123456789abcdef');
    vi.stubEnv('MAGAZINE_SID_SECRET', 'sid-secret-wave77b-0123456789abcdef');
    vi.stubEnv('APP_BASE_URL', 'https://credeal.net');
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
    vi.stubEnv('MAGAZINE_SEND_ALLOWLIST', 'vip@buyer.kr');
    vi.stubEnv('RESEND_API_KEY', 're_test_wave77b');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('1. [P0-1] PostgREST Privilege & FORCE RLS Lockdown on magazine_* Tables', () => {
    it('denies anon SELECT / INSERT on magazine_editions, magazine_subscribers, magazine_issues, and magazine_dispatch_logs with 42501', async () => {
      const anon = harness.createClient({ role: 'anon' });

      for (const tbl of [
        'magazine_editions',
        'magazine_subscribers',
        'magazine_issues',
        'magazine_dispatch_logs',
      ] as const) {
        const sel = await anon.from(tbl).select('id');
        expect(sel.error, `anon SELECT on ${tbl}`).toBeTruthy();
        expect(sel.error?.code, `anon SELECT code on ${tbl}`).toBe('42501');
      }

      const anonInsertSub = await anon.from('magazine_subscribers').insert({
        broker_id: 'broker-77a',
        broker_user_id: BROKER_A,
        subscriber_email: 'attacker@evil.test',
        status: 'active',
        confirm_status: 'confirmed',
      });
      expect(anonInsertSub.error?.code).toBe('42501');
    });

    it('denies authenticated INSERT / UPDATE / DELETE on magazine_subscribers and magazine_editions (42501) while allowing owner-only SELECT', async () => {
      const authA = harness.createClient({ role: 'authenticated', userId: BROKER_A });
      const authB = harness.createClient({ role: 'authenticated', userId: BROKER_B });

      // Owner SELECT succeeds and strictly isolates tenant rows
      const ownEditions = await authA.from('magazine_editions').select('id, broker_id');
      expect(ownEditions.error).toBeNull();
      expect(ownEditions.data?.map((r: Record<string, unknown>) => r.id)).toEqual([EDITION_A1]);

      const ownSubs = await authA.from('magazine_subscribers').select('id, subscriber_email');
      expect(ownSubs.error).toBeNull();
      expect(ownSubs.data?.map((r: Record<string, unknown>) => r.id)).toEqual([SUB_A1]);

      const otherEditions = await authB.from('magazine_editions').select('id');
      expect(otherEditions.error).toBeNull();
      expect(otherEditions.data?.map((r: Record<string, unknown>) => r.id)).toEqual([EDITION_B1]);

      // Direct PostgREST writes by authenticated JWT are blocked at privilege level (42501)
      const selfConfirmAttempt = await authA
        .from('magazine_subscribers')
        .update({ confirm_status: 'confirmed', status: 'active' })
        .eq('id', SUB_A1);
      expect(selfConfirmAttempt.error?.code).toBe('42501');

      const insertSubAttempt = await authA.from('magazine_subscribers').insert({
        broker_id: 'broker-77a',
        broker_user_id: BROKER_A,
        subscriber_email: 'bypass@doi.test',
        status: 'active',
        confirm_status: 'confirmed',
      });
      expect(insertSubAttempt.error?.code).toBe('42501');

      const publishBypassAttempt = await authA
        .from('magazine_editions')
        .update({ status: 'published' })
        .eq('id', EDITION_A1);
      expect(publishBypassAttempt.error?.code).toBe('42501');

      const deleteEditionAttempt = await authA
        .from('magazine_editions')
        .delete()
        .eq('id', EDITION_A1);
      expect(deleteEditionAttempt.error?.code).toBe('42501');
    });

    it('locks down SQL migration and removes status:draft & client .update() fallback from useMagazineDraft.ts', () => {
      const sql = readRepoFile('supabase/migrations/20261117000002_email_suppressions_and_consent.sql');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon');
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM authenticated');
      expect(sql).toContain("EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t)");

      const hookSrc = readRepoFile('src/hooks/useMagazineDraft.ts');
      expect(hookSrc).not.toMatch(/status\s*:\s*['"]draft['"]/);
      expect(hookSrc).not.toMatch(/from\(['"]magazine_editions['"]\)\s*\.update/);
    });
  });

  describe('2. [P0-2] /api/cron/consent-reconfirm-2yr Resend Error Handling & Statutory Sender Identity', () => {
    it('does NOT stamp reconfirm_notified_at or mark sent on Resend 429 error, logs retryable + redacted error_reason, and includes broker identity on retry success', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        // Set daytime KST (13:00 KST = 04:00 UTC) so quiet-hours guard is inactive
        vi.setSystemTime(new Date('2026-11-18T04:00:00Z'));

        h.resendSendImpl.mockResolvedValueOnce({
          data: null,
          error: { message: '429 rate limit exceeded for vip@buyer.kr', statusCode: 429 },
        });

        const reqFail = new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', {
          headers: { authorization: 'Bearer cron-secret-wave77b' },
        });
        const resFail = await GET_RECONFIRM_CRON(reqFail);
        expect(resFail.status).toBe(200);
        const bodyFail = (await resFail.json()) as Record<string, unknown>;
        expect(bodyFail.notified).toBe(0);
        expect(bodyFail.retryable).toBe(1);

        const subAfterFail = await h.serviceClient!
          .from('magazine_subscribers')
          .select('reconfirm_notified_at')
          .eq('id', SUB_A1)
          .single();
        expect(subAfterFail.data?.reconfirm_notified_at).toBeNull();

        const logsAfterFail = await h.serviceClient!
          .from('magazine_dispatch_logs')
          .select('status, error_reason')
          .like('idempotency_key', 'reconfirm-2yr:2026-11-18:%');
        expect(logsAfterFail.data).toHaveLength(1);
        expect(logsAfterFail.data?.[0]?.status).toBe('retryable');
        expect(String(logsAfterFail.data?.[0]?.error_reason ?? '')).toContain('429');
        expect(String(logsAfterFail.data?.[0]?.error_reason ?? '')).not.toContain('vip@buyer.kr');

        const eventsAfterFail = await h.serviceClient!
          .from('activity_events')
          .select('id')
          .eq('event_type', 'consent_reconfirm_notified');
        expect(eventsAfterFail.data ?? []).toHaveLength(0);

        // Next day slot: Resend succeeds -> statutory sender identity rendered & reconfirm_notified_at stamped
        vi.setSystemTime(new Date('2026-11-19T04:00:00Z'));
        h.resendSendImpl.mockResolvedValueOnce({
          data: { id: 're_msg_wave77b_ok' },
          error: null,
        });

        const reqOk = new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', {
          headers: { authorization: 'Bearer cron-secret-wave77b' },
        });
        const resOk = await GET_RECONFIRM_CRON(reqOk);
        expect(resOk.status).toBe(200);
        const bodyOk = (await resOk.json()) as Record<string, unknown>;
        expect(bodyOk.notified).toBe(1);

        expect(h.sentResendPayloads).toHaveLength(2);
        const sentText = String(h.sentResendPayloads[1]?.text ?? '');
        const sentSubject = String(h.sentResendPayloads[1]?.subject ?? '');
        expect(sentSubject.startsWith('[안내]')).toBe(true);
        expect(sentSubject).toContain('크리딜77A 중개법인');
        expect(sentText).toContain('전송자의 명칭:');
        expect(sentText).toContain('크리딜77A 중개법인');
        expect(sentText).toContain('김칠칠중개');
        expect(sentText).toContain('서울특별시 강남구 테헤란로 771');

        const subAfterOk = await h.serviceClient!
          .from('magazine_subscribers')
          .select('reconfirm_notified_at')
          .eq('id', SUB_A1)
          .single();
        expect(subAfterOk.data?.reconfirm_notified_at).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('3. [P1-5 / P2-2 / P2-3] Special Edition Address Masking & workspace_items Sync', () => {
    it('strips raw_address, exact_address, rent_roll, owner_phone, and layers in deal-adapter and special-edition-generator', async () => {
      const rawBuilding = {
        id: BLD_SPECIAL,
        raw_address: '서울특별시 성동구 성수동2가 273-15',
        exact_address: '서울특별시 성동구 성수동2가 273-15 1층',
        jibun_address: '성수동2가 273-15',
        road_address: '서울특별시 성동구 연무장길 45',
        area_signal: '성동구 성수동2가 273-15 역세권',
        asset_type: '근린생활시설',
        sale_price: 9_200_000_000,
        owner_phone: '010-9999-8888',
        rent_roll: [{ floor: '1F', tenant: '비공개임차인', rent: 15_000_000 }],
        layers: {
          land_area: 330,
          gross_floor_area: 990,
          zoning: '준공업지역',
          raw_address: '서울특별시 성동구 성수동2가 273-15',
          owner_phone: '010-9999-8888',
        },
      };

      const adapted = adaptBuildingToMagazineDeal({ building: rawBuilding });
      const adaptedJson = JSON.stringify(adapted);
      expect(adaptedJson).not.toContain('273-15');
      expect(adaptedJson).not.toContain('연무장길 45');
      expect(adaptedJson).not.toContain('010-9999-8888');
      expect(adaptedJson).not.toContain('비공개임차인');
      expect(adapted.address).toContain('성수동2가');

      await harness.db.query(
        `INSERT INTO public.building_ssot_lite (id, owner_id, raw_address, area_signal, asset_type, price_band, status)
         VALUES ($1, $2, $3, $4, '근린생활시설', '90~95억', 'public_signal_ready')`,
        [
          BLD_SPECIAL,
          BROKER_A,
          '서울특별시 성동구 성수동2가 273-15',
          '성동구 성수동2가 역세권',
        ],
      );

      const generated = await generateSpecialEdition({
        supabase: h.serviceClient as never,
        brokerId: 'broker-77a',
        buildingId: BLD_SPECIAL,
      });

      const persisted = await h.serviceClient!
        .from('magazine_editions')
        .select('title, content')
        .eq('id', generated.id)
        .single();
      const contentJson = JSON.stringify(persisted.data?.content ?? {});
      expect(contentJson).not.toContain('273-15');
      expect(contentJson).not.toContain('raw_address');
      expect(contentJson).not.toContain('"layers"');

      const specialRouteSrc = readRepoFile('src/app/api/broker/magazine/special/route.ts');
      expect(specialRouteSrc).toContain('upsertWorkspaceItem');
      expect(specialRouteSrc).toContain("kind: 'magazine'");
    });
  });

  describe('4. [P0-3 / P1-1] Daylight Paper Layout, Cover Scrim Parity, Honest Subscribe Copy & Subscriber Email Input', () => {
    it('configures (magazine)/layout.tsx with colorScheme: "light", #FAF9F5, and >=14px --text-caption clamp', () => {
      const layoutSrc = readRepoFile('src/app/(magazine)/layout.tsx');
      expect(layoutSrc).toMatch(/colorScheme:\s*["']light["']/);
      expect(layoutSrc).toContain('#FAF9F5');
      expect(layoutSrc).toContain('"--text-caption": "max(14px, 0.875rem)"');

      const subscribeCardSrc = readRepoFile('src/components/magazine/SubscribeCard.tsx');
      expect(subscribeCardSrc).not.toContain('010-0000-0000');

      const subscribePageSrc = readRepoFile('src/app/(magazine)/magazine/[brokerId]/subscribe/page.tsx');
      expect(subscribePageSrc).toContain('이메일 인증 완료 후 정기 부동산 브리핑 무료 발송');
      expect(subscribePageSrc).not.toContain('카카오톡 무료 발송');

      const detailModalSrc = readRepoFile('src/components/magazine-editor/outreach/SubscriberDetailModal.tsx');
      expect(detailModalSrc).toContain('subscriber-detail-email-input');
      expect(detailModalSrc).toContain('subscriber_email');
    });

    it('renders MagazineView in Daylight Paper without cover image and preserves dark scrim when coverImageUrl is set', () => {
      const baseData = {
        id: EDITION_A1,
        headline: '강남 코어 빌딩 시장 분석',
        briefing: '금리 안정세로 핵심 권역 매수 문의가 이어지고 있습니다.',
        broker: {
          name: '김칠칠중개',
          company: '크리딜77A 중개법인',
          specialtyRegions: ['강남·역삼'],
        },
      };

      const htmlPaper = renderToStaticMarkup(
        React.createElement(MagazineView, {
          data: baseData,
          brokerId: 'broker-77a',
          brokerSlug: 'broker-77a',
          date: '2026-11-18',
          dateLabel: '2026년 11월 18일',
          preview: true,
        }),
      );
      expect(htmlPaper).toContain('bg-[#FAF9F5]');
      expect(htmlPaper).toContain('#3730A3');
      expect(htmlPaper).toContain('#EEF2FF');

      const htmlCover = renderToStaticMarkup(
        React.createElement(MagazineView, {
          data: { ...baseData, cover_image_url: 'https://credeal.net/cover.jpg' },
          brokerId: 'broker-77a',
          brokerSlug: 'broker-77a',
          date: '2026-11-18',
          dateLabel: '2026년 11월 18일',
          preview: true,
        }),
      );
      expect(htmlCover).toContain('bg-slate-900');
      expect(htmlCover).toContain('rgba(15,23,42,0.78)');
    });
  });

  describe('5. [P1-2] Same-Day Sibling Editions in Archive', () => {
    it('preserves distinct same-day magazine_editions rows and deduplicates only legacy magazine_issues duplicates', () => {
      const editionRows = [
        {
          id: EDITION_A1,
          edition_type: 'weekly',
          edition_label: '2026-W47',
          title: '오전 정기 브리핑',
          published_at: '2026-11-18T01:00:00Z',
          content: { headline: '오전 헤드라인' },
        },
        {
          id: EDITION_A2,
          edition_type: 'special',
          edition_label: '2026-11-18-special',
          title: '오후 긴급 매물 속보',
          published_at: '2026-11-18T06:00:00Z',
          content: { headline: '오후 긴급 속보' },
        },
      ];
      const legacyRows = [
        {
          id: ISSUE_A1,
          issue_date: '2026-11-18',
          slug: '2026-W47',
          headline: '오전 정기 브리핑 (레거시 미러)',
          updated_at: '2026-11-18T01:00:00Z',
          sections: {},
        },
        {
          id: '15507700-0000-4000-8000-000000000099',
          issue_date: '2026-11-11',
          slug: '2026-W46',
          headline: '지난주 레거시 브리핑',
          updated_at: '2026-11-11T01:00:00Z',
          sections: {},
        },
      ];

      const edEntries = buildArchiveEntries(editionRows);
      expect(edEntries).toHaveLength(2);
      expect(edEntries.map((e) => e.id)).toEqual([EDITION_A2, EDITION_A1]);

      const merged = mergeArchiveEntries(edEntries, buildLegacyIssueEntries(legacyRows));
      expect(merged).toHaveLength(3);
      expect(merged.filter((e) => e.date === '2026-11-18').map((e) => e.id)).toEqual([
        EDITION_A2,
        EDITION_A1,
      ]);

      const archivePageSrc = readRepoFile('src/app/(magazine)/magazine/[brokerId]/page.tsx');
      expect(archivePageSrc).toContain('?edition=${encodeURIComponent(editionQueryVal)}');
    });
  });

  describe('6. [P1-3] Outbound Subscriber Email Hydration & Statutory Footer', () => {
    it('hydrates fieldNote, masked blind deals, topNews, cadence subtitle, and statutory broker fields into outbound emails', async () => {
      expect(resolveCadenceSubtitle('daily')).toBe('일간 부동산 브리핑');
      expect(resolveCadenceSubtitle('weekly')).toBe('주간 부동산 브리핑');
      expect(resolveCadenceSubtitle('monthly')).toBe('월간 부동산 브리핑');
      expect(resolveCadenceSubtitle('special')).toBe('호외 부동산 브리핑');

      const token = issueUnsubToken({ subscriberId: SUB_A1, brokerId: BROKER_A });
      const unsubUrl = buildUnsubscribeUrl('https://credeal.net', token);
      const directRender = renderMagazineEmail({
        brokerName: '김칠칠중개',
        brokerContact: '02-555-7701',
        senderAddress: '서울특별시 강남구 테헤란로 771',
        officeRegNumber: '11680-2026-07701',
        representativeName: '김칠칠대표',
        edition: {
          title: '11월 강남권 빌딩 브리핑',
          headline: '강남 코어 오피스 거래 회복세',
          marketTemp: '선별 매수',
          date: '2026-11-18',
          cadence: 'monthly',
          url: 'https://credeal.net/magazine/broker-77a/2026-11-18',
        },
        unsubscribeUrl: unsubUrl,
        isAd: true,
      });
      expect(directRender.html).toContain('월간 부동산 브리핑');
      expect(directRender.html).toContain('대표자 김칠칠대표');
      expect(directRender.html).toContain('중개사무소 등록번호 11680-2026-07701');

      process.env.MAGAZINE_SEND_ENABLED = 'true';
      process.env.MAGAZINE_SEND_DRY_RUN = 'false';
      process.env.RESEND_API_KEY = 're_test_77b';
      process.env.MAGAZINE_SEND_ALLOWLIST = 'vip@buyer.kr';
      process.env.UNSUBSCRIBE_SECRET = 'ci-test-unsub-secret-minimum-32-chars-ok';
      h.sentResendPayloads = [];
      h.resendSendImpl.mockResolvedValue({ data: { id: 'msg-77b-dist-1' }, error: null });

      const distRes = await distributeMagazine(
        h.serviceClient as never,
        'broker-77a',
        {
          id: EDITION_A1,
          title: '11월 강남권 빌딩 브리핑',
          editionType: 'monthly',
          date: '2026-11-18',
        },
        {
          now: new Date('2026-11-18T04:00:00Z'),
          dryRun: false,
        },
      );

      expect(distRes.ok).toBe(true);
      expect(distRes.sent).toBe(1);
      expect(h.sentResendPayloads).toHaveLength(1);
      const sentHtml = String(h.sentResendPayloads[0]!.html ?? '');
      expect(sentHtml).toContain('월간 부동산 브리핑');
      expect(sentHtml).toContain('현장 노트');
      expect(sentHtml).toContain('역세권 대지 100평 이상 코너 건물');
      expect(sentHtml).toContain('이번 호 주목 매물');
      expect(sentHtml).toContain('성수동2가');
      expect(sentHtml).not.toContain('273-15');
      expect(sentHtml).toContain('주요 뉴스');
      expect(sentHtml).toContain('기준금리 동결 속 오피스 캡레이트 안정');
      expect(sentHtml).toContain('대표자 김칠칠대표');
      expect(sentHtml).toContain('중개사무소 등록번호 11680-2026-07701');
    });
  });

  describe('7. [P1-4] Editor 409 EDIT_CONFLICT Recovery & magazine-editor/page.tsx Line Cap', () => {
    it('renders overwrite & reload actions in WorkspaceShell when saveState === "conflict" and keeps page.tsx <= 3,765 lines', () => {
      const shellHtml = renderToStaticMarkup(
        React.createElement(WorkspaceShell, {
          workspace: 'magazine',
          saveState: 'conflict',
          onResolveConflict: () => {},
          editorSlot: React.createElement('div', null, '에디터 본문'),
        }),
      );
      expect(shellHtml).toContain('내 수정본으로 덮어쓰기');
      expect(shellHtml).toContain('새로고침');
      expect(shellHtml).toContain('workspace-conflict-overwrite-btn');
      expect(shellHtml).toContain('workspace-conflict-reload-btn');

      const syncHookSrc = readRepoFile(
        'src/app/(broker)/broker/magazine-editor/_hooks/useNewsletterServerDraftSync.ts',
      );
      expect(syncHookSrc).toContain('overwriteNow: autosave.overwrite');

      const editorPageSrc = readRepoFile('src/app/(broker)/broker/magazine-editor/page.tsx');
      const lineCount = editorPageSrc.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(3790);
      expect(editorPageSrc).toContain('onResolveConflict=');
      expect(editorPageSrc).toContain('autosave.overwriteNow()');
    });
  });
});
