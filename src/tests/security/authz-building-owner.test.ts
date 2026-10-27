/**
 * P0-SEC (SEC-1·SEC-2) — 매물/문서 소유권 단일 헬퍼 + 핵심 라우트 연동 회귀 테스트
 *
 *  - assertBuildingOwner: owner 허용 / 타 브로커 403 / 행 없음 404 / owner null 403 / admin 우회 / 조회 오류 500
 *  - assertDocOwner·assertDealOwner: 문서 owner / 문서→매물 owner 위임 / 미존재 404
 *  - generate-async: 비소유자 403 + im_generation_jobs 미삽입, 소유자 200
 *  - deal-card PATCH: 비소유자 403 + 문서/SSoT 미변경, owner null 403, 소유자 200 (readWithMigration 미사용)
 *  - job-status / jobs/[id]: 타인 작업 404
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  assertBuildingOwner,
  assertDocOwner,
  assertDealOwner,
} from '@/lib/authz/assert-owner';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const BUILDING = 'a0000000-0000-0000-0000-000000000001';
const NULL_OWNER_BUILDING = 'a0000000-0000-0000-0000-000000000002';
const MISSING_BUILDING = 'a0000000-0000-0000-0000-00000000dead';
const DOC = 'd0000000-0000-0000-0000-000000000001';
const ORPHAN_DOC = 'd0000000-0000-0000-0000-000000000002';

// ─── 공용 가짜 Supabase (테이블별 id → row) ───────────────────────────────
type Rows = Record<string, Record<string, Record<string, unknown>>>;
interface Recorded { table: string; op: string; args: unknown[] }

function makeFakeDb(rows: Rows, opts: { errorTables?: string[] } = {}) {
  const recorded: Recorded[] = [];
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    let selectCols = '*';
    const q: any = {
      select(cols?: string) { selectCols = cols ?? '*'; recorded.push({ table, op: 'select', args: [cols] }); return q; },
      eq(col: string, val: unknown) { filters[col] = val; return q; },
      in() { return q; },
      order() { return q; },
      limit() { return q; },
      async maybeSingle() {
        if (opts.errorTables?.includes(table)) return { data: null, error: { message: 'boom' } };
        const id = filters.id as string | undefined;
        if (id !== undefined) return { data: rows[table]?.[id] ?? null, error: null, selectCols };
        // building_id 기반 조회 (deal-card teaser 문서 등)
        const match = Object.values(rows[table] ?? {}).find((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v),
        );
        return { data: match ?? null, error: null };
      },
      async single() { return q.maybeSingle(); },
      update(patch: unknown) {
        recorded.push({ table, op: 'update', args: [patch] });
        const u: any = { eq: async () => ({ data: null, error: null }) };
        return u;
      },
      insert(row: unknown) {
        recorded.push({ table, op: 'insert', args: [row] });
        return Promise.resolve({ data: null, error: null });
      },
      upsert(row: unknown) {
        recorded.push({ table, op: 'upsert', args: [row] });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return q;
  };
  return { recorded, client: { from: vi.fn((t: string) => builder(t)) } };
}

const BASE_ROWS: Rows = {
  building_ssot_lite: {
    [BUILDING]: { id: BUILDING, owner_id: OWNER, area_signal: '강남구' },
    [NULL_OWNER_BUILDING]: { id: NULL_OWNER_BUILDING, owner_id: null },
  },
  document_objects: {
    [DOC]: { id: DOC, owner_id: null, building_id: BUILDING },
    [ORPHAN_DOC]: { id: ORPHAN_DOC, owner_id: null, building_id: null },
  },
};

// ─── 1. 헬퍼 단위 테스트 ───────────────────────────────────────────────
describe('assertBuildingOwner — building_ssot_lite.owner_id 직접 판정', () => {
  it('소유자 → 허용', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r = await assertBuildingOwner(client, BUILDING, OWNER);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.viaAdmin).toBe(false);
      expect(r.ownerId).toBe(OWNER);
    }
    expect(client.from).toHaveBeenCalledWith('building_ssot_lite');
    expect(client.from).not.toHaveBeenCalledWith('assets');
  });

  it('다른 브로커 → 403', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r = await assertBuildingOwner(client, BUILDING, OTHER, { allowAdmin: true, role: 'broker' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.code).toBe('FORBIDDEN');
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.ok).toBe(false);
      expect(typeof body.error).toBe('string');
    }
  });

  it('행 없음 → 404', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r = await assertBuildingOwner(client, MISSING_BUILDING, OWNER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it('owner_id null → 403 (fail-closed)', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r = await assertBuildingOwner(client, NULL_OWNER_BUILDING, OWNER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('admin + allowAdmin → 허용 (viaAdmin), owner null 매물도 허용', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r1 = await assertBuildingOwner(client, BUILDING, ADMIN, { allowAdmin: true, role: 'admin' });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.viaAdmin).toBe(true);
    const r2 = await assertBuildingOwner(client, NULL_OWNER_BUILDING, ADMIN, { allowAdmin: true, role: 'admin' });
    expect(r2.ok).toBe(true);
  });

  it('admin 이라도 allowAdmin 미지정이면 403, admin 이라도 행 없으면 404', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r1 = await assertBuildingOwner(client, BUILDING, ADMIN, { role: 'admin' });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.status).toBe(403);
    const r2 = await assertBuildingOwner(client, MISSING_BUILDING, ADMIN, { allowAdmin: true, role: 'admin' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.status).toBe(404);
  });

  it('allowAdmin 이어도 role 이 admin 이 아니면 우회 불가 (expert/public_user/broker)', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    for (const role of ['broker', 'expert', 'public_user', 'Admin', null]) {
      const r = await assertBuildingOwner(client, BUILDING, OTHER, { allowAdmin: true, role });
      expect(r.ok).toBe(false);
    }
  });

  it('조회 오류 → 500 (fail-closed)', async () => {
    const { client } = makeFakeDb(BASE_ROWS, { errorTables: ['building_ssot_lite'] });
    const r = await assertBuildingOwner(client, BUILDING, OWNER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it('빈 id / 빈 userId → 400', async () => {
    const { client } = makeFakeDb(BASE_ROWS);
    const r1 = await assertBuildingOwner(client, '', OWNER);
    const r2 = await assertBuildingOwner(client, BUILDING, '');
    expect(r1.ok || r2.ok).toBe(false);
    if (!r1.ok) expect(r1.status).toBe(400);
  });

  it('select 옵션에 owner_id 가 자동 포함된다', async () => {
    const { client, recorded } = makeFakeDb(BASE_ROWS);
    await assertBuildingOwner(client, BUILDING, OWNER, { select: 'id, area_signal' });
    const sel = recorded.find((r) => r.table === 'building_ssot_lite' && r.op === 'select');
    expect(String(sel?.args[0])).toMatch(/owner_id/);
  });
});

describe('assertDocOwner / assertDealOwner', () => {
  const rows: Rows = {
    ...BASE_ROWS,
    document_objects: {
      ...BASE_ROWS.document_objects,
      'd-owned': { id: 'd-owned', owner_id: OWNER, building_id: null },
    },
  };

  it('문서 owner_id 일치 → 허용, 불일치 → 403, 없음 → 404, owner null → 403', async () => {
    const { client } = makeFakeDb(rows);
    expect((await assertDocOwner(client, 'd-owned', OWNER)).ok).toBe(true);
    const other = await assertDocOwner(client, 'd-owned', OTHER);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.status).toBe(403);
    const missing = await assertDocOwner(client, 'd-missing', OWNER);
    if (!missing.ok) expect(missing.status).toBe(404);
    const nullOwner = await assertDocOwner(client, DOC, OWNER);
    expect(nullOwner.ok).toBe(false);
  });

  it('allowBuildingOwner: 문서 owner null 이어도 연결 매물 소유자면 허용, 타인은 403', async () => {
    const { client } = makeFakeDb(rows);
    expect((await assertDocOwner(client, DOC, OWNER, { allowBuildingOwner: true })).ok).toBe(true);
    expect((await assertDocOwner(client, DOC, OTHER, { allowBuildingOwner: true })).ok).toBe(false);
    expect((await assertDocOwner(client, ORPHAN_DOC, OWNER, { allowBuildingOwner: true })).ok).toBe(false);
  });

  it('assertDealOwner: 매물 id → 매물 판정, 문서 id → 문서/매물 판정, 둘 다 없으면 404', async () => {
    const { client } = makeFakeDb(rows);
    expect((await assertDealOwner(client, BUILDING, OWNER)).ok).toBe(true);
    const deniedBuilding = await assertDealOwner(client, BUILDING, OTHER);
    expect(deniedBuilding.ok).toBe(false);
    if (!deniedBuilding.ok) expect(deniedBuilding.status).toBe(403);
    expect((await assertDealOwner(client, DOC, OWNER)).ok).toBe(true);
    expect((await assertDealOwner(client, DOC, OTHER)).ok).toBe(false);
    const none = await assertDealOwner(client, 'nope', OWNER);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.status).toBe(404);
  });
});

// ─── 2. 라우트 연동 테스트 (실제 헬퍼 + 가짜 DB) ─────────────────────────
let fakeDb = makeFakeDb(BASE_ROWS);
const mockRequireBroker = vi.fn();
const mockHandler = vi.fn();
const mockAfter = vi.fn();
const mockReadWithMigration = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => fakeDb.client,
}));
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, after: (cb: () => unknown) => { mockAfter(cb); } };
});
vi.mock('@/app/api/broker/im-lite/generate/handler', () => ({
  generateMobileIMHandler: (...args: unknown[]) => mockHandler(...args),
}));
vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readWithMigration: (...args: unknown[]) => mockReadWithMigration(...args) };
});
vi.mock('@/lib/authz/assert-owner', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/lib/authz/assert-owner');
  return { ...actual, assertBuildingOwner: vi.fn(actual.assertBuildingOwner) };
});

function asBroker(userId: string, role = 'broker') {
  mockRequireBroker.mockResolvedValue({
    user: { id: userId, email: `${role}@credeal.kr` },
    role,
    profile: { role, display_name: null },
    error: null,
  });
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/broker/im-lite/generate-async — SEC-1 소유권', () => {
  beforeEach(() => {
    fakeDb = makeFakeDb(BASE_ROWS);
    mockHandler.mockResolvedValue({ ok: true, im_lite_id: 'doc-1', url: '/x' });
  });

  async function post(buildingId: string) {
    const { POST } = await import('@/app/api/broker/im-lite/generate-async/route');
    return POST(jsonReq('http://localhost/api/broker/im-lite/generate-async', 'POST', { building_id: buildingId }));
  }

  it('비소유 브로커 → 403, 작업 미삽입, 백그라운드 생성 미예약', async () => {
    asBroker(OTHER);
    const { assertBuildingOwner: spy } = await import('@/lib/authz/assert-owner');
    const res = await post(BUILDING);
    expect(res.status).toBe(403);
    expect(spy).toHaveBeenCalledWith(expect.anything(), BUILDING, OTHER, expect.objectContaining({ allowAdmin: true, role: 'broker' }));
    expect(fakeDb.recorded.some((r) => r.table === 'im_generation_jobs')).toBe(false);
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('존재하지 않는 매물 → 404, owner null 매물 → 403', async () => {
    asBroker(OWNER);
    expect((await post(MISSING_BUILDING)).status).toBe(404);
    expect((await post(NULL_OWNER_BUILDING)).status).toBe(403);
    expect(fakeDb.recorded.some((r) => r.table === 'im_generation_jobs')).toBe(false);
  });

  it('소유자 → 200 + 작업 삽입 + handler 에 actorRole 전달', async () => {
    asBroker(OWNER);
    const res = await post(BUILDING);
    expect(res.status).toBe(200);
    const upsert = fakeDb.recorded.find((r) => r.table === 'im_generation_jobs' && r.op === 'upsert');
    expect(upsert).toBeDefined();
    expect((upsert!.args[0] as any).user_id).toBe(OWNER);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await mockAfter.mock.calls[0][0]();
    expect(mockHandler).toHaveBeenCalledWith(expect.objectContaining({ buildingId: BUILDING, userId: OWNER, actorRole: 'broker' }));
  });

  it('admin → 타인 매물도 허용', async () => {
    asBroker(ADMIN, 'admin');
    const res = await post(BUILDING);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/broker/deal-card/[id] — SEC-2 fail-open 제거', () => {
  beforeEach(() => {
    fakeDb = makeFakeDb(BASE_ROWS);
    // 과거 fail-open 재현 조건: readWithMigration 이 owner_id 없는 assets 행을 돌려줌 → 이제 호출 자체가 없어야 한다
    mockReadWithMigration.mockResolvedValue({ source: 'assets', data: { id: BUILDING, attrs: {} }, migrated: false });
  });

  async function patch(id: string, body: unknown = { title: 'hacked', ssotUpdate: { price_band: '1억' } }) {
    const { PATCH } = await import('@/app/api/broker/deal-card/[id]/route');
    return PATCH(jsonReq(`http://localhost/api/broker/deal-card/${id}`, 'PATCH', body), {
      params: Promise.resolve({ id }),
    });
  }

  it('비소유 브로커 → 403, document_objects·building_ssot_lite·signal card 미변경', async () => {
    asBroker(OTHER);
    const { assertBuildingOwner: spy } = await import('@/lib/authz/assert-owner');
    const res = await patch(BUILDING);
    expect(res.status).toBe(403);
    expect(spy).toHaveBeenCalledWith(expect.anything(), BUILDING, OTHER, expect.objectContaining({ allowAdmin: true }));
    expect(fakeDb.recorded.filter((r) => ['update', 'insert', 'upsert'].includes(r.op))).toEqual([]);
    expect(mockReadWithMigration).not.toHaveBeenCalled();
  });

  it('owner_id null 매물 → 403, 없는 매물 → 404', async () => {
    asBroker(OWNER);
    expect((await patch(NULL_OWNER_BUILDING)).status).toBe(403);
    expect((await patch(MISSING_BUILDING)).status).toBe(404);
    expect(fakeDb.recorded.filter((r) => ['update', 'insert', 'upsert'].includes(r.op))).toEqual([]);
  });

  it('소유자 → 200, 티저 문서 생성 + SSoT 반영', async () => {
    asBroker(OWNER);
    const res = await patch(BUILDING);
    expect(res.status).toBe(200);
    expect(fakeDb.recorded.some((r) => r.table === 'document_objects' && r.op === 'insert')).toBe(true);
    expect(fakeDb.recorded.some((r) => r.table === 'building_ssot_lite' && r.op === 'update')).toBe(true);
    expect(mockReadWithMigration).not.toHaveBeenCalled();
  });
});

describe('작업 상태 조회 — 타인 작업 비노출', () => {
  const JOB_ROWS: Rows = {
    ...BASE_ROWS,
    im_generation_jobs: {
      'im_job_1': { id: 'im_job_1', user_id: OWNER, status: 'processing', result: null, created_at: new Date().toISOString(), completed_at: null },
    },
    ai_runs: {
      'run-1': { id: 'run-1', user_id: OWNER, status: 'completed', output_ref: { buildingId: BUILDING }, error: null },
    },
  };
  beforeEach(() => { fakeDb = makeFakeDb(JOB_ROWS); });

  it('im-lite job-status: 본인 200, 타인 404, admin 200', async () => {
    const { GET } = await import('@/app/api/broker/im-lite/job-status/route');
    const req = () => new NextRequest('http://localhost/api/broker/im-lite/job-status?jobId=im_job_1');
    asBroker(OWNER);
    expect((await GET(req())).status).toBe(200);
    asBroker(OTHER);
    expect((await GET(req())).status).toBe(404);
    asBroker(ADMIN, 'admin');
    expect((await GET(req())).status).toBe(200);
  });

  it('jobs/[id] (ai_runs): 본인 200 (user_id 비노출), 타인 404', async () => {
    const { GET } = await import('@/app/api/broker/jobs/[id]/route');
    const call = () => GET(new NextRequest('http://localhost/api/broker/jobs/run-1'), { params: Promise.resolve({ id: 'run-1' }) });
    asBroker(OWNER);
    const ok = await call();
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.job.user_id).toBeUndefined();
    expect(body.job.output_ref.buildingId).toBe(BUILDING);
    asBroker(OTHER);
    expect((await call()).status).toBe(404);
  });
});
