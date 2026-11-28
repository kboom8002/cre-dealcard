/**
 * @file src/tests/golden/runtime-api-error-lexicon.test.ts
 * @description G-UX-04 — Runtime Surface Lexicon Gate, API Error Hygiene (400/401/403/409/422),
 *   and Beta Red-Pen Flywheel Analyzer (`U-04`) unit + route verification.
 *
 * Guarantees:
 *   - $0.00 cost (zero paid LLM calls, zero live network calls)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    throw new Error('offline-test-no-supabase');
  },
}));

vi.mock('@/domain/team/circle-service', () => ({
  joinByInviteCode: vi.fn().mockResolvedValue({
    status: 'already_member',
    circleId: 'circle-test-01',
  }),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  leaveCircle: vi.fn(),
}));

import {
  RUNTIME_TECHNICAL_LEAK_PATTERNS,
  scanRuntimeSurfaceLexicon,
} from '@/lib/ux/lexicon';
import {
  analyzeBetaRedpenFlywheel,
  renderBetaFlywheelMarkdown,
  type QaFlywheelActivityEvent,
} from '@/lib/qa/redpen-flywheel-analyzer';
import { POST as qaWorkbenchPost } from '@/app/api/public/qa-workbench/route';
import { POST as imInquiryPost } from '@/app/api/public/im-inquiry/route';
import { POST as gateSubmitPost } from '@/app/api/public/gate/submit/route';
import { PATCH as dealCardPatch } from '@/app/api/broker/deal-card/[id]/route';
import { POST as circlesJoinPost } from '@/app/api/broker/circles/join/route';

describe('G-UX-04 — Runtime Surface Lexicon Gate & Beta Red-Pen Flywheel', () => {
  describe('1) scanRuntimeSurfaceLexicon positives & negatives', () => {
    it('flags all runtime technical leaks, raw UUID v4, BANNED_UI_TERMS, and banned CRE jargon', () => {
      const technicalSamples = [
        '데이터 조회 실패: PGRST116 zero rows returned',
        '예상 연 수익률 NaN%',
        '담당자 연락처: undefined',
        'PostgreSQL SQLSTATE 23505 오류 발생',
        'insert or update on table violates foreign key constraint',
        'duplicate key value violates unique constraint',
        "TypeError: Cannot read properties of null (reading 'price')",
        'Cannot read property length of undefined',
        '대상 자산 f9758801-b867-4ce7-be4f-888601ef504f 를 찾을 수 없습니다.',
      ];

      expect(RUNTIME_TECHNICAL_LEAK_PATTERNS.length).toBeGreaterThanOrEqual(7);

      for (const sample of technicalSamples) {
        const hits = scanRuntimeSurfaceLexicon(sample, { surface: 'api_error' });
        expect(hits.length, `expected hit for: ${sample}`).toBeGreaterThan(0);
      }

      const jargonSamples = [
        '캡레이트 4.1% 우량 근생',
        '기대 배당률 5.2% 확보',
        '연 NOI 3.4억 원 수준',
        'LTV 60% 조건 조달 가능',
        '임대호가 월 2,500만 원',
        '건물 ID 확인 필요',
        '포스처에 맞는 사분면 구성 및 OG 이미지 확인',
      ];

      for (const sample of jargonSamples) {
        const hits = scanRuntimeSurfaceLexicon(sample, { surface: 'dealcard' });
        expect(hits.length, `expected jargon hit for: ${sample}`).toBeGreaterThan(0);
      }
    });

    it('passes clean Korean CRE copy and honors allowUuid option', () => {
      const cleanCopy =
        '성동구 성수동2가 역세권 코너 근린생활시설 (매매 희망 구간 140~150억) · 연 순수익률 3.80% · 연면적 390평';
      expect(scanRuntimeSurfaceLexicon(cleanCopy, { surface: 'dealcard' })).toEqual([]);

      const withUuid =
        '성동구 매물 정보(f9758801-b867-4ce7-be4f-888601ef504f)가 정상 저장되었습니다.';
      expect(scanRuntimeSurfaceLexicon(withUuid, { allowUuid: false })).toHaveLength(1);
      expect(scanRuntimeSurfaceLexicon(withUuid, { allowUuid: true })).toEqual([]);
    });
  });

  describe('2) Representative API Error Responses (400 / 401 / 403 / 409 / 422) pass lexicon gate', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      for (const k of Object.keys(process.env)) {
        if (!(k in savedEnv)) delete process.env[k];
      }
      Object.assign(process.env, savedEnv);
    });

    function extractErrorText(payload: Record<string, unknown>): string {
      const parts: string[] = [];
      if (typeof payload.error === 'string') parts.push(payload.error);
      if (
        payload.error &&
        typeof payload.error === 'object' &&
        typeof (payload.error as { message?: unknown }).message === 'string'
      ) {
        parts.push(String((payload.error as { message: string }).message));
      }
      if (typeof payload.message === 'string') parts.push(payload.message);
      if (Array.isArray(payload.errors)) {
        for (const item of payload.errors) {
          if (typeof item === 'string') parts.push(item);
        }
      }
      return parts.join(' ');
    }

    it('400 Bad Request from public qa-workbench, im-inquiry, and gate/submit contain zero technical leaks or banned jargon', async () => {
      const qaReq = new NextRequest('http://localhost/api/public/qa-workbench', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'pin', note: '   ' }),
      });
      const qaRes = await qaWorkbenchPost(qaReq);
      expect(qaRes.status).toBe(400);
      const qaBody = (await qaRes.json()) as Record<string, unknown>;
      expect(scanRuntimeSurfaceLexicon(extractErrorText(qaBody), { surface: 'api_error' })).toEqual([]);

      const inqReq = new NextRequest('http://localhost/api/public/im-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: 'bld-test-1', name: '김대표', phone: '01012345678' }),
      });
      const inqRes = await imInquiryPost(inqReq);
      expect(inqRes.status).toBe(400);
      const inqBody = (await inqRes.json()) as Record<string, unknown>;
      expect(scanRuntimeSurfaceLexicon(extractErrorText(inqBody), { surface: 'api_error' })).toEqual([]);

      const gateReq = new NextRequest('http://localhost/api/public/gate/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: 'bld-test-1', formData: { name: '박매수' } }),
      });
      const gateRes = await gateSubmitPost(gateReq);
      expect(gateRes.status).toBe(400);
      const gateBody = (await gateRes.json()) as Record<string, unknown>;
      expect(scanRuntimeSurfaceLexicon(extractErrorText(gateBody), { surface: 'api_error' })).toEqual([]);
    });

    it('401 Unauthorized and 403 Forbidden from broker deal-card & qa-workbench pass lexicon gate', async () => {
      const unauthReq = new NextRequest('http://localhost/api/broker/deal-card/dc-test-01', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '테스트' }),
      });
      const unauthRes = await dealCardPatch(unauthReq, {
        params: Promise.resolve({ id: 'dc-test-01' }),
      });
      expect(unauthRes.status).toBe(401);
      const unauthBody = (await unauthRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(unauthBody), { surface: 'api_error' }),
      ).toEqual([]);

      process.env.CREDEAL_ENABLE_PUBLIC_QA = 'true';
      process.env.QA_PORTAL_PASSCODE = 'test-passcode-1234';
      process.env.QA_TESTER_ACCESS_KEY = 'tester-secret-1234';

      const qaUnauthReq = new NextRequest('http://localhost/api/public/qa-workbench', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'pin', note: '메모 확인' }),
      });
      const qaUnauthRes = await qaWorkbenchPost(qaUnauthReq);
      expect(qaUnauthRes.status).toBe(401);
      const qaUnauthBody = (await qaUnauthRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(qaUnauthBody), { surface: 'api_error' }),
      ).toEqual([]);

      const qaForbiddenReq = new NextRequest('http://localhost/api/public/qa-workbench', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-qa-access-key': 'tester-secret-1234',
        },
        body: JSON.stringify({
          mode: 'pin',
          sessionId: 'qa-broker-beta-1',
          note: '브로커 세션 수정 시도',
        }),
      });
      const qaForbiddenRes = await qaWorkbenchPost(qaForbiddenReq);
      expect(qaForbiddenRes.status).toBe(403);
      const qaForbiddenBody = (await qaForbiddenRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(qaForbiddenBody), { surface: 'api_error' }),
      ).toEqual([]);
    });

    it('422 Unprocessable Entity (blind point / priceBand leak) from deal-card PATCH & 409 Conflict from broker circles/join pass lexicon gate', async () => {
      const blindLeakReq = new NextRequest('http://localhost/api/broker/deal-card/dc-lexicon-422', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify({
          card4: {
            posture: 'income',
            region: '성동구 성수동2가',
            use: '근린생활시설',
            priceBand: '140~150억',
            points: ['서울 성동구 연무장7길 11 코너', '역세권 도보 3분', '병의원 장기 임차'],
          },
        }),
      });
      const blindLeakRes = await dealCardPatch(blindLeakReq, {
        params: Promise.resolve({ id: 'dc-lexicon-422' }),
      });
      expect(blindLeakRes.status).toBe(422);
      const blindLeakBody = (await blindLeakRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(blindLeakBody), { surface: 'api_error' }),
      ).toEqual([]);

      const badBandReq = new NextRequest('http://localhost/api/broker/deal-card/dc-lexicon-422b', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify({
          card4: {
            posture: 'income',
            region: '성동구 성수동2가',
            use: '근린생활시설',
            priceBand: '145억',
            points: ['성수역 도보 3분', '코너 가시성 확보', '우량 리테일 입점'],
          },
        }),
      });
      const badBandRes = await dealCardPatch(badBandReq, {
        params: Promise.resolve({ id: 'dc-lexicon-422b' }),
      });
      expect(badBandRes.status).toBe(422);
      const badBandBody = (await badBandRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(badBandBody), { surface: 'api_error' }),
      ).toEqual([]);

      const conflictReq = new NextRequest('http://localhost/api/broker/circles/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify({ code: 'INVITE-DUP-01' }),
      });
      const conflictRes = await circlesJoinPost(conflictReq);
      expect(conflictRes.status).toBe(409);
      const conflictBody = (await conflictRes.json()) as Record<string, unknown>;
      expect(
        scanRuntimeSurfaceLexicon(extractErrorText(conflictBody), { surface: 'api_error' }),
      ).toEqual([]);
    });
  });

  describe('3) analyzeBetaRedpenFlywheel & renderBetaFlywheelMarkdown (U-04)', () => {
    it('clusters recurring red-pen pairs for lexicon promotion and flags >= 40% BYOD field editRate as P0_PROMPT_TUNING', () => {
      const events: QaFlywheelActivityEvent[] = [
        {
          event_type: 'qa_pin_created',
          metadata: {
            cohort: 'beta-1',
            sessionId: 'qa-broker-beta-1-a',
            workspace: 'dealcards',
            pinMode: 'redpen',
            originalText: '캡레이트   4.2%',
            suggestedText: '연 순수익률 4.2%',
            reasonCategory: 'jargon_plain_korean',
            note: '캡레이트 표현을 연 순수익률로 통일',
          },
        },
        {
          event_type: 'qa_pin_created',
          metadata: {
            cohort: 'beta-1',
            sessionId: 'qa-broker-beta-1-b',
            workspace: 'im',
            pinMode: 'redpen',
            originalText: '캡레이트 4.2%',
            suggestedText: '연 순수익률  4.2%',
            reasonCategory: 'jargon_plain_korean',
          },
        },
        {
          event_type: 'qa_pin_created',
          metadata: {
            cohort: 'beta-1',
            sessionId: 'qa-broker-beta-1-c',
            workspace: 'dealcards',
            pinMode: 'redpen',
            originalText: '임대호가 3,000만',
            suggestedText: '월 임대료 3,000만',
            reasonCategory: 'cre_standard_term',
          },
        },
        {
          event_type: 'qa_pin_created',
          metadata: {
            cohort: 'beta-1',
            sessionId: 'qa-broker-beta-1-c',
            workspace: 'newsletter',
            pinMode: 'issue',
            note: '일반 레이아웃 메모',
          },
        },
        // Noise from another cohort must be excluded when filtering cohort='beta-1'
        {
          event_type: 'qa_pin_created',
          metadata: {
            cohort: 'beta-2',
            sessionId: 'qa-broker-beta-2-a',
            workspace: 'dealcards',
            pinMode: 'redpen',
            originalText: '임대호가 3,000만',
            suggestedText: '월 임대료 3,000만',
          },
        },
        // BYOD diffs: dealcard.headline = 2/4 (50% -> P0_PROMPT_TUNING), dealcard.priceBand = 1/4 (25% -> NORMAL)
        {
          event_type: 'qa_byod_anonymized_diff',
          metadata: {
            cohort: 'beta-1',
            sessionId: 's1',
            surface: 'dealcard',
            fields: { headline: true, priceBand: false },
          },
        },
        {
          event_type: 'qa_byod_anonymized_diff',
          metadata: {
            cohort: 'beta-1',
            sessionId: 's2',
            surface: 'dealcard',
            fields: { headline: true, priceBand: true },
          },
        },
        {
          event_type: 'qa_byod_anonymized_diff',
          metadata: {
            cohort: 'beta-1',
            sessionId: 's3',
            surface: 'dealcard',
            fields: { headline: false, priceBand: false },
          },
        },
        {
          event_type: 'qa_byod_anonymized_diff',
          metadata: {
            cohort: 'beta-1',
            sessionId: 's4',
            surface: 'dealcard',
            fields: { headline: false, priceBand: false },
          },
        },
      ];

      const report = analyzeBetaRedpenFlywheel(events, {
        cohort: 'beta-1',
        editRateThreshold: 0.4,
        minRedpenRepeat: 2,
      });

      expect(report.cohort).toBe('beta-1');
      expect(report.summary.totalPins).toBe(4);
      expect(report.summary.redpenPins).toBe(3);
      expect(report.summary.issuePins).toBe(1);
      expect(report.summary.lexiconPromotionCandidateCount).toBe(1);

      expect(report.lexiconPromotionCandidates[0]).toMatchObject({
        originalText: '캡레이트 4.2%',
        suggestedText: '연 순수익률 4.2%',
        count: 2,
        promoteToLexicon: true,
      });
      expect(report.lexiconPromotionCandidates[0].surfaces).toEqual(['dealcards', 'im']);

      const headlineStat = report.fieldEditRates.find(
        (f) => f.surface === 'dealcard' && f.field === 'headline',
      );
      const priceBandStat = report.fieldEditRates.find(
        (f) => f.surface === 'dealcard' && f.field === 'priceBand',
      );
      expect(headlineStat).toMatchObject({
        editedSessions: 2,
        totalSessions: 4,
        editRate: 0.5,
        priority: 'P0_PROMPT_TUNING',
      });
      expect(priceBandStat).toMatchObject({
        editedSessions: 1,
        totalSessions: 4,
        editRate: 0.25,
        priority: 'NORMAL',
      });
      expect(report.p0PromptTuningFields).toHaveLength(1);

      const md = renderBetaFlywheelMarkdown(report);
      expect(md).toContain('Beta Red-Pen Flywheel Report (beta-1)');
      expect(md).toContain('캡레이트 4.2%');
      expect(md).toContain('연 순수익률 4.2%');
      expect(md).toContain('P0_PROMPT_TUNING');
    });
  });
});
