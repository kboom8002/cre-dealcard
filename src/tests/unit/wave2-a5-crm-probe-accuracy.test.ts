/**
 * Wave 2 Track B (Axis 5 P0) Verification Suite:
 * - A5-03: POST /api/public/gate/submit optional email/company/memo + gate_requests persistence & activity_events fallback
 * - A5-07: Idempotent broker_clients upsert (upsertBrokerClientFromInbound) & 5 entrypoint integrations
 * - A5-08: Contact-identity thread merging in Inbox (no duplicate custom_/sub_ rows, CRM enrichment, all-thread subscriber backfill, DOI pending badge)
 * - A5-09..A5-14 & A2-03: QA Workbench probe accuracy (compound contact, cross-resolved email, inboxCheck, broker_clients E.164/email, workspace_items IM/DealCard/Oracle, scoped revocations, ?t=slk.*)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const BROKER_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_BROKER_UUID = '11111111-1111-4111-8111-111111111999';
const BLD_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const BLD2_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const WS_DC_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const GATE_UUID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const INQ_UUID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const CRM_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const SUB_UUID = 'ffffffff-ffff-4fff-8fff-fffffffffff1';

type Row = Record<string, any>;

interface MockDbState {
  tables: Record<string, Row[]>;
  missingCols?: Record<string, Set<string>>;
  failFkTables?: Set<string>;
  seq: number;
}

function createMockDb(initial?: Partial<Record<string, Row[]>>): MockDbState {
  return {
    tables: {
      broker_profiles: [],
      building_ssot_lite: [],
      building_signal_cards: [],
      workspace_items: [],
      document_objects: [],
      deals: [],
      gate_requests: [],
      im_inquiry_requests: [],
      broker_clients: [],
      magazine_subscribers: [],
      magazine_editions: [],
      magazine_issues: [],
      activity_events: [],
      im_share_links: [],
      in_app_notifications: [],
      profiles: [],
      track_event: [],
      ...initial,
    },
    missingCols: {},
    failFkTables: new Set(),
    seq: 100,
  };
}

function makeSupabaseMock(db: MockDbState) {
  const applyOr = (row: Row, expr: string): boolean => {
    const parts = expr.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.some((part) => {
      const mEq = part.match(/^([a-zA-Z0-9_>-]+)\.eq\.(.+)$/);
      if (!mEq) return false;
      const [, col, val] = mEq;
      if (col.startsWith('metadata->>')) {
        const metaKey = col.slice('metadata->>'.length);
        return String(row?.metadata?.[metaKey] ?? '') === val;
      }
      return String(row?.[col] ?? '') === val;
    });
  };

  const makeQuery = (table: string) => {
    let op: 'select' | 'insert' | 'update' = 'select';
    let selectedCols = '*';
    let wantRows = false;
    let payload: any = null;
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitNum = Infinity;
    let rangeBounds: [number, number] | null = null;
    let isSingle = false;
    let isMaybeSingle = false;
    let countExact = false;

    const exec = async (): Promise<{ data: any; error: any; count?: number }> => {
      const rows = (db.tables[table] ??= []);
      const missing = db.missingCols?.[table];

      const checkCols = (colsStr: string) => {
        if (!missing || !colsStr || colsStr === '*') return null;
        for (const rawC of colsStr.split(',')) {
          const c = rawC.trim().split(/[\s:(]/)[0];
          if (c && missing.has(c)) {
            return { code: '42703', message: `column ${table}.${c} does not exist` };
          }
        }
        return null;
      };

      if (op === 'select') {
        const colErr = checkCols(selectedCols);
        if (colErr) return { data: null, error: colErr };
        let matched = rows.filter((r) => filters.every((fn) => fn(r))).map((r) => ({ ...r }));
        if (orderBy) {
          const { col, asc } = orderBy;
          matched.sort((a, b) => {
            const av = String(a?.[col] ?? '');
            const bv = String(b?.[col] ?? '');
            return asc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        const totalCount = matched.length;
        if (rangeBounds) {
          matched = matched.slice(rangeBounds[0], rangeBounds[1] + 1);
        } else if (Number.isFinite(limitNum)) {
          matched = matched.slice(0, limitNum);
        }
        if (isSingle || isMaybeSingle) {
          return {
            data: matched[0] ?? null,
            error: null,
            ...(countExact ? { count: totalCount } : {}),
          };
        }
        return {
          data: matched,
          error: null,
          ...(countExact ? { count: totalCount } : {}),
        };
      }

      if (op === 'insert') {
        if (db.failFkTables?.has(table)) {
          return {
            data: null,
            error: { code: '23503', message: `violates foreign key constraint on ${table}` },
          };
        }
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) {
          if (missing) {
            for (const k of Object.keys(item || {})) {
              if (missing.has(k)) {
                return {
                  data: null,
                  error: { code: 'PGRST204', message: `Could not find the '${k}' column` },
                };
              }
            }
          }
        }
        const inserted: Row[] = list.map((item) => {
          const seqHex = (++db.seq).toString(16).padStart(12, '0');
          const row = {
            id: item.id || `aaaa0000-0000-4000-8000-${seqHex}`,
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          };
          rows.push(row);
          return { ...row };
        });
        if (isSingle || isMaybeSingle) {
          return { data: inserted[0] ?? null, error: null };
        }
        return { data: wantRows ? inserted : inserted, error: null };
      }

      // update
      if (missing) {
        for (const k of Object.keys(payload || {})) {
          if (missing.has(k)) {
            return {
              data: null,
              error: { code: '42703', message: `column ${table}.${k} does not exist` },
            };
          }
        }
      }
      const updated: Row[] = [];
      for (const r of rows) {
        if (filters.every((fn) => fn(r))) {
          Object.assign(r, payload);
          updated.push({ ...r });
        }
      }
      if (isSingle || isMaybeSingle) {
        return { data: updated[0] ?? null, error: null };
      }
      return { data: wantRows ? updated : updated, error: null };
    };

    const q: any = {
      select(cols = '*', opts?: { count?: string; head?: boolean }) {
        if (op === 'select') selectedCols = cols;
        wantRows = true;
        if (opts?.count === 'exact') countExact = true;
        return q;
      },
      insert(rowOrRows: any) {
        op = 'insert';
        payload = rowOrRows;
        return q;
      },
      update(patch: any) {
        op = 'update';
        payload = patch;
        return q;
      },
      eq(col: string, val: unknown) {
        if (missingColsHas(db, table, col)) {
          filters.push(() => false);
        } else {
          filters.push((r) => r?.[col] === val);
        }
        return q;
      },
      neq(col: string, val: unknown) {
        filters.push((r) => r?.[col] !== val);
        return q;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r?.[col] ?? null) === val);
        return q;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r?.[col]));
        return q;
      },
      ilike(col: string, pattern: string) {
        const needle = pattern.replace(/%/g, '').toLowerCase();
        filters.push((r) => typeof r?.[col] === 'string' && r[col].toLowerCase() === needle);
        return q;
      },
      or(expr: string) {
        filters.push((r) => applyOr(r, expr));
        return q;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderBy = { col, asc: opts?.ascending !== false };
        return q;
      },
      limit(n: number) {
        limitNum = n;
        return q;
      },
      range(from: number, to: number) {
        rangeBounds = [from, to];
        return q;
      },
      single() {
        isSingle = true;
        return exec();
      },
      maybeSingle() {
        isMaybeSingle = true;
        return exec();
      },
      then(resolve: any, reject: any) {
        return exec().then(resolve, reject);
      },
    };
    return q;
  };

  return {
    from(table: string) {
      return makeQuery(table);
    },
  };
}

function missingColsHas(db: MockDbState, table: string, col: string) {
  return Boolean(db.missingCols?.[table]?.has(col));
}

let activeDb: MockDbState = createMockDb();
let activeAuthUser: { id: string; role: string; email?: string } | null = {
  id: BROKER_UUID,
  role: 'broker',
  email: 'broker@credeal.kr',
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => makeSupabaseMock(activeDb),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    activeAuthUser
      ? { user: activeAuthUser, error: null }
      : { user: null, error: new Response(JSON.stringify({ ok: false }), { status: 401 }) },
  resolveOptionalBrokerUser: async () => activeAuthUser,
}));

vi.mock('@/lib/security/qa-gate', () => ({
  getConfiguredQaSecrets: () => ({
    masterKey: 'test-qa-secret',
    portalPasscode: 'test-qa-secret',
    testerKey: 'test-tester-key',
    brokerKey: 'test-broker-key',
    anyConfigured: true,
  }),
  isPublicQaFlagEnabled: () => false,
  resolveQaKeyFromRequest: () => ({ role: 'master', allowed: true, queryKey: '' }),
}));

vi.mock('@/domain/identity/party-service', () => ({
  findOrCreateParty: async () => ({ id: '55555555-5555-4555-8555-555555555555' }),
  bindRecipientToParty: async () => {},
}));

vi.mock('@/domain/identity/condition-engine', () => ({
  insertCondition: async () => {},
}));

vi.mock('@/domain/identity/bind', () => ({
  bindViewerHistory: async () => {},
}));

vi.mock('@/lib/notifications/in-app', () => ({
  createNotification: async () => true,
}));

vi.mock('@/lib/legal/email-suppression', async (orig) => {
  const actual = await orig<typeof import('@/lib/legal/email-suppression')>();
  return {
    ...actual,
    clearBrokerUnsubscribeSuppression: async () => ({ cleared: 0 }),
  };
});

describe('Wave 2 Track B (Axis 5 P0): CRM Auto-Upsert, Thread Merge & QA Probe Accuracy', () => {
  beforeEach(() => {
    activeDb = createMockDb();
    activeAuthUser = { id: BROKER_UUID, role: 'broker', email: 'broker@credeal.kr' };
    vi.clearAllMocks();
  });

  // ── A5-03 ───────────────────────────────────────────────────────────────────
  describe('A5-03: /api/public/gate/submit dropped leads & optional fields', () => {
    it('validates optional email, company, and memo in G2 form schema', async () => {
      const { validateG2Form } = await import('@/domain/identity/gate-schema');

      expect(
        validateG2Form({
          budgetBand: '100~200억',
          purpose: '임대수익',
          financing: '대출 병행',
          entityType: '법인',
          name: '강민수',
          phone: '010-6193-4470',
          email: 'ms.kang@example.kr',
          company: '알파자산운용',
          memo: '렌트롤 및 공시지가 원본 확인 요청',
        }).valid
      ).toBe(true);

      const badEmail = validateG2Form({
        budgetBand: '100~200억',
        purpose: '임대수익',
        financing: '대출 병행',
        entityType: '법인',
        name: '강민수',
        phone: '010-6193-4470',
        email: 'not-an-email',
      });
      expect(badEmail.valid).toBe(false);
      expect(badEmail.errors.some((e) => e.includes('이메일'))).toBe(true);
    });

    it('persists gate_requests row, metadata fields, and broker_clients upsert for UUID buildings', async () => {
      activeDb.tables.building_ssot_lite.push({
        id: BLD_UUID,
        owner_id: BROKER_UUID,
        status: 'published',
        area_signal: '강남구 역삼동',
        asset_type: '꼬마빌딩',
      });

      const { POST } = await import('@/app/api/public/gate/submit/route');
      const res = await POST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            dealId: BLD_UUID,
            consent: true,
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '대출 병행',
              entityType: '법인',
              name: '강민수',
              phone: '010-6193-4470',
              email: 'MS.KANG@EXAMPLE.KR',
              company: '알파자산운용',
              memo: '임대차 현황 및 감정가 참고 요청',
              consent: true,
            },
          }),
        })
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.accessGranted).toBe(true);
      expect(json.gateRequestId).toBeTruthy();

      expect(activeDb.tables.gate_requests).toHaveLength(1);
      const gr = activeDb.tables.gate_requests[0];
      expect(gr.building_id).toBe(BLD_UUID);
      expect(gr.target_broker_id).toBe(BROKER_UUID);
      const parsedReason = JSON.parse(gr.reason);
      expect(parsedReason.email).toBe('ms.kang@example.kr');
      expect(parsedReason.company).toBe('알파자산운용');
      expect(parsedReason.memo).toBe('임대차 현황 및 감정가 참고 요청');

      const ev = activeDb.tables.activity_events.find(
        (e) => e.event_type === 'gate_request_created'
      );
      expect(ev?.metadata?.gate_request_id).toBe(gr.id);
      expect(ev?.metadata?.email).toBe('ms.kang@example.kr');
      expect(ev?.metadata?.company).toBe('알파자산운용');
      expect(ev?.metadata?.memo).toBe('임대차 현황 및 감정가 참고 요청');

      expect(activeDb.tables.broker_clients).toHaveLength(1);
      expect(activeDb.tables.broker_clients[0]).toMatchObject({
        broker_id: BROKER_UUID,
        display_name: '강민수',
        phone: '010-6193-4470',
        email: 'ms.kang@example.kr',
        company: '알파자산운용',
        consent_status: 'unconfirmed',
      });
    });

    it('uses non-UUID gate_request_id fallback when gate_requests FK fails on standalone workspace deal so Inbox never drops it', async () => {
      activeDb.failFkTables!.add('gate_requests');
      activeDb.tables.workspace_items.push({
        id: WS_DC_UUID,
        owner_id: BROKER_UUID,
        kind: 'dealcard',
        status: 'published',
        title: '역삼 단독 딜카드',
        published_snapshot: {
          title: '역삼 단독 딜카드',
          areaSignal: '강남구 역삼동',
          buildingId: null,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const { POST: gateSubmitPOST } = await import('@/app/api/public/gate/submit/route');
      const res = await gateSubmitPOST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            dealId: WS_DC_UUID,
            consent: true,
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '전액 자기자본',
              entityType: '법인',
              name: '박서연',
              phone: '010-7777-8888',
              email: 'seoyeon@partner.kr',
              company: '파트너스',
              memo: '현장 답사 문의',
              consent: true,
            },
          }),
        })
      );

      expect(res.status).toBe(201);
      const submitJson = await res.json();
      expect(String(submitJson.gateRequestId)).toMatch(/^gr-submit-/);
      expect(activeDb.tables.gate_requests).toHaveLength(0);

      const { GET: inboxGET } = await import('@/app/api/broker/inbox/route');
      const inboxRes = await inboxGET(
        new NextRequest('http://localhost/api/broker/inbox?workspace=1')
      );
      expect(inboxRes.status).toBe(200);
      const inboxJson = await inboxRes.json();
      const lead = inboxJson.threads.find(
        (t: any) => t.clientEmail === 'seoyeon@partner.kr'
      );
      expect(lead).toBeDefined();
      expect(lead.clientName).toBe('박서연');
      expect(lead.clientCompany).toBe('파트너스');
    });
  });

  // ── A5-07 ───────────────────────────────────────────────────────────────────
  describe('A5-07: upsertBrokerClientFromInbound & 5 entrypoint integrations', () => {
    it('resolves broker slug via broker_profiles, deduplicates +82/dashed phone & case-insensitive email, and preserves broker-curated notes/VIP/tier/consent', async () => {
      activeDb.tables.broker_profiles.push({
        user_id: BROKER_UUID,
        slug: 'gangnam-master',
      });
      activeDb.tables.broker_clients.push({
        id: CRM_UUID,
        broker_id: BROKER_UUID,
        display_name: '강민수',
        phone: '+82-10-6193-4470',
        email: null,
        company: null,
        tier: 'vip',
        is_vip: true,
        notes: '브로커 수기 VIP 핵심 메모',
        free_memo: '자유 메모 유지 필수',
        linked_building_ids: [BLD_UUID],
        preferred_regions: ['강남구'],
        consent_status: 'confirmed',
      });

      const { upsertBrokerClientFromInbound } = await import(
        '@/lib/inbox/upsert-broker-client'
      );
      const sb = makeSupabaseMock(activeDb);

      const res = await upsertBrokerClientFromInbound({
        supabase: sb,
        brokerUserId: 'gangnam-master',
        name: '강민수 다른이름',
        phone: '01061934470',
        email: 'MS.KANG@EXAMPLE.KR',
        company: '알파자산',
        buildingId: BLD2_UUID,
        buildingTitle: '서초 타워',
        source: 'gate_g2',
        preferredRegions: ['서초구'],
      });

      expect(res).toEqual({ id: CRM_UUID, created: false });
      expect(activeDb.tables.broker_clients).toHaveLength(1);
      const row = activeDb.tables.broker_clients[0];
      expect(row.display_name).toBe('강민수'); // existing non-placeholder kept
      expect(row.email).toBe('ms.kang@example.kr');
      expect(row.company).toBe('알파자산');
      expect(row.linked_building_ids).toEqual([BLD_UUID, BLD2_UUID]);
      expect(row.preferred_regions).toEqual(['강남구', '서초구']);
      expect(row.notes).toBe('브로커 수기 VIP 핵심 메모');
      expect(row.free_memo).toBe('자유 메모 유지 필수');
      expect(row.tier).toBe('vip');
      expect(row.is_vip).toBe(true);
      expect(row.consent_status).toBe('confirmed');

      // Unknown slug fails safely returning null without throwing
      const unknown = await upsertBrokerClientFromInbound({
        supabase: sb,
        brokerUserId: 'unknown-slug',
        name: '무명',
        phone: '010-1234-5678',
      });
      expect(unknown).toBeNull();
    });

    it('falls back cleanly when extended CRM columns are missing (42703/PGRST204)', async () => {
      activeDb.missingCols!['broker_clients'] = new Set([
        'email',
        'company',
        'is_vip',
        'client_role',
        'preferred_regions',
        'building_id',
        'building_title',
        'consent_status',
        'consent_source',
        'free_memo',
      ]);

      const { upsertBrokerClientFromInbound } = await import(
        '@/lib/inbox/upsert-broker-client'
      );
      const res = await upsertBrokerClientFromInbound({
        supabase: makeSupabaseMock(activeDb),
        brokerUserId: BROKER_UUID,
        name: '폴백고객',
        phone: '010-5555-6666',
        email: 'fallback@example.kr',
        buildingId: BLD_UUID,
        source: 'im_inquiry',
      });

      expect(res?.created).toBe(true);
      expect(activeDb.tables.broker_clients).toHaveLength(1);
      expect(activeDb.tables.broker_clients[0].phone).toBe('010-5555-6666');
    });

    it('is invoked across createGateRequest, im-inquiry, opt-in/confirmOptIn, and approve_gate', async () => {
      activeDb.tables.broker_profiles.push({
        user_id: BROKER_UUID,
        slug: 'gangnam-master',
      });
      activeDb.tables.building_ssot_lite.push({
        id: BLD_UUID,
        owner_id: BROKER_UUID,
        status: 'published',
        area_signal: '강남구 삼성동',
        asset_type: '오피스빌딩',
      });

      // 1) createGateRequest
      const { createGateRequest } = await import('@/domain/gate/gate-request');
      await createGateRequest(
        {
          buildingId: BLD_UUID,
          requestedLevel: 'G2',
          requestedFields: ['임대차 현황'],
          reason: JSON.stringify({
            name: '이매수',
            phone: '010-2222-3333',
            email: 'lee@buyer.kr',
            company: '베타인베스트',
          }),
        },
        null
      );
      expect(
        activeDb.tables.broker_clients.some(
          (c) => c.phone === '010-2222-3333' && c.email === 'lee@buyer.kr'
        )
      ).toBe(true);

      // 2) POST /api/public/im-inquiry
      const { POST: inquiryPOST } = await import('@/app/api/public/im-inquiry/route');
      const inqRes = await inquiryPOST(
        new NextRequest('http://localhost/api/public/im-inquiry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            building_id: BLD_UUID,
            requester_name: '이매수',
            requester_phone: '01022223333',
            requester_email: 'lee@buyer.kr',
            company: '베타인베스트',
            privacy_agreed: true,
          }),
        })
      );
      expect(inqRes.status).toBe(200);
      // Should still be 1 row for 이매수 (deduped!)
      expect(
        activeDb.tables.broker_clients.filter((c) => c.email === 'lee@buyer.kr')
      ).toHaveLength(1);

      // 3) recordOptIn + confirmOptIn (DOI sets confirmed only upon confirmation)
      const { validateSubscribeInput } = await import(
        '@/domain/magazine/subscriber-consent-types'
      );
      const { recordOptIn, confirmOptIn } = await import(
        '@/domain/magazine/consent-service'
      );
      const validated = validateSubscribeInput({
        brokerId: 'gangnam-master',
        name: '최구독',
        phone: '010-3333-4444',
        email: 'choi@sub.kr',
        channel: 'email',
        tags: ['성수·성동'],
        consent: { privacy: true, marketing: true, age14: true },
      });
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;
      const sb = makeSupabaseMock(activeDb);
      const optRes = await recordOptIn(sb as any, {
        brokerSlug: 'gangnam-master',
        brokerUserId: BROKER_UUID,
        ipHash: 'hash',
        input: validated.value,
      });
      expect(optRes.ok).toBe(true);
      if (!optRes.ok || !optRes.confirmToken) return;

      const beforeConfirm = activeDb.tables.broker_clients.find(
        (c) => c.email === 'choi@sub.kr'
      );
      expect(beforeConfirm?.consent_status).toBe('unconfirmed');

      const confRes = await confirmOptIn(sb as any, {
        token: optRes.confirmToken,
        brokerSlug: 'gangnam-master',
      });
      expect(confRes.ok).toBe(true);
      const afterConfirm = activeDb.tables.broker_clients.find(
        (c) => c.email === 'choi@sub.kr'
      );
      expect(afterConfirm?.consent_status).toBe('confirmed');

      // 4) approve_gate (with empty broker_profiles so statutory profile check passes in unit mock)
      activeDb.tables.broker_profiles = [];
      activeDb.tables.gate_requests.push({
        id: GATE_UUID,
        building_id: BLD_UUID,
        status: 'submitted',
        reason: JSON.stringify({
          name: '한승인',
          phone: '010-4444-5555',
          email: 'han@approve.kr',
        }),
      });
      const { handleGateDecisionAction } = await import(
        '@/lib/inbox/inbox-actions-leads'
      );
      const appRes = await handleGateDecisionAction({
        action: 'approve_gate',
        userId: BROKER_UUID,
        buildingId: BLD_UUID,
        threadId: GATE_UUID,
        shareToken: '',
        body: { action: 'approve_gate', buildingId: BLD_UUID, threadId: GATE_UUID },
      });
      expect(appRes.status).toBe(200);
      expect(
        activeDb.tables.broker_clients.some(
          (c) => c.phone === '010-4444-5555' && c.email === 'han@approve.kr'
        )
      ).toBe(true);
    });
  });

  // ── A5-08 ───────────────────────────────────────────────────────────────────
  describe('A5-08: Contact-identity thread merging & DOI pending badge', () => {
    it('merges same-buyer gate + inquiry + broker_clients + DOI-pending subscriber into 1 enriched thread without spawning duplicates', async () => {
      activeDb.tables.building_ssot_lite.push({
        id: BLD_UUID,
        owner_id: BROKER_UUID,
        status: 'published',
        area_signal: '강남구 역삼동',
        asset_type: '꼬마빌딩',
      });
      // Gate request has phone only
      activeDb.tables.gate_requests.push({
        id: GATE_UUID,
        building_id: BLD_UUID,
        target_broker_id: BROKER_UUID,
        status: 'submitted',
        reason: JSON.stringify({
          name: '강민수',
          phone: '+82-10-6193-4470',
          message: 'G2 열람 요청',
        }),
        created_at: '2026-11-23T08:00:00.000Z',
      });
      // Inquiry on same building has email only -> wait: if same phone, dedupes in lead-threads;
      // here test same phone on inquiry to exercise lead-level dedupe + subscriber cross-channel backfill
      activeDb.tables.im_inquiry_requests.push({
        id: INQ_UUID,
        building_id: BLD_UUID,
        broker_user_id: BROKER_UUID,
        status: 'pending',
        requester_name: '강민수',
        requester_phone: '010-6193-4470',
        requester_email: 'ms.kang@example.kr',
        message: '상세 임대차 문의',
        created_at: '2026-11-23T08:10:00.000Z',
      });
      // Synced broker_clients row with broker-curated VIP / role / budget / memo / company
      activeDb.tables.broker_clients.push({
        id: CRM_UUID,
        broker_id: BROKER_UUID,
        display_name: '강민수 대표',
        phone: '010-6193-4470',
        email: 'ms.kang@example.kr',
        company: '알파자산',
        tier: 'vip',
        is_vip: true,
        client_role: 'seller',
        preferred_regions: ['강남구'],
        budget_manwon: 500000,
        free_memo: '연락 우선 VIP',
        linked_building_ids: [BLD_UUID],
        consent_status: 'unconfirmed',
        created_at: '2026-11-23T08:15:00.000Z',
      });
      // DOI-pending subscriber matching same buyer + adding region 서초구
      activeDb.tables.magazine_subscribers.push({
        id: SUB_UUID,
        broker_id: BROKER_UUID,
        broker_user_id: BROKER_UUID,
        subscriber_name: '강민수',
        subscriber_phone: '01061934470',
        subscriber_email: 'ms.kang@example.kr',
        status: 'active',
        confirm_status: 'pending',
        interest_profile: { tags: { regions: ['서초구'], assetTypes: ['꼬마빌딩'] } },
        created_at: '2026-11-23T08:20:00.000Z',
      });

      const { GET: inboxGET } = await import('@/app/api/broker/inbox/route');
      const res = await inboxGET(
        new NextRequest('http://localhost/api/broker/inbox?workspace=1')
      );
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.threads).toHaveLength(1);
      const merged = json.threads[0];
      expect(merged.id).toBe(GATE_UUID);
      expect(merged.crmClientId).toBe(CRM_UUID);
      expect(merged.isVip).toBe(true);
      expect(merged.clientGrade).toBe('VIP');
      expect(merged.clientRole).toBe('seller');
      expect(merged.clientCompany).toBe('알파자산');
      expect(merged.clientEmail).toBe('ms.kang@example.kr');
      expect(merged.preferredRegions).toEqual(['강남구', '서초구']);
      expect(merged.budgetManwon).toBe(500000);
      expect(merged.freeMemo).toBe('연락 우선 VIP');
      expect(merged.newsletterSubscribed).toBe(false);
      expect(merged.newsletterStatus).toBe('pending');
      expect(merged.events.some((e: any) => e.id === `ev-sub-${SUB_UUID}`)).toBe(true);

      const { getInboxStatusBadge } = await import(
        '@/app/(broker)/broker/w/inbox/_components/inbox-types'
      );
      const badge = getInboxStatusBadge({
        ...merged,
        status: 'active', // simulate after gate approved while newsletter is DOI pending
        gateStatus: 'none',
        id: `sub_${SUB_UUID}`,
      });
      expect(badge.text).toBe('인증 대기');
    });

    it('updates ALL matching buyer threads on multi-building subscriber merge & supports email-only newsletter toggle', async () => {
      activeDb.tables.building_ssot_lite.push(
        { id: BLD_UUID, owner_id: BROKER_UUID, status: 'published', area_signal: '역삼', asset_type: '빌딩' },
        { id: BLD2_UUID, owner_id: BROKER_UUID, status: 'published', area_signal: '성수', asset_type: '빌딩' }
      );
      const g1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccca1';
      const g2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccca2';
      activeDb.tables.gate_requests.push(
        {
          id: g1,
          building_id: BLD_UUID,
          target_broker_id: BROKER_UUID,
          status: 'submitted',
          reason: JSON.stringify({ name: '강매수', phone: '010-1234-5678' }),
          created_at: '2026-11-23T08:00:00.000Z',
        },
        {
          id: g2,
          building_id: BLD2_UUID,
          target_broker_id: BROKER_UUID,
          status: 'submitted',
          reason: JSON.stringify({ name: '강매수', email: 'multi@buyer.kr' }),
          created_at: '2026-11-23T08:05:00.000Z',
        }
      );
      activeDb.tables.magazine_subscribers.push({
        id: SUB_UUID,
        broker_id: BROKER_UUID,
        broker_user_id: BROKER_UUID,
        subscriber_phone: '01012345678',
        subscriber_email: 'multi@buyer.kr',
        status: 'active',
        confirm_status: 'confirmed',
        interest_profile: { tags: { regions: ['성수동'] } },
        created_at: '2026-11-23T08:10:00.000Z',
      });
      // Email-only lead with activity toggle
      activeDb.tables.im_inquiry_requests.push({
        id: INQ_UUID,
        building_id: BLD_UUID,
        broker_user_id: BROKER_UUID,
        status: 'pending',
        requester_name: '이메일전용',
        requester_phone: '',
        requester_email: 'only@email.kr',
        created_at: '2026-11-23T07:00:00.000Z',
      });
      activeDb.tables.activity_events.push({
        id: 'ev-nl-toggle-email',
        actor_id: BROKER_UUID,
        event_type: 'newsletter_subscription_toggled',
        entity_type: 'broker_client',
        entity_id: INQ_UUID,
        metadata: {
          thread_id: INQ_UUID,
          client_email: 'only@email.kr',
          subscribed: true,
        },
        created_at: '2026-11-23T09:00:00.000Z',
      });

      const { GET: inboxGET } = await import('@/app/api/broker/inbox/route');
      const res = await inboxGET(
        new NextRequest('http://localhost/api/broker/inbox?workspace=1')
      );
      const json = await res.json();

      const t1 = json.threads.find((t: any) => t.id === g1);
      const t2 = json.threads.find((t: any) => t.id === g2);
      expect(t1?.newsletterSubscribed).toBe(true);
      expect(t1?.clientEmail).toBe('multi@buyer.kr');
      const { canonicalKrPhoneDigits } = await import('@/lib/inbox/upsert-broker-client');
      expect(t2?.newsletterSubscribed).toBe(true);
      expect(canonicalKrPhoneDigits(t2?.clientPhone)).toBe('01012345678');

      const tEmail = json.threads.find((t: any) => t.id === INQ_UUID);
      expect(tEmail?.newsletterSubscribed).toBe(true);
      expect(tEmail?.newsletterStatus).toBe('active');
    });
  });

  // ── A5-09..A5-14 & A2-03 ───────────────────────────────────────────────────
  describe('A5-09..A5-14 & A2-03: QA Workbench probe accuracy', () => {
    it('supports compound contact, cross-resolved email, inboxCheck, E.164 broker_clients, and missing-col fallback on magazine_subscribers', async () => {
      activeDb.tables.broker_profiles.push({
        user_id: BROKER_UUID,
        slug: 'gangnam-master',
      });
      activeDb.tables.building_ssot_lite.push({
        id: BLD_UUID,
        owner_id: BROKER_UUID,
        status: 'published',
      });
      activeDb.tables.im_inquiry_requests.push({
        id: INQ_UUID,
        building_id: BLD_UUID,
        broker_user_id: BROKER_UUID,
        status: 'approved',
        requester_phone: '010-6193-4470',
        requester_email: 'ms.kang@example.kr',
        created_at: '2026-11-23T08:00:00.000Z',
      });
      activeDb.tables.broker_clients.push({
        id: CRM_UUID,
        broker_id: BROKER_UUID,
        phone: '+821061934470',
        email: 'ms.kang@example.kr',
        notes: '메모',
        created_at: '2026-11-23T08:00:00.000Z',
      });
      // Email-only subscriber stored under broker_user_id with legacy schema missing confirm_status
      activeDb.missingCols!['magazine_subscribers'] = new Set(['confirm_status', 'phone_e164']);
      activeDb.tables.magazine_subscribers.push({
        id: SUB_UUID,
        broker_id: 'legacy-alt-slug',
        broker_user_id: BROKER_UUID,
        subscriber_email: 'ms.kang@example.kr',
        status: 'active',
      });

      const { POST: qaPOST } = await import('@/app/api/public/qa-workbench/route');

      // 1) Phone-only input cross-resolves email from im_inquiry_requests/broker_clients to find email-only subscriber!
      const resPhoneOnly = await qaPOST(
        new NextRequest('http://localhost/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'probe',
            testClientContact: '010-6193-4470',
          }),
        })
      );
      expect(resPhoneOnly.status).toBe(200);
      const jPhone = await resPhoneOnly.json();
      expect(jPhone.subscriberCheck?.foundInBrokerClients).toBe(true);
      expect(jPhone.subscriberCheck?.foundInMagazineSubscribers).toBe(true);
      expect(jPhone.inboxCheck).toMatchObject({
        checked: true,
        foundInInbox: true,
        gateStatus: 'approved',
        hasEmail: true,
      });

      // 2) Compound input parses BOTH phone & email independently
      const resCompound = await qaPOST(
        new NextRequest('http://localhost/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'probe',
            testClientContact: '010-6193-4470 / ms.kang@example.kr',
          }),
        })
      );
      const jComp = await resCompound.json();
      expect(jComp.subscriberCheck?.foundInMagazineSubscribers).toBe(true);
      expect(jComp.subscriberCheck?.foundInBrokerClients).toBe(true);

      // 3) Cross-broker isolation: another broker cannot see BROKER_UUID's leads or clients
      activeAuthUser = { id: OTHER_BROKER_UUID, role: 'broker', email: 'other@credeal.kr' };
      const resOther = await qaPOST(
        new NextRequest('http://localhost/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'probe',
            testClientContact: '010-6193-4470',
          }),
        })
      );
      const jOther = await resOther.json();
      expect(jOther.subscriberCheck?.foundInBrokerClients).toBe(false);
      expect(jOther.subscriberCheck?.foundInMagazineSubscribers).toBe(false);
      expect(jOther.inboxCheck?.foundInInbox).toBe(false);
    });

    it('accurately probes non-UUID workspace_items (IM/DealCard/Oracle), scoped revocations, dealcard_upserted events, and ?t=slk.* share tokens', async () => {
      const wsBldId = 'bld-ws-probe-01';
      activeDb.tables.workspace_items.push(
        {
          id: WS_DC_UUID,
          owner_id: BROKER_UUID,
          kind: 'dealcard',
          legacy_id: wsBldId,
          building_id: null,
          status: 'published',
          title: '강남 코너 수익빌딩',
          published_snapshot: {
            title: '강남 코너 수익빌딩',
            areaSignal: '강남구 역삼동',
            priceBand: '120억',
            points: ['역세권 코너', '우량 임차', '신축급 외관'],
          },
          created_at: '2026-11-23T08:00:00.000Z',
          updated_at: '2026-11-23T08:00:00.000Z',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
          owner_id: BROKER_UUID,
          kind: 'im',
          legacy_id: wsBldId,
          building_id: null,
          status: 'published',
          title: '강남 코너 수익빌딩 IM',
          published_snapshot: {
            officialLandPricePerSqm: 18500000,
            ssot_summary: { landAreaSqm: 382.5, totalGrossAreaSqm: 1210.4 },
            hiddenSections: ['tenant_rentroll'],
          },
          created_at: '2026-11-23T08:00:00.000Z',
          updated_at: '2026-11-23T08:00:00.000Z',
        }
      );

      // Thread-scoped / recipient_approval revocation MUST NOT lock building-wide shareLinkCheck
      activeDb.tables.activity_events.push({
        id: 'ev-thread-revoke',
        actor_id: BROKER_UUID,
        event_type: 'link_revoked',
        entity_id: null,
        metadata: {
          building_id: wsBldId,
          scope: 'recipient_approval',
          thread_id: GATE_UUID,
        },
        created_at: '2026-11-23T08:05:00.000Z',
      });

      const { issueShareLinkToken } = await import('@/lib/security/share-link-tokens');
      const issued = await issueShareLinkToken({
        buildingId: wsBldId,
        brokerId: BROKER_UUID,
        recipientId: 'buyer-1',
        channel: 'copy',
      });

      const { POST: qaPOST } = await import('@/app/api/public/qa-workbench/route');
      const res = await qaPOST(
        new NextRequest('http://localhost/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'probe',
            expectedLoopId: 'broker-byod',
            dealCardUrl: `http://localhost:3000/dc/${wsBldId}`,
            imShareUrl: `http://localhost:3000/im-lite/${wsBldId}?t=${encodeURIComponent(issued.token)}`,
            secondaryImShareUrl: `http://localhost:3000/im-lite/${wsBldId}?t=mock-2`,
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dealCardCheck).toMatchObject({
        validUrl: true,
        exists: true,
        addressBlindPass: true,
      });
      expect(json.shareLinkCheck).toMatchObject({
        validUrl: true,
        buildingId: wsBldId,
        hasToken: true,
        docExists: true,
        hasOfficialLandPrice: true,
        isLocked: false,
      });
      expect(json.secondaryShareLinkCheck).toMatchObject({
        validUrl: true,
        hasToken: false,
        isLocked: false,
      });
      expect(json.groundTruthOracleCheck).toMatchObject({
        actualLandAreaSqm: 382.5,
        actualGfaSqm: 1210.4,
        hiddenSectionCount: 1,
      });

      // Also verify dealcard_upserted event fallback when only activity_events exists
      const evDcId = 'dc-ev-only-01';
      activeDb.tables.activity_events.push({
        id: 'ev-dc-upserted',
        actor_id: BROKER_UUID,
        event_type: 'dealcard_upserted',
        entity_id: null,
        metadata: {
          buildingId: evDcId,
          title: '성수동 우량 꼬마빌딩',
          areaSignal: '성동구 성수동2가',
        },
        created_at: '2026-11-23T08:10:00.000Z',
      });
      const resEv = await qaPOST(
        new NextRequest('http://localhost/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'probe',
            dealCardUrl: `http://localhost:3000/dc/${evDcId}`,
          }),
        })
      );
      const jEv = await resEv.json();
      expect(jEv.dealCardCheck?.exists).toBe(true);
      expect(jEv.dealCardCheck?.addressBlindPass).toBe(true);
    });
  });
});
