/**
 * E-06 속보 (E2): 타게팅 규칙, 소유권(타 건물 404), 발송 결과 정직 보고, 발행 게이트.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, rowVisibleTo, type FakeCall } from './authz-fake-db';
import { selectFlashTargets } from '@/domain/magazine/distribute-special-edition';
import type { SubscriberRow } from '@/domain/magazine/send-batch';
import {
  describeSpecialResult,
  evaluatePublishGate,
  parseSpecialPreview,
  summarizeBlocked,
  targetingTiles,
  MAX_HEADLINE_LENGTH,
} from '@/components/magazine-editor/outreach/special-edition-helpers';

const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';
const B_OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B_FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  ctx: null as unknown,
  generate: vi.fn(),
  distribute: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return { ...actual, requireBrokerContext: async () => ({ ctx: h.ctx, error: null }) };
});
vi.mock('@/domain/magazine/special-edition-generator', () => ({ generateSpecialEdition: (...a: unknown[]) => h.generate(...a) }));
vi.mock('@/domain/magazine/distribute-special-edition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/magazine/distribute-special-edition')>();
  return { ...actual, distributeSpecialEdition: (...a: unknown[]) => h.distribute(...a) };
});

import { GET as specialGET, POST as specialPOST } from '@/app/api/broker/magazine/special/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] };

const BUILDINGS: Array<Record<string, unknown>> = [
  { id: B_OWN, owner_id: UA, raw_address: '서울 강남구 역삼동 1-1', area_signal: '강남', asset_type: '꼬마빌딩', price_band: '40~50억', layers: null },
  { id: B_FOREIGN, owner_id: UB, raw_address: '서울 마포구 3-3', area_signal: '마포', asset_type: '사옥', price_band: '100억', layers: null },
];

const mkSub = (id: string, tags: Record<string, unknown> | null, over: Record<string, unknown> = {}) => ({
  id,
  subscriber_name: `구독자-${id}`,
  subscriber_phone: '01012345678',
  segment: null,
  channel: 'email',
  interest_profile: tags ? { tags } : {},
  ...over,
});
const SUBS = [
  mkSub('s1', { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩'] }),
  mkSub('s2', { regions: ['마포', '홍대'], assetTypes: ['사옥'] }),
  mkSub('s3', null),
  mkSub('s4', { regions: ['강남'] }),
];

function setupDb(subsError = false) {
  h.db = createFakeDb((call: FakeCall) => {
    if (call.table === 'building_ssot_lite') return { data: rowVisibleTo(BUILDINGS, call, 'owner_id') ?? null };
    if (call.table === 'magazine_subscribers') {
      return subsError ? { error: { code: 'XX000', message: 'boom internal detail' } } : { data: SUBS };
    }
    return { data: null };
  }) as never;
}

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://credeal.net${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

beforeEach(() => {
  h.ctx = ctxA;
  h.generate.mockReset();
  h.distribute.mockReset();
  setupDb();
});

describe('속보 타게팅 selectFlashTargets (튜토리얼 예시)', () => {
  const subs = SUBS as unknown as SubscriberRow[];
  it('강남·서초+꼬마빌딩 구독자는 발송 대상, 마포·홍대+사옥 구독자는 제외', () => {
    const ids = selectFlashTargets(subs, { areaSignal: '강남', assetType: '꼬마빌딩' }).map((s) => s.id);
    expect(ids).toEqual(['s1']);
    expect(ids).not.toContain('s2');
  });
  it('태그 없는 구독자는 기본 제외, includeUntagged 명시 시에만 포함', () => {
    const base = selectFlashTargets(subs, { areaSignal: '강남', assetType: '꼬마빌딩' }).map((s) => s.id);
    const withUntagged = selectFlashTargets(subs, { areaSignal: '강남', assetType: '꼬마빌딩', includeUntagged: true }).map((s) => s.id);
    expect(base).not.toContain('s3');
    expect(withUntagged).toEqual(['s1', 's3']);
  });
  it('segment=investor 기본값만으로는 대상이 아니다(무조건 발송 — 태그 AND 규칙)', () => {
    const investor = [mkSub('s9', null, { segment: 'investor' })] as unknown as SubscriberRow[];
    expect(selectFlashTargets(investor, { areaSignal: '강남', assetType: '꼬마빌딩' })).toEqual([]);
  });
});

describe('GET /api/broker/magazine/special — 소유권·실제 컬럼', () => {
  it('타 브로커 건물은 404 (구독자 조회에 도달하지 않음)', async () => {
    const res = await specialGET(req(`/api/broker/magazine/special?buildingId=${B_FOREIGN}`));
    expect(res.status).toBe(404);
    expect((h.db.calls as FakeCall[]).some((c) => c.table === 'magazine_subscribers')).toBe(false);
  });

  it('본인 건물: raw_address/area_signal/asset_type/price_band 로 실제 정보 + 타게팅 수치', async () => {
    const res = await specialGET(req(`/api/broker/magazine/special?buildingId=${B_OWN}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.building).toMatchObject({ id: B_OWN, address: '서울 강남구 역삼동 1-1', areaSignal: '강남', assetType: '꼬마빌딩', priceDisplay: '40~50억' });
    expect(json).toMatchObject({ total: 4, matched: 1, untagged: 1, matchable: true });
    expect(json.defaultHeadline).toBe('[단독 속보] 강남 꼬마빌딩 (40~50억)');
    // building_ssot_lite 에 없는 컬럼을 조회하지 않는다
    const sel = (h.db.calls as FakeCall[]).find((c) => c.table === 'building_ssot_lite')!;
    const cols = String((sel.filters.find((f) => f[0] === 'select')?.[1]) ?? '');
    expect(cols).toContain('raw_address');
    expect(cols).not.toMatch(/\baddress\b(?!_)/);
    expect(cols).not.toContain('price,');
    // 건물 소유 검증은 owner_id 로
    expect(sel.filters.some((f) => f[0] === 'in' && f[1] === 'owner_id')).toBe(true);
  });

  it('구독자 조회 실패는 빈 목록으로 위장하지 않고 500 + 일반 문구 (내부 오류 비노출)', async () => {
    setupDb(true);
    const res = await specialGET(req(`/api/broker/magazine/special?buildingId=${B_OWN}`));
    expect(res.status).toBe(500);
    const txt = await res.text();
    expect(txt).not.toContain('boom internal detail');
  });

  it('buildingId 가 uuid 가 아니면 400', async () => {
    const res = await specialGET(req('/api/broker/magazine/special?buildingId=not-uuid'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/broker/magazine/special — 검증 선행·정직한 결과', () => {
  const EDITION = { id: 'ed-1', title: '[단독 속보] 강남 꼬마빌딩', status: 'published' };

  it('타 브로커 건물은 404 — 에디션 생성/발송 호출 없음', async () => {
    const res = await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_FOREIGN, headline: 'x', autoDistribute: true } }));
    expect(res.status).toBe(404);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.distribute).not.toHaveBeenCalled();
  });

  it('autoDistribute 미지정 → 발행만(발송 시도 없음)', async () => {
    h.generate.mockResolvedValue(EDITION);
    const res = await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_OWN, headline: 'h' } }));
    const json = await res.json();
    expect(json).toMatchObject({ success: true, distributionResult: null });
    expect(h.distribute).not.toHaveBeenCalled();
    expect(describeSpecialResult({ ok: res.ok, status: res.status, json, autoDistribute: false }).kind).toBe('published_only');
  });

  it('발송 기능 중지(SEND_DISABLED): 발행은 됐지만 발송은 중지 — 성공으로 위장하지 않음', async () => {
    h.generate.mockResolvedValue(EDITION);
    h.distribute.mockResolvedValue({ ok: false, blockedReason: 'SEND_DISABLED', message: '발송 중지', dryRun: false, total: 0, sent: 0, failed: 0, recorded: 0, blocked: {} });
    const res = await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_OWN, autoDistribute: true } }));
    const json = await res.json();
    expect(json).toMatchObject({ success: false, blocked: 'SEND_DISABLED', published: true, sent: 0 });
    const out = describeSpecialResult({ ok: res.ok, status: res.status, json, autoDistribute: true });
    expect(out).toMatchObject({ kind: 'send_stopped', published: true, sent: 0 });
    expect(out.title).toContain('발행되었지만 발송은 중지');
  });

  it('dry-run: 실제 발송 없음을 명시하고 sent 는 0', async () => {
    h.generate.mockResolvedValue(EDITION);
    h.distribute.mockResolvedValue({ ok: true, dryRun: true, total: 1, sent: 0, failed: 0, recorded: 1, blocked: {}, kakaoSent: 0, emailSent: 0 });
    const res = await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_OWN, autoDistribute: true } }));
    const json = await res.json();
    const out = describeSpecialResult({ ok: res.ok, status: res.status, json, autoDistribute: true });
    expect(out.kind).toBe('dry_run');
    expect(out.sent).toBe(0);
    expect(out.title).toContain('실제 발송은 없어요');
  });

  it('includeUntagged 는 body 에 명시했을 때만 distribute 로 전달', async () => {
    h.generate.mockResolvedValue(EDITION);
    h.distribute.mockResolvedValue({ ok: true, dryRun: false, total: 0, sent: 0, failed: 0, recorded: 0, blocked: {} });
    await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_OWN, autoDistribute: true } }));
    expect(h.distribute.mock.calls[0][1]).toMatchObject({ includeUntagged: false, areaSignal: '강남', assetType: '꼬마빌딩' });
    await specialPOST(req('/api/broker/magazine/special', { method: 'POST', body: { buildingId: B_OWN, autoDistribute: true, includeUntagged: true } }));
    expect(h.distribute.mock.calls[1][1]).toMatchObject({ includeUntagged: true });
  });
});

describe('describeSpecialResult / evaluatePublishGate / parseSpecialPreview', () => {
  it('HTTP 200 이라도 success:false(SEND_DISABLED 제외)는 오류로 보고', () => {
    const out = describeSpecialResult({ ok: true, status: 200, json: { success: false, error: '속보 생성에 실패했어요' }, autoDistribute: true });
    expect(out.kind).toBe('error');
    expect(out.published).toBe(false);
  });

  it('실발송 건수가 있으면 sent, 없으면 none_sent + 차단 사유 한글 표기', () => {
    const sent = describeSpecialResult({ ok: true, status: 200, json: { success: true, sent: 3, failed: 0, blocked: {} }, autoDistribute: true });
    expect(sent).toMatchObject({ kind: 'sent', sent: 3 });
    const none = describeSpecialResult({ ok: true, status: 200, json: { success: true, sent: 0, failed: 0, blocked: { DAILY_CAP: 2 } }, autoDistribute: true });
    expect(none.kind).toBe('none_sent');
    expect(none.detail).toContain('발송 상한 초과');
    expect(summarizeBlocked({ DAILY_CAP: 2, X: 0 })).toBe('발송 상한 초과(속보는 주 2회까지) 2건');
  });

  const preview = parseSpecialPreview({
    building: { id: B_OWN, address: '서울', areaSignal: '강남', assetType: '꼬마빌딩', priceDisplay: null },
    total: 4, matched: 1, hotLeads: 0, untagged: 1, matchable: true, matchedPreview: [{ id: 's1', name: '가', temperature: '📈 관심', color: '#fff' }], defaultHeadline: null,
  });

  it('parseSpecialPreview: 정상/형식 불일치(null)', () => {
    expect(preview).not.toBeNull();
    expect(preview?.matched).toBe(1);
    expect(parseSpecialPreview({ error: 'x' })).toBeNull();
    expect(parseSpecialPreview(null)).toBeNull();
    expect(targetingTiles(preview!).map((t) => t.label)).toEqual(['전체 구독자', '매칭 대상', '핫리드', '태그 없음']);
  });

  const base = { loading: false, loadFailed: false, preview, headline: '헤드라인', autoDistribute: false, publishing: false };
  it('발행 게이트: 로드 실패/로딩/빈 헤드라인/과장 길이는 비활성', () => {
    expect(evaluatePublishGate(base).canPublish).toBe(true);
    expect(evaluatePublishGate({ ...base, loadFailed: true }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, preview: null }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, loading: true }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, headline: '  ' }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, headline: 'x'.repeat(MAX_HEADLINE_LENGTH + 1) }).canPublish).toBe(false);
  });
  it('발행 게이트: 발송 포함 시 대상 0명/매칭 불가면 비활성(발행만은 가능)', () => {
    expect(evaluatePublishGate({ ...base, autoDistribute: true }).canPublish).toBe(true);
    expect(evaluatePublishGate({ ...base, autoDistribute: true, preview: { ...preview!, matched: 0 } }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, autoDistribute: true, preview: { ...preview!, matchable: false } }).canPublish).toBe(false);
    expect(evaluatePublishGate({ ...base, preview: { ...preview!, matchable: false } }).canPublish).toBe(true);
  });
});
