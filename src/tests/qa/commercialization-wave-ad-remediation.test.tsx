/**
 * @file src/tests/qa/commercialization-wave-ad-remediation.test.tsx
 * @description Commercialization Deep-Audit Wave A–D Regression Suite (P0 & P1 Blockers)
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import PptxGenJS from 'pptxgenjs';

const hoistedMocks = vi.hoisted(() => ({
  fetchCadastralMapImage: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(true),
  requireBroker: vi.fn(),
}));

vi.mock('@/lib/external/vworld-wms-cadastral', () => ({
  fetchCadastralMapImage: (...args: unknown[]) => hoistedMocks.fetchCadastralMapImage(...args),
}));

vi.mock('@/lib/rate-limiter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limiter')>();
  return {
    ...actual,
    checkRateLimit: (...args: unknown[]) => hoistedMocks.checkRateLimit(...args),
  };
});

import { POST as postBuyerIntentFromMemo } from '@/app/api/broker/buyer-intents/from-memo/route';
import { GET as getCadastralMap } from '@/app/api/public/map/cadastral/route';
import { getModel } from '@/ai/model-selector';
import { getServerEnv, getProductionReadinessWarnings } from '@/lib/env';
import { calculateCost, MODEL_PRICING } from '@/ai/cost-tracker';
import { sendInboxClientEmail, buildInboxCopyBundle } from '@/domain/inbox/inbox-outbound';
import { mergeHydratedEdition } from '@/domain/magazine/send-batch';
import { NewsletterDeliveryReceiptsPanel } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterDeliveryReceiptsPanel';
import { resolveTenantAndUse } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { buildA12Ownership } from '@/domain/building/mobile-im/pptx/archetypes/a12-ownership';
import { isBuildingWideRevocationEvent } from '@/lib/im-lite/im-public-guard';
import {
  computeBrokerStatutoryCompleteness,
  extractSanitizedStatutoryItems,
} from '@/lib/legal/broker-statutory-disclosure';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { formatKrwAmount } from '@/domain/magazine/templates/format';

const ROOT = process.cwd();
const readRepo = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Commercialization Deep-Audit Wave A–D Regression Suite', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    hoistedMocks.fetchCadastralMapImage.mockReset();
    hoistedMocks.checkRateLimit.mockReset();
    hoistedMocks.checkRateLimit.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('C-01: POST /api/broker/buyer-intents/from-memo rejects unauthenticated callers with 401', async () => {
    const req = new NextRequest('http://localhost/api/broker/buyer-intents/from-memo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memo: '강남구 역삼동 100억대 빌딩 매수 희망' }),
    });
    const res = await postBuyerIntentFromMemo(req);
    expect(res.status).toBe(401);
  });

  it('C-02: GET /api/public/map/cadastral enforces first-party 403, PNU 400, rate-limit 429 & valid 200 PNG', async () => {
    const noRef = await getCadastralMap(
      new NextRequest('http://localhost/api/public/map/cadastral?pnu=1168010100107360001'),
    );
    expect(noRef.status).toBe(403);

    const badPnu = await getCadastralMap(
      new NextRequest('http://localhost/api/public/map/cadastral?pnu=bad', {
        headers: { referer: 'http://localhost/im-lite/b-1' },
      }),
    );
    expect(badPnu.status).toBe(400);

    hoistedMocks.checkRateLimit.mockResolvedValueOnce(false);
    const limited = await getCadastralMap(
      new NextRequest('http://localhost/api/public/map/cadastral?pnu=1168010100107360001', {
        headers: { referer: 'http://localhost/im-lite/b-1' },
      }),
    );
    expect(limited.status).toBe(429);

    hoistedMocks.fetchCadastralMapImage.mockResolvedValueOnce({
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    const ok = await getCadastralMap(
      new NextRequest(
        'http://localhost/api/public/map/cadastral?pnu=1168010100107360001&lat=37.501&lng=127.039',
        { headers: { referer: 'http://localhost/im-lite/b-1' } },
      ),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
  });

  it('C-03: schedule_0830 fail-closed in distribute-queue & distribute route without falling back to immediate send', () => {
    const queueSrc = readRepo('src/domain/magazine/distribute-queue.ts');
    const distSrc = readRepo('src/app/api/broker/magazine/distribute/route.ts');
    expect(queueSrc).toContain("blockedReason: 'SCHEDULE_UNAVAILABLE'");
    expect(queueSrc).not.toContain('const strippedChunk');
    expect(distSrc).toContain('if (queueRes.queueUnavailable)');
    expect(distSrc).toContain('if (scheduleMorning)');
    expect(distSrc).toContain('blocked: "SCHEDULE_UNAVAILABLE"');
    expect(distSrc).toContain('{ status: 503 }');
  });

  it('C-04: inbox-outbound fails closed in real production runtime when RESEND_API_KEY missing & env readiness warns', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example-prod.supabase.co');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('UNSUBSCRIBE_SECRET', '');

    const warnings = getProductionReadinessWarnings();
    expect(warnings.some((w) => w.includes('RESEND_API_KEY'))).toBe(true);
    expect(warnings.some((w) => w.includes('MAGAZINE_SEND_DRY_RUN'))).toBe(true);

    const res = await sendInboxClientEmail({
      toEmail: 'buyer@example.co.kr',
      brokerName: '김선임',
      brokerCompany: '크리딜중개법인',
      brokerPhone: '02-555-1234',
      clientName: '박대표',
      buildingTitle: '강남 역세권 빌딩',
      shareUrl: 'https://credeal.net/dc/deal-1?sid=tok',
      deliveryPurpose: 'transactional_reply',
      transactionalBasis: 'im_request',
    });
    expect(res.ok).toBe(false);
    expect(res.simulated).toBeFalsy();
  });

  it('C-05: BrokerSeniorLayout mounts BrokerBottomNav when showTopbar is true & /broker/profile escape is outside disabled fieldset', () => {
    const layoutSrc = readRepo('src/components/layout/BrokerSeniorLayout.tsx');
    const profileSrc = readRepo('src/app/(broker)/broker/profile/page.tsx');
    expect(layoutSrc).toContain('showTopbar && <BrokerBottomNav');
    const fieldsetStart = profileSrc.indexOf('<fieldset disabled={loading}');
    const escapeLink = profileSrc.indexOf('4대 업무 홈으로');
    expect(fieldsetStart).toBeGreaterThan(-1);
    expect(escapeLink).toBeGreaterThan(-1);
    expect(escapeLink).toBeLessThan(fieldsetStart);
  });

  it('C-06: model-selector, env, openai & cost-tracker align on gpt-6.1-terra and cap retryTokenBudget <= 4096', () => {
    const prevTerra = process.env.AI_MODEL_TERRA;
    const prevDefault = process.env.AI_DEFAULT_MODEL;
    delete process.env.AI_MODEL_TERRA;
    delete process.env.AI_DEFAULT_MODEL;
    try {
      expect(getModel('terra')).toBe('gpt-6.1-terra');
      expect(getServerEnv().AI_DEFAULT_MODEL).toBe('gpt-6.1-terra');
      expect(getServerEnv().AI_MODEL_TERRA).toBe('gpt-6.1-terra');
    } finally {
      if (prevTerra !== undefined) process.env.AI_MODEL_TERRA = prevTerra;
      if (prevDefault !== undefined) process.env.AI_DEFAULT_MODEL = prevDefault;
    }
    expect(MODEL_PRICING['gpt-6.1-terra']).toBeDefined();
    expect(calculateCost('gpt-6.1-terra', 1000, 1000)).toBeGreaterThan(0);

    const openaiSrc = readRepo('src/ai/providers/openai.ts');
    expect(openaiSrc).toContain('Math.min(firstTokenBudget * 2, 4096)');
    expect(openaiSrc).not.toContain('* 4');
  });

  it('C-07/C-08/C-09/M-13: zero nonexistent 42703 column selects/updates remain on live hot paths', () => {
    const translateSrc = readRepo('src/app/api/public/im-lite/[buildingId]/translate/route.ts');
    const genAsyncSrc = readRepo('src/app/api/broker/im-lite/generate-async/route.ts');
    const pubImSrc = readRepo('src/app/api/public/im-lite/[buildingId]/route.ts');
    const dcPatchSrc = readRepo('src/app/api/broker/deal-card/[id]/route.ts');
    const saveSecSrc = readRepo('src/app/api/broker/im-lite/[id]/save-sections/route.ts');

    expect(translateSrc).toContain(".select('id, owner_id, building_id, body, status, document_type')");
    expect(translateSrc).not.toContain('body, metadata');
    expect(translateSrc).not.toMatch(/\.update\(\s*\{\s*metadata:/);
    expect(genAsyncSrc).toContain('.select("layers")');
    expect(genAsyncSrc).not.toContain('.select("layers, lease_summary")');
    expect(pubImSrc).not.toContain('completeness_score,');
    expect(dcPatchSrc).not.toContain('signalCardUpdate.hook_copy');
    expect(saveSecSrc).toContain('doc_id: id');
    expect(saveSecSrc).toContain('original_ai_content');
    expect(saveSecSrc).toContain('edited_broker_content');
    expect(saveSecSrc).toContain('char_diff_count');
  });

  it('H-01 & H-02 & M-05: preferHydrated respects shortened briefing edits, DeliveryReceipts shows 08:30 scheduled badge, and format preserves 가격 협의', () => {
    const merged = mergeHydratedEdition(
      {
        title: '구 제목',
        headline: '• 이전 긴 브리핑 문구입니다\n• 두 번째 줄\n• 세 번째 줄',
        marketTemp: '관망',
        date: '2026-11-26',
        url: 'https://credeal.net/magazine/kim/2026-11-26',
      },
      { title: '새 제목', headline: '• 축약 브리핑\n• 핵심 수치\n• 체크 포인트', marketTemp: '매수 우위' },
      { preferHydrated: true },
    );
    expect(merged.title).toBe('새 제목');
    expect(merged.headline).toBe('• 축약 브리핑\n• 핵심 수치\n• 체크 포인트');
    expect(merged.marketTemp).toBe('매수 우위');

    const html = renderToStaticMarkup(
      <NewsletterDeliveryReceiptsPanel
        receipts={[
          {
            id: 'r-1',
            recipientLabel: '홍성표 (buyer@test.kr)',
            editionLabel: '2026년 11월 4주차',
            channel: 'email',
            status: 'scheduled',
            sentAt: '2026-11-26T00:00:00Z',
            scheduledFor: '2026-11-26T23:30:00Z',
            openedAt: null,
          },
        ]}
        distributions={[
          {
            createdAt: '2026-11-26T00:00:00Z',
            date: '2026-11-26',
            issueDate: '2026-11-26',
            sentCount: 0,
            failedCount: 0,
            recordedCount: 0,
            totalCount: 12,
            queuedCount: 0,
            scheduledCount: 12,
            scheduledForIso: '2026-11-26T23:30:00Z',
            dryRun: false,
          },
        ]}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onCancelSchedule={() => {}}
      />,
    );
    expect(html).toContain('오전 08:30 예약됨');
    expect(html).toContain('예약 12건');
    expect(html).toContain('예약 취소');
    expect(formatKrwAmount('가격 협의')).toBe('가격 협의');
  });

  it('H-05: Inbox copy bundle avoids double greeting and replaces 익명 열람객 with 고객', () => {
    const bundle = buildInboxCopyBundle({
      brokerName: '이중개',
      brokerPhone: '010-1234-5678',
      clientName: '익명 열람객',
      buildingTitle: '성수동 코너 빌딩',
      shareUrl: 'https://credeal.net/dc/d1?sid=t1',
      brief: '고객님, 안녕하세요. 성수동 코너 빌딩 브리핑입니다.',
    });
    expect(bundle.messageText).not.toContain('익명 열람객님');
    const greetingMatches = bundle.messageText.match(/안녕하세요/g) ?? [];
    expect(greetingMatches.length).toBe(1);
  });

  it('H-07 & H-08: resolveTenantAndUse never emits 임차인 A~E & A12 10-row ownership table renders cleanly on 1 slide', () => {
    const party = resolveTenantAndUse({ tenant_type: '사무실' }, { maskSeq: 0 });
    expect(party.tenant).toBe('사무실');
    expect(party.tenant).not.toMatch(/임차인\s*[A-Z]/);
    expect(party.use).toBe('-');

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const rows = Array.from({ length: 10 }, (_, i) => [`근저당권 ${i + 1}`, `2024-01-0${(i % 9) + 1}`, `비고 ${i + 1}`]);
    buildA12Ownership({
      pres,
      slideNum: 1,
      docno: 'DOC-A12',
      grade: 'A',
      provenance: {},
      data: {
        headers: ['구분', '권리 내용', '비고'],
        rows,
      },
    });
    expect((pres as unknown as { slides: unknown[] }).slides).toHaveLength(1);
  });

  it('H-10 & H-11 & H-12 & H-13: news isolation, revocation scope skip, strict representative_name & blind-guard phone/N가 fixes', () => {
    const newsSrc = readRepo('src/app/api/broker/magazine/news-channels/route.ts');
    expect(newsSrc).not.toContain('.from("external_news")\n          .upsert');

    expect(isBuildingWideRevocationEvent({ scope: 'thread' })).toBe(false);
    expect(isBuildingWideRevocationEvent({ scope: 'recipient_approval' })).toBe(false);
    expect(isBuildingWideRevocationEvent({ scope: 'building' })).toBe(true);

    const comp = computeBrokerStatutoryCompleteness({
      company: '크리딜중개법인',
      office_address: '서울시 강남구 테헤란로 100',
      office_reg_number: '11680-2025-09999',
      phone: '02-555-8888',
      display_name: '소속중개사김씨',
    });
    expect(comp.isComplete).toBe(false);
    expect(comp.missingFields).toContain('representative_name');

    const statutory = extractSanitizedStatutoryItems({
      company: '크리딜중개법인',
      office_address: '서울시 강남구 테헤란로 100',
      office_reg_number: '11680-2025-09999',
      phone: '02-555-8888',
      display_name: '소속중개사김씨',
    });
    expect(statutory.representativeName).toBeNull();

    const cleaned = cleanBlindPoints([
      '문의 010-1234-5678 홍길동 대표 / 더 레드 빌딩 / 성수동 1가 656 인근',
    ])[0];
    expect(cleaned).not.toContain('5678');
    expect(cleaned).not.toContain('홍길동');
    expect(cleaned).not.toContain('더 레드 빌딩');
    expect(cleaned).not.toContain('656');
  });
});
