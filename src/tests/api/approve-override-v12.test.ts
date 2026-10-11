/**
 * 승인 시점 V12 해제 — POST /api/broker/im-lite/[id]/approve-override 라우트 + 도메인 계약
 *  - 사유 필수·비어있지 않음·200자 이하·제어문자/<> 제거
 *  - by/at 서버 기록 (클라이언트 값 무시), override_log(stage:'approval') 추가, gateReport 재평가·영속
 *  - V12 만 해제 가능: V01 은 해제 후에도 차단 유지
 *  - 소유자만 / 발행 문서·V12 비차단 문서는 409
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { runApprovalGate } from '@/domain/building/im-core';
import { ClaimRegistry } from '@/domain/building/im-core';

const USER = 'u0000000-0000-0000-0000-000000000001';
const OTHER = 'u0000000-0000-0000-0000-000000000002';
const DOC = 'd0000000-0000-0000-0000-000000000001';

const mockRequireBroker = vi.fn();
vi.mock('@/lib/auth-guard', () => ({ requireBroker: (...a: any[]) => mockRequireBroker(...a) }));

let docRow: any;
let updateSpy: any;
let updateError: any;
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: docRow, error: null }) }) }),
      update: (payload: any) => {
        updateSpy(payload);
        return { eq: async () => ({ error: updateError }) };
      },
    }),
  }),
}));

const live = (over: Record<string, unknown> = {}) => ({ floor: '1F', area_sqm: 100, rent_manwon: 300, deposit_manwon: 3000, mgmt_fee_manwon: 30, ...over });

/** V12 만 차단: Σ임대면적 300 ÷ J4 100 = 3.0 (> 2) */
const v12Body = (over: Record<string, any> = {}) => ({
  im_type: 'mobile_im_lite',
  releaseTier: 'fact_om',
  floor_leases: [live(), live({ floor: '2F' }), live({ floor: '3F' })],
  rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 100 },
  rentroll_checks: { V12: { code: 'V12', level: 'block', overridden: false, value: 3, message: '단위 혼동 의심' } },
  gateReport: { scope: 'rentroll_v15', blocked: true, failedBlocks: [{ id: 'V12' }], results: [] },
  override_log: undefined,
  ...over,
});

function makeDoc(body: any, over: Record<string, unknown> = {}) {
  return { id: DOC, owner_id: USER, broker_id: null, status: 'pending_approval', body, ...over };
}

function req(payload: unknown) {
  return new NextRequest(`http://localhost/api/broker/im-lite/${DOC}/approve-override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

describe('POST /api/broker/im-lite/[id]/approve-override (V12 승인 시점 해제)', () => {
  let POST: typeof import('@/app/api/broker/im-lite/[id]/approve-override/route').POST;
  const call = (payload: unknown) => POST(req(payload), { params: Promise.resolve({ id: DOC }) });

  beforeEach(async () => {
    vi.clearAllMocks();
    updateSpy = vi.fn();
    updateError = null;
    POST = (await import('@/app/api/broker/im-lite/[id]/approve-override/route')).POST;
    mockRequireBroker.mockResolvedValue({ user: { id: USER }, role: 'broker', error: null });
    docRow = makeDoc(v12Body());
  });

  it('사유와 함께 해제: 게이트 통과(note 에 사유) + rent_roll_meta/override_log 기록 + 해시 재계산, by/at 은 서버 값', async () => {
    const before = Date.now();
    const res = await call({ reason: '일부 층만 매각', by: 'attacker', at: '1999-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.gateReport.blocked).toBe(false);
    expect(json.gateReport.failedBlocks).toEqual([]);
    const v12 = json.gateReport.results.find((g: any) => g.id === 'V12');
    expect(v12).toMatchObject({ passed: true });
    expect(v12.note).toContain('일부 층만 매각');
    expect(json.targetHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // by/at 서버 채움
    expect(json.override.reason).toBe('일부 층만 매각');
    expect(json.override.by).toBe(USER);
    expect(json.override.at).not.toBe('1999-01-01T00:00:00.000Z');
    expect(new Date(json.override.at).getTime()).toBeGreaterThanOrEqual(before - 1000);

    // 영속 payload
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const body = updateSpy.mock.calls[0][0].body;
    expect(body.rent_roll_meta.area_unit_override).toEqual({ reason: '일부 층만 매각', by: USER, at: json.override.at });
    expect(body.rent_roll_meta.gfa_sqm).toBe(100); // 기존 메타 보존
    expect(body.override_log).toEqual([
      { code: 'AREA_UNIT_MISMATCH', reason: '일부 층만 매각', by: USER, at: json.override.at, stage: 'approval' },
    ]);
    expect(body.gateReport.blocked).toBe(false);
    expect(body.targetHash).toBe(json.targetHash);
    expect(body.approval_target_hash).toBe(json.targetHash);
    // 저장된 V12 재계산 결과도 해제 상태로 정합
    expect(body.rentroll_checks.V12).toMatchObject({ level: 'warn', overridden: true });
    expect(body.rentroll_checks.V12.message).toContain('일부 층만 매각');
  });

  it('기존 override_log 는 보존하고 뒤에 추가한다', async () => {
    const prior = { code: 'AREA_UNIT_MISMATCH', reason: '이전', by: USER, at: '2026-10-01T00:00:00.000Z' };
    docRow = makeDoc(v12Body({ override_log: [prior] }));
    const res = await call({ reason: '재해제' });
    expect(res.status).toBe(200);
    const log = updateSpy.mock.calls[0][0].body.override_log;
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual(prior);
    expect(log[1]).toMatchObject({ reason: '재해제', stage: 'approval', by: USER });
  });

  it('사유 정제: 제어문자 → 공백, <> 제거', async () => {
    const res = await call({ reason: '  일부\n층 <b>매각</b>\t  ' });
    expect(res.status).toBe(200);
    expect((await res.json()).override.reason).toBe('일부 층 b매각/b');
  });

  it('[NEG] 빈/공백/누락/비문자열 사유는 400 + 문서 미변경', async () => {
    for (const bad of [{ reason: '' }, { reason: '   ' }, {}, { reason: 123 }, { reason: '<><>' }, { reason: null }]) {
      updateSpy.mockClear();
      const res = await call(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('V12 해제 사유');
      expect(updateSpy).not.toHaveBeenCalled();
    }
  });

  it('[NEG] 200자 초과 사유는 400 (자르지 않는다), 200자는 허용', async () => {
    const tooLong = await call({ reason: '가'.repeat(201) });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error).toContain('200자 이하');
    expect(updateSpy).not.toHaveBeenCalled();

    const ok = await call({ reason: '가'.repeat(200) });
    expect(ok.status).toBe(200);
  });

  it('[NEG] 잘못된 JSON 은 400', async () => {
    const res = await call('{not-json');
    expect(res.status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('[NEG] V01(월세 누락)은 해제 불가 — V12 를 풀어도 V01 이 남아 blocked 유지', async () => {
    docRow = makeDoc(v12Body({
      floor_leases: [live({ rent_manwon: undefined }), live({ floor: '2F' }), live({ floor: '3F' })],
    }));
    const res = await call({ reason: '일부 층만 매각' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gateReport.blocked).toBe(true);
    expect(json.gateReport.failedBlocks.map((g: any) => g.id)).toEqual(['V01']);
    expect(json.gateReport.results.find((g: any) => g.id === 'V12').passed).toBe(true);
    expect(json.gateReport.results.find((g: any) => g.id === 'V01').passed).toBe(false);
  });

  it('[NEG] V12 가 차단 중이 아니면(면적 정상) 409 — 쓸데없는 해제 기록을 남기지 않는다', async () => {
    docRow = makeDoc(v12Body({ rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 300 } }));
    const res = await call({ reason: '그냥' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('V12_NOT_BLOCKING');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('[NEG] 렌트롤이 없는 문서는 409', async () => {
    docRow = makeDoc({ im_type: 'mobile_im_lite' });
    const res = await call({ reason: '사유' });
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('[NEG] 다른 중개인 문서는 403, 없는 문서는 404, 발행된 문서는 409', async () => {
    docRow = makeDoc(v12Body(), { owner_id: OTHER });
    expect((await call({ reason: '사유' })).status).toBe(403);

    docRow = makeDoc(v12Body(), { owner_id: OTHER, broker_id: USER });
    expect((await call({ reason: '사유' })).status).toBe(200); // broker_id 우선

    docRow = null;
    expect((await call({ reason: '사유' })).status).toBe(404);

    docRow = makeDoc(v12Body(), { status: 'published' });
    const pub = await call({ reason: '사유' });
    expect(pub.status).toBe(409);
    expect((await pub.json()).code).toBe('ALREADY_PUBLISHED');
  });

  it('[NEG] 인증 실패 시 가드 응답을 그대로 반환', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireBroker.mockResolvedValue({ user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    updateSpy.mockClear();
    const res = await call({ reason: '사유' });
    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('DB 쓰기 실패는 500', async () => {
    updateError = { message: 'db down' };
    const res = await call({ reason: '사유' });
    expect(res.status).toBe(500);
  });

  it('해제 후 저장된 gateReport.blocked=false 면 approve 의 ApprovalGate publishBlocked 가 풀린다 (해제 전엔 차단)', async () => {
    const registry = () => {
      const r = new ClaimRegistry();
      r.register({ subject: 'asking_price', value: 1e10, evidence: [], provenance: 'broker', asOf: new Date().toISOString(), status: 'reconciled' } as any);
      r.register({ subject: 'total_area', value: 1000, evidence: [], provenance: 'public_api', asOf: new Date().toISOString(), status: 'reconciled' } as any);
      r.register({ subject: 'gross_yield', value: 4, evidence: [], provenance: 'broker', asOf: new Date().toISOString(), status: 'reconciled' } as any);
      return r;
    };
    const blocked = runApprovalGate(registry(), 'fact_om', { publishBlocked: (docRow.body.gateReport as any).blocked === true, posture: 'income' });
    expect(blocked.passed).toBe(false);

    const res = await call({ reason: '일부 층만 매각' });
    const { gateReport } = await res.json();
    const released = runApprovalGate(registry(), 'fact_om', { publishBlocked: gateReport.blocked === true, posture: 'income' });
    expect(released.passed).toBe(true);
  });
});
