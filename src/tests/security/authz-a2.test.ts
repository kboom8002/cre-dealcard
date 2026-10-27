/**
 * P0-SEC A2 — 추가 인가 결함 회귀 테스트
 *  1) GET /api/broker/im-lite/[id] · /views : 인증 + 소유권 (매물 id / 문서 id)
 *  2) GET /api/public/im-lite/[buildingId]/pptx : 비소유자에게 비공개(draft 등) 문서 미제공, watermark=false 불신
 *  3) POST /api/broker/pptx-studio/projects/[id]/approve-file : 대상 문서 1건 확정 · 단일 행 업데이트 · 모호/부재 fail-closed
 *  4) /broker/leasing 목록 : 본인 공간(spaces.created_by)만, admin 전체
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── 범용 가짜 Supabase (필터를 실제로 적용) ─────────────────────────────
type Row = Record<string, any>;
type Filter = { op: 'eq' | 'neq' | 'in' | 'not_in'; col: string; val: any };
interface Recorded { table: string; op: string; filters: Filter[]; payload?: unknown; orUsed?: string }

function parseNotIn(v: string): string[] {
  return v.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim());
}

function makeDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(initial));
  const recorded: Recorded[] = [];

  const apply = (rows: Row[], filters: Filter[]) =>
    rows.filter((r) =>
      filters.every((f) => {
        if (f.op === 'eq') return r[f.col] === f.val;
        if (f.op === 'neq') return r[f.col] !== f.val;
        if (f.op === 'in') return (f.val as any[]).includes(r[f.col]);
        if (f.op === 'not_in') return r[f.col] != null && !(f.val as any[]).includes(r[f.col]);
        return true;
      }),
    );

  const from = (table: string) => {
    const filters: Filter[] = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let mode: 'select' | 'update' = 'select';
    let payload: Row | null = null;
    let orUsed: string | undefined;

    const run = () => {
      let rows = apply(tables[table] ?? [], filters);
      if (orderCol) {
        const c = orderCol;
        rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (orderAsc ? 1 : -1));
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    };

    const q: any = {
      select() { return q; },
      eq(col: string, val: any) { filters.push({ op: 'eq', col, val }); return q; },
      neq(col: string, val: any) { filters.push({ op: 'neq', col, val }); return q; },
      in(col: string, val: any[]) { filters.push({ op: 'in', col, val }); return q; },
      not(col: string, op: string, val: string) {
        if (op === 'in') filters.push({ op: 'not_in', col, val: parseNotIn(val) });
        return q;
      },
      or(expr: string) { orUsed = expr; return q; },
      order(col: string, opts?: { ascending?: boolean }) { orderCol = col; orderAsc = opts?.ascending !== false; return q; },
      limit(n: number) { limitN = n; return q; },
      update(p: Row) { mode = 'update'; payload = p; return q; },
      async maybeSingle() {
        const rows = run();
        if (rows.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        return { data: rows[0] ?? null, error: null };
      },
      async single() { return q.maybeSingle(); },
      then(resolve: (v: any) => void, reject?: (e: any) => void) {
        try {
          if (mode === 'update') {
            recorded.push({ table, op: 'update', filters: [...filters], payload, orUsed });
            if (orUsed) throw new Error('unexpected .or() in update');
            const targets = apply(tables[table] ?? [], filters);
            for (const t of targets) Object.assign(t, payload);
            resolve({ data: null, error: null, count: targets.length });
          } else {
            resolve({ data: run(), error: null });
          }
        } catch (e) {
          if (reject) reject(e); else throw e;
        }
      },
    };
    return q;
  };

  const storage = {
    from: () => ({
      upload: async () => ({ data: null, error: { message: 'storage disabled in test' } }),
      createSignedUrl: async () => ({ data: null }),
    }),
  };
  return { tables, recorded, client: { from: vi.fn(from), storage } };
}

// ─── 공용 목 ────────────────────────────────────────────────────────────
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const BUILDING = 'a0000000-0000-0000-0000-000000000001';

let db = makeDb({});
const mockRequireBroker = vi.fn();
const mockViewer = vi.fn();
const mockRender = vi.fn();
const mockRedirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
let studioProject: any = null;

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db.client }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));
vi.mock('@/lib/auth-guard', () => ({ requireBroker: (...a: unknown[]) => mockRequireBroker(...a) }));
vi.mock('@/lib/server-viewer', () => ({ getServerViewer: () => mockViewer() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: async () => true }));
vi.mock('next/navigation', async (orig) => ({ ...(await orig<any>()), redirect: (u: string) => mockRedirect(u) }));
vi.mock('@/domain/building/mobile-im/pptx/pptx-renderer', () => ({
  MobileImPptxRenderer: class {
    render(input: unknown) {
      mockRender(input);
      return Promise.resolve({
        buffer: Buffer.from('PK-fake-pptx'), slideCount: 1, fileSizeBytes: 12, warnings: [], auditReport: { totalViolations: 0 },
      });
    }
  },
}));
vi.mock('@/domain/broker/broker-contact', () => ({
  fetchBrokerContact: async () => null,
  toPptxBrokerInput: () => null,
}));
vi.mock('@/domain/building/mobile-im/pptx/brand-skin', () => ({ resolveBrandAccent: async () => null }));
vi.mock('@/domain/building/pptx-studio/studio-service', () => ({
  studioService: {
    getProject: async () => studioProject,
    findProjectByDealId: async () => studioProject,
    saveProject: async () => undefined,
  },
}));
vi.mock('@/lib/authz/studio-owner', () => ({ assertStudioDealOwner: async () => null }));
const mockApproveFile = vi.fn(async () => ({ fileApproval: { id: 'fa-1' }, release: { id: 'rel-1' } }));
vi.mock('@/domain/building/pptx-studio/approval/studio-approval-service', () => ({
  StudioApprovalService: class { approveFile = mockApproveFile; },
}));
vi.mock('@/platform/im-pipeline/supabase-approval-ledger', () => ({ createPersistentApprovalLedger: () => ({}) }));
vi.mock('@/platform/im-pipeline/realtime/dealcard-sync-channel', () => ({ broadcastApprovalEvent: async () => undefined }));

function asBroker(userId: string, role = 'broker') {
  mockRequireBroker.mockResolvedValue({ user: { id: userId }, role, profile: { role, display_name: null }, error: null });
}

const VALID_BODY = {
  sections: [{ section_type: 'property_overview', content: 'x' }],
  dataGrade: 'B',
  tier: 'basic',
  ssot_summary: { asking_price: 10_000_000_000, total_area: 1200, gross_yield: 4.5, investment_posture: 'income' },
};

// ─── 1. im-lite/[id] GET · views ────────────────────────────────────────
describe('GET /api/broker/im-lite/[id] — 인증 + 소유권', () => {
  beforeEach(() => {
    db = makeDb({
      building_ssot_lite: [{ id: BUILDING, owner_id: OWNER }],
      document_objects: [
        { id: 'd0000000-0000-0000-0000-000000000001', building_id: BUILDING, owner_id: OWNER, document_type: 'mobile_im', status: 'draft', body: { tier: 'basic' }, created_at: '2026-10-01' },
        { id: 'd0000000-0000-0000-0000-000000000002', building_id: BUILDING, owner_id: OWNER, document_type: 'mobile_im', status: 'published', body: { tier: 'basic' }, created_at: '2026-10-02' },
      ],
    });
  });

  async function get(id: string) {
    const { GET } = await import('@/app/api/broker/im-lite/[id]/route');
    return GET(new NextRequest(`http://localhost/api/broker/im-lite/${id}`), { params: Promise.resolve({ id }) });
  }

  it('미인증 → requireBroker 오류 그대로 반환 (401)', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireBroker.mockResolvedValue({ user: null, role: null, profile: null, error: NextResponse.json({}, { status: 401 }) });
    expect((await get(BUILDING)).status).toBe(401);
  });

  it('매물 소유자 → 200, 해당 매물의 IM 문서 전체 (최신순)', async () => {
    asBroker(OWNER);
    const res = await get(BUILDING);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents.map((d: any) => d.status)).toEqual(['published', 'draft']);
  });

  it('다른 브로커 → 403 (매물 id), 문서 id 로도 403', async () => {
    asBroker(OTHER);
    expect((await get(BUILDING)).status).toBe(403);
    expect((await get('d0000000-0000-0000-0000-000000000001')).status).toBe(403);
  });

  it('문서 id + 소유자 → 그 문서 1건, 없는 id → 404, admin → 200', async () => {
    asBroker(OWNER);
    const res = await get('d0000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(200);
    expect((await res.json()).documents).toHaveLength(1);
    expect((await get('d0000000-0000-0000-0000-00000000dead')).status).toBe(404);
    asBroker(ADMIN, 'admin');
    expect((await get(BUILDING)).status).toBe(200);
  });

  it('views: 소유자 200, 타인 403', async () => {
    db.tables.activity_events = [{ id: 'e1', building_id: BUILDING, event_type: 'im_lite_view', metadata: {}, created_at: '2026-10-03' }];
    const { GET } = await import('@/app/api/broker/im-lite/[id]/views/route');
    const call = () => GET(new NextRequest(`http://localhost/api/broker/im-lite/${BUILDING}/views`), { params: Promise.resolve({ id: BUILDING }) });
    asBroker(OWNER);
    const ok = await call();
    expect(ok.status).toBe(200);
    expect((await ok.json()).totalViews).toBe(1);
    asBroker(OTHER);
    expect((await call()).status).toBe(403);
  });
});

// ─── 2. 공개 PPTX ───────────────────────────────────────────────────────
describe('GET /api/public/im-lite/[buildingId]/pptx — 공개 상태·워터마크', () => {
  const DRAFT = 'd0000000-0000-0000-0000-0000000000aa';
  const PUB = 'd0000000-0000-0000-0000-0000000000bb';

  function seed(includePublished: boolean) {
    const docs: Row[] = [
      { id: DRAFT, building_id: BUILDING, owner_id: OWNER, document_type: 'mobile_im', status: 'draft', title: 'DRAFT', body: { ...VALID_BODY, marker: 'draft' }, created_at: '2026-10-05' },
    ];
    if (includePublished) {
      docs.push({ id: PUB, building_id: BUILDING, owner_id: OWNER, document_type: 'mobile_im', status: 'published', title: 'PUB', body: { ...VALID_BODY, marker: 'published' }, created_at: '2026-10-01' });
    }
    db = makeDb({ building_ssot_lite: [{ id: BUILDING, owner_id: OWNER, raw_address: '서울' }], document_objects: docs });
  }

  async function get(qs = '') {
    const { GET } = await import('@/app/api/public/im-lite/[buildingId]/pptx/route');
    return GET(new NextRequest(`http://localhost/api/public/im-lite/${BUILDING}/pptx?direct=1${qs}`), {
      params: Promise.resolve({ buildingId: BUILDING }),
    });
  }
  const renderedMarker = () => (mockRender.mock.calls.at(-1)?.[0] as any)?.doc?.body?.marker;
  const renderedWatermark = () => (mockRender.mock.calls.at(-1)?.[0] as any)?.watermark;

  beforeEach(() => { mockRender.mockClear(); });

  it('익명 + 초안만 존재 → 404 (렌더 안 함)', async () => {
    seed(false);
    mockViewer.mockResolvedValue({ userId: null, isAdmin: false });
    const res = await get();
    expect(res.status).toBe(404);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('익명 + doc_id=초안 → 무시하고 최신 공개본 제공', async () => {
    seed(true);
    mockViewer.mockResolvedValue({ userId: null, isAdmin: false });
    const res = await get(`&doc_id=${DRAFT}`);
    expect(res.status).toBe(200);
    expect(renderedMarker()).toBe('published');
  });

  it('익명 기본 요청 → 더 최신 초안이 있어도 공개본', async () => {
    seed(true);
    mockViewer.mockResolvedValue({ userId: null, isAdmin: false });
    expect((await get()).status).toBe(200);
    expect(renderedMarker()).toBe('published');
  });

  it('다른 로그인 사용자 + doc_id=초안 (공개본 없음) → 404', async () => {
    seed(false);
    mockViewer.mockResolvedValue({ userId: OTHER, isAdmin: false });
    expect((await get(`&doc_id=${DRAFT}`)).status).toBe(404);
  });

  it('소유자 → doc_id=초안 다운로드 가능, 기본 요청은 최신(초안), admin 도 가능', async () => {
    seed(true);
    mockViewer.mockResolvedValue({ userId: OWNER, isAdmin: false });
    expect((await get(`&doc_id=${DRAFT}`)).status).toBe(200);
    expect(renderedMarker()).toBe('draft');
    expect((await get()).status).toBe(200);
    expect(renderedMarker()).toBe('draft');
    mockViewer.mockResolvedValue({ userId: ADMIN, isAdmin: true });
    expect((await get(`&doc_id=${DRAFT}`)).status).toBe(200);
    expect(renderedMarker()).toBe('draft');
  });

  it('비소유자 watermark=false + requester → 워터마크 유지, 소유자는 해제 가능', async () => {
    seed(true);
    mockViewer.mockResolvedValue({ userId: null, isAdmin: false });
    await get('&watermark=false&requester=홍길동&phone4=1234');
    expect(renderedWatermark()).toMatchObject({ requesterName: '홍길동', phoneLast4: '1234' });
    mockViewer.mockResolvedValue({ userId: OWNER, isAdmin: false });
    await get('&watermark=false&requester=홍길동');
    expect(renderedWatermark()).toBeUndefined();
  });
});

// ─── 3. approve-file 대상 1건 확정 ──────────────────────────────────────
describe('resolveApprovalTargetDoc + POST approve-file', () => {
  const D1 = 'd0000000-0000-0000-0000-000000000011';
  const D2 = 'd0000000-0000-0000-0000-000000000012';
  const D_OTHER = 'd0000000-0000-0000-0000-000000000013';

  function seed(docs: Row[]) {
    db = makeDb({ building_ssot_lite: [{ id: BUILDING, owner_id: OWNER }], document_objects: docs });
  }
  const doc = (id: string, extra: Row = {}): Row => ({
    id, building_id: BUILDING, owner_id: OWNER, document_type: 'mobile_im', status: 'draft',
    body: VALID_BODY, content: {}, created_at: '2026-10-01T00:00:00Z', ...extra,
  });

  it('해석기: 최신 non-archived 소유자 mobile_im 1건 / 원본 문서 id / 없음 404 / 동률 409', async () => {
    const { resolveApprovalTargetDoc } = await import('@/domain/building/pptx-studio/approval/resolve-approval-target');
    seed([
      doc(D1, { created_at: '2026-10-01T00:00:00Z' }),
      doc(D2, { created_at: '2026-10-02T00:00:00Z' }),
      doc('d0000000-0000-0000-0000-0000000000ff', { status: 'archived', created_at: '2026-10-09T00:00:00Z' }),
      doc(D_OTHER, { owner_id: OTHER, created_at: '2026-10-08T00:00:00Z' }),
    ]);
    const latest = await resolveApprovalTargetDoc(db.client, BUILDING, OWNER);
    expect(latest.ok && latest.doc.id).toBe(D2);
    const source = await resolveApprovalTargetDoc(db.client, D1, OWNER);
    expect(source.ok && source.via).toBe('source_doc');

    seed([]);
    const none = await resolveApprovalTargetDoc(db.client, BUILDING, OWNER);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.status).toBe(404);

    seed([doc(D1), doc(D2)]); // 동일 created_at
    const tie = await resolveApprovalTargetDoc(db.client, BUILDING, OWNER);
    expect(tie.ok).toBe(false);
    if (!tie.ok) expect(tie.status).toBe(409);
  });

  async function approve() {
    const { POST } = await import('@/app/api/broker/pptx-studio/projects/[id]/approve-file/route');
    return POST(
      new NextRequest('http://localhost/api/broker/pptx-studio/projects/p1/approve-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileHash: 'sha256:abc' }),
      }),
      { params: Promise.resolve({ id: 'p1' }) },
    );
  }

  beforeEach(() => {
    mockApproveFile.mockClear();
    studioProject = { id: 'p1', dealId: BUILDING, stage: 'S60_EDITORIAL_APPROVAL', title: 'T', slides: [] };
    asBroker(OWNER);
  });

  it('매물에 IM 문서 여러 건 → 최신 1건만 published (eq id, .or 미사용), 다른 문서는 불변', async () => {
    seed([
      doc(D1, { created_at: '2026-10-01T00:00:00Z' }),
      doc(D2, { created_at: '2026-10-02T00:00:00Z' }),
      doc(D_OTHER, { owner_id: OTHER, created_at: '2026-10-03T00:00:00Z' }),
    ]);
    const res = await approve();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.publishedDocumentId).toBe(D2);
    const updates = db.recorded.filter((r) => r.table === 'document_objects' && r.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].orUsed).toBeUndefined();
    expect(updates[0].filters).toEqual([{ op: 'eq', col: 'id', val: D2 }]);
    const statuses = Object.fromEntries(db.tables.document_objects.map((d) => [d.id, d.status]));
    expect(statuses).toEqual({ [D1]: 'draft', [D2]: 'published', [D_OTHER]: 'draft' });
  });

  it('대상 모호(동률) → 409, 원장 승인·문서 업데이트 없음', async () => {
    seed([doc(D1), doc(D2)]);
    const res = await approve();
    expect(res.status).toBe(409);
    expect(mockApproveFile).not.toHaveBeenCalled();
    expect(db.recorded.filter((r) => r.op === 'update')).toEqual([]);
  });

  it('대상 문서 없음 → 404, 원장 승인 없음 (이전: 게이트 생략 후 승인)', async () => {
    seed([doc(D_OTHER, { owner_id: OTHER })]);
    const res = await approve();
    expect(res.status).toBe(404);
    expect(mockApproveFile).not.toHaveBeenCalled();
  });

  it('대상 문서가 게이트 미통과(빈 클레임) → 422, 업데이트 없음', async () => {
    seed([doc(D1, { body: { sections: [] } })]);
    const res = await approve();
    expect(res.status).toBe(422);
    expect(mockApproveFile).not.toHaveBeenCalled();
    expect(db.recorded.filter((r) => r.op === 'update')).toEqual([]);
  });
});

// ─── 4. 리싱 목록 범위 ──────────────────────────────────────────────────
describe('/broker/leasing 목록 — 본인 공간만', () => {
  beforeEach(() => {
    db = makeDb({
      spaces: [
        { id: 's-own', created_by: OWNER, display_name: 'MINE', created_at: '2026-10-02' },
        { id: 's-other', created_by: OTHER, display_name: 'THEIRS', created_at: '2026-10-03' },
      ],
      leasing_pages: [
        { space_id: 's-own', slug: 'mine', status: 'published' },
        { space_id: 's-other', slug: 'theirs', status: 'published' },
      ],
    });
  });

  async function render() {
    const mod = await import('@/app/(broker)/broker/leasing/page');
    const el: any = await mod.default();
    // React 요소 트리에서 문자열/props 값만 수집 (_owner 등 순환 참조 제외)
    const out: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (node: any) => {
      if (node == null || typeof node === 'boolean') return;
      if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
      if (typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const props = node.props ?? {};
      for (const [k, v] of Object.entries(props)) {
        if (k === 'children') walk(v);
        else if (typeof v === 'string') out.push(v);
      }
    };
    walk(el);
    return out.join('\n');
  }

  it('브로커: 본인 공간만 (spaces.created_by 필터 + leasing_pages 도 해당 공간만)', async () => {
    mockViewer.mockResolvedValue({ userId: OWNER, isAdmin: false });
    const html = await render();
    expect(html).toContain('MINE');
    expect(html).not.toContain('THEIRS');
    expect(html).not.toContain('/leasing/theirs');
  });

  it('admin: 전체', async () => {
    mockViewer.mockResolvedValue({ userId: ADMIN, isAdmin: true });
    const html = await render();
    expect(html).toContain('MINE');
    expect(html).toContain('THEIRS');
  });

  it('미로그인: /login 리다이렉트, 조회 없음', async () => {
    mockViewer.mockResolvedValue({ userId: null, isAdmin: false });
    await expect(render()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(db.client.from).not.toHaveBeenCalled();
  });
});
