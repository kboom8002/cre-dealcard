/**
 * /api/magazine/[brokerId] 라우트 테스트 (B3a, P0-06: M2-21 / S2-16 / T1-OBS-1, P0-03: T1-02)
 *  - GET: 읽기 전용. 미존재 slug/날짜·미래·미발행 → 404, insert/upsert/LLM 호출 0건
 *  - POST: 로그인 + 본인 slug 만. 타 브로커 404, 미래 날짜 거부, Mock/QG 불합격 생성은 저장 0건
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, eqValue, type FakeCall } from './authz-fake-db';
import { todayKst } from '@/lib/magazine/kst';

const UA = '11111111-1111-4111-8111-111111111111';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: FakeCall[] },
  unauth: false,
  llmCalls: 0,
  llm: null as null | (() => unknown),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => {
      if (h.unauth) return { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) };
      return { ctx: { userId: UA, slug: 'broker-a', displayName: 'A', brokerKeys: ['broker-a', UA] }, error: null };
    },
  };
});
vi.mock('@/lib/magazine/llm-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/llm-guard')>();
  return {
    ...actual,
    callMagazineJson: async () => {
      h.llmCalls += 1;
      if (!h.llm) throw new Error('llm not set');
      return h.llm();
    },
  };
});

import { GET, POST } from '@/app/api/magazine/[brokerId]/route';
import { MagazineLlmError } from '@/lib/magazine/llm-guard';

const PAST = '2026-01-15';
const ISSUE_CONTENT = {
  headline: '발행된 헤드라인',
  briefing: '발행된 브리핑',
  dealHighlights: [{ id: 'd1', address: '서울 성동구 성수동2가 1-23', price: '50억대' }],
  auctionPicks: [{ address: '서울 성동구 성수동 3-3 101호', status: '진행' }],
  recentTransactions: [{ address: '서울 성동구 성수동2가 9-9', transaction_price: 1_230_000_000 }],
};

interface Opts {
  issues?: Array<{ id: string; content: unknown; updated_at?: string }>;
  editions?: unknown[];
  dbError?: boolean;
  upsertError?: { code?: string; message: string } | null;
}

function setupDb(o: Opts = {}) {
  h.db = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'broker_profiles':
        return eqValue(call, 'slug') === 'broker-a'
          ? { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: ['성수동'], specialty_assets: ['꼬마빌딩'], is_public: true } }
          : { data: null };
      case 'profiles':
        return { data: { id: UA, display_name: '홍길동', photo_url: null, company: 'ABC', tagline: null } };
      case 'magazine_issues':
        if (call.op === 'upsert') return { data: null, error: o.upsertError ?? null };
        if (o.dbError) return { data: null, error: { code: 'XX000', message: 'boom' } };
        return { data: o.issues ?? [] };
      case 'magazine_editions':
        return { data: o.editions ?? [] };
      case 'building_ssot_lite':
        return { data: [], count: 1 };
      case 'cre_pulses':
        return { data: [{ pulse_score: 72, trend: 'up', summary_ko: '성수 시장이 개선되고 있습니다.', key_findings: [], signals: {} }] };
      case 'external_news':
        return { data: [{ id: 'n1', title: '성수동 오피스 수요 증가', summary: '임차 문의 증가', source: '한경', sentiment: null, importance_score: 5, topic: null, created_at: new Date().toISOString() }] };
      default:
        return { data: [] };
    }
  }) as unknown as typeof h.db;
}

const writes = () => h.db.calls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.op));

const getReq = (qs = '') => new NextRequest(`http://localhost/api/magazine/x${qs}`);
const ctx = (brokerId: string) => ({ params: Promise.resolve({ brokerId }) });
const postReq = (body: unknown) =>
  new NextRequest('http://localhost/api/magazine/broker-a', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  h.unauth = false;
  h.llmCalls = 0;
  h.llm = null;
  setupDb();
});

describe('GET — 읽기 전용 (M2-21 / S2-16)', () => {
  it('존재하지 않는 slug → 404, insert/upsert/LLM 0건', async () => {
    const res = await GET(getReq(), ctx('no-such-broker'));
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
    expect(h.llmCalls).toBe(0);
  });

  it('형식이 이상한 slug → DB 조회 없이 404', async () => {
    const res = await GET(getReq(), ctx('a,user_id.eq.x'));
    expect(res.status).toBe(404);
    expect(h.db.calls).toHaveLength(0);
  });

  it('존재하는 broker 라도 해당 날짜 발행본이 없으면 404, 생성/저장 없음', async () => {
    const res = await GET(getReq(`?date=${PAST}`), ctx('broker-a'));
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
    expect(h.llmCalls).toBe(0);
    // 날짜 없는 기본(오늘)도 동일
    const today = await GET(getReq(), ctx('broker-a'));
    expect(today.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('미래 날짜 → 404 (DB 조회 없음), 형식 오류 날짜 → 400', async () => {
    const res = await GET(getReq('?date=2999-01-01'), ctx('broker-a'));
    expect(res.status).toBe(404);
    expect(h.db.calls).toHaveLength(0);
    const bad = await GET(getReq('?date=2026-13-40'), ctx('broker-a'));
    expect(bad.status).toBe(400);
    const bad2 = await GET(getReq('?date=abc'), ctx('broker-a'));
    expect(bad2.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  it('발행본이 있으면 200 + 지번 마스킹(원본 DB 값은 변경 없음), 쓰기·LLM 0건', async () => {
    setupDb({ issues: [{ id: 'iss-1', content: ISSUE_CONTENT }] });
    const res = await GET(getReq(`?date=${PAST}`), ctx('broker-a'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.data.headline).toBe('발행된 헤드라인');
    const all = JSON.stringify(json.data);
    expect(all).not.toMatch(/1-23|3-3|9-9/); // 번지 비노출
    expect(json.data.dealHighlights[0].address).toContain('성수동');
    expect(ISSUE_CONTENT.dealHighlights[0].address).toContain('1-23'); // 입력 객체 불변
    expect(writes()).toHaveLength(0);
    expect(h.llmCalls).toBe(0);
  });

  it('초안/검수대기로 표시된 콘텐츠는 공개하지 않는다', async () => {
    setupDb({ issues: [{ id: 'iss-1', content: { ...ISSUE_CONTENT, status: 'needs_review' } }] });
    expect((await GET(getReq(`?date=${PAST}`), ctx('broker-a'))).status).toBe(404);
    setupDb({ issues: [{ id: 'iss-2', content: { ...ISSUE_CONTENT, generation: { qualityGate: { passed: false } } } }] });
    expect((await GET(getReq(`?date=${PAST}`), ctx('broker-a'))).status).toBe(404);
  });

  it('DB 오류는 "없음"으로 위장하지 않고 500', async () => {
    setupDb({ dbError: true });
    const res = await GET(getReq(`?date=${PAST}`), ctx('broker-a'));
    expect(res.status).toBe(500);
    expect(writes()).toHaveLength(0);
  });
});

describe('POST — 인증/소유 (T1-02)', () => {
  it('비로그인 → 401, 저장 없음', async () => {
    h.unauth = true;
    const res = await POST(postReq({ headline: 'x' }), ctx('broker-a'));
    expect(res.status).toBe(401);
    expect(writes()).toHaveLength(0);
  });

  it('URL 의 brokerId 가 내 slug 가 아니면 404, 저장 없음', async () => {
    const res = await POST(postReq({ headline: 'x' }), ctx('broker-b'));
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('미래 날짜 / 형식 오류 날짜는 400, 저장 없음', async () => {
    expect((await POST(postReq({ issueDate: '2999-01-01', headline: 'x' }), ctx('broker-a'))).status).toBe(400);
    expect((await POST(postReq({ issueDate: '2026-02-30', headline: 'x' }), ctx('broker-a'))).status).toBe(400);
    expect((await POST(postReq({ issueDate: 20260105 }), ctx('broker-a'))).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  it('JSON 이 아니거나 객체가 아니면 400', async () => {
    expect((await POST(postReq('not json'), ctx('broker-a'))).status).toBe(400);
    expect((await POST(postReq([1, 2]), ctx('broker-a'))).status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  it('본문 저장: 서버가 broker_id 를 결정(클라이언트 brokerId 무시), 1회 upsert', async () => {
    const res = await POST(postReq({ issueDate: PAST, brokerId: 'evil-broker', headline: '수정본' }), ctx('broker-a'));
    expect(res.status).toBe(200);
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0].table).toBe('magazine_issues');
    expect(w[0].op).toBe('upsert');
    const row = w[0].payload as { broker_id: string; issue_date: string; content: { brokerId: string; headline: string } };
    expect(row.broker_id).toBe('broker-a');
    expect(row.issue_date).toBe(PAST);
    expect(row.content.brokerId).toBe('broker-a');
    expect(row.content.headline).toBe('수정본');
    expect(h.llmCalls).toBe(0);
  });

  it('저장 오류는 성공으로 위장하지 않고 500', async () => {
    setupDb({ upsertError: { code: '42P01', message: 'relation does not exist' } });
    const res = await POST(postReq({ issueDate: PAST, headline: 'x' }), ctx('broker-a'));
    expect(res.status).toBe(500);
  });
});

describe('POST { generate: true } — Mock/QG 불합격은 저장 0건 (T1-OBS-1)', () => {
  const GOOD = () => ({
    data: {
      headline: '성수 시장 펄스 72점 기록',
      briefing: '성수 시장 펄스는 72점으로 개선되고 있습니다. 성수동 오피스 수요 증가 소식이 전해졌습니다.',
    },
    response: { content: '{}', tokens: 400, model: 'm', latencyMs: 1, isMock: false },
  });

  it('LLM Mock 차단/실패 → 502, upsert 0건', async () => {
    h.llm = async () => {
      throw new MagazineLlmError('MOCK_RESPONSE', 'AI 생성 실패: Mock 응답 차단');
    };
    const res = await POST(postReq({ generate: true, issueDate: PAST }), ctx('broker-a'));
    expect(res.status).toBe(502);
    expect(writes()).toHaveLength(0);
  });

  it('isMock 응답이 흘러오면 저장하지 않는다', async () => {
    h.llm = () => {
      const g = GOOD();
      g.response.isMock = true;
      return g;
    };
    const res = await POST(postReq({ generate: true, issueDate: PAST }), ctx('broker-a'));
    expect(res.status).toBe(502);
    expect(writes()).toHaveLength(0);
  });

  it('QG 불합격(근거 없는 수치) → 422, upsert 0건', async () => {
    h.llm = () => {
      const g = GOOD();
      g.data.briefing = '성수 시장 펄스는 99점이며 거래가는 777억입니다. 충분히 긴 문장으로 작성합니다.';
      return g;
    };
    const res = await POST(postReq({ generate: true, issueDate: PAST }), ctx('broker-a'));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('QUALITY_GATE_FAILED');
    expect(writes()).toHaveLength(0);
  });

  it('정상 생성은 QG 통과 후에만 1회 upsert, 62/100 같은 가짜 심리 기본값 없음', async () => {
    h.llm = GOOD;
    const res = await POST(postReq({ generate: true, issueDate: PAST }), ctx('broker-a'));
    expect(res.status).toBe(200);
    const w = writes();
    expect(w).toHaveLength(1);
    const content = (w[0].payload as { content: Record<string, unknown> }).content;
    expect(content.kind).toBe('daily');
    expect('sentiment' in content).toBe(false); // 소스 없음 → 섹션 생략
    expect(JSON.stringify(content.keyStats)).not.toContain('62/100');
    expect(h.llmCalls).toBe(1);
  });

  it('요청 본문 broker 식별자는 생성에도 쓰이지 않는다 (타 브로커 slug 404)', async () => {
    h.llm = GOOD;
    const res = await POST(postReq({ generate: true, brokerId: 'broker-b' }), ctx('broker-b'));
    expect(res.status).toBe(404);
    expect(h.llmCalls).toBe(0);
  });
});

describe('기본 날짜', () => {
  it('날짜 파라미터가 없으면 오늘(KST)을 조회한다', async () => {
    await GET(getReq(), ctx('broker-a'));
    const issueCall = h.db.calls.find((c) => c.table === 'magazine_issues');
    expect(issueCall?.filters).toContainEqual(['eq', 'issue_date', todayKst()]);
  });
});
