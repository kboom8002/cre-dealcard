/**
 * E-01 저장/초안/발행 라우트
 *  - PATCH: expected_updated_at 불일치 → 409 EDIT_CONFLICT, 발행본 content 저장 잠금
 *  - POST /editions/draft: 없으면 생성(초안, magazine_issues 미접촉), 있으면 재사용, 발행본 우선
 *  - POST /editions/[id]/publish: 발행(+공개 행 기록), 정정 발행, 중복 발행·타인·검증 실패·롤백
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall } from './authz-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: unknown[] },
  ctx: null as unknown,
  unauth: false,
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => {
      if (h.unauth) return { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) };
      return { ctx: h.ctx, error: null };
    },
  };
});
vi.mock('@/domain/magazine/weekly-generator', () => ({ generateWeeklyMagazine: async () => ({}) }));

import { PATCH } from '@/app/api/magazine/editions/route';
import { POST as DRAFT } from '@/app/api/magazine/editions/draft/route';
import { POST as PUBLISH } from '@/app/api/magazine/editions/[id]/publish/route';

const ctxA = { userId: UA, slug: 'broker-a', displayName: '김중개', brokerKeys: ['broker-a', UA] };

type Row = Record<string, unknown>;
let rows: Row[] = [];
let issueUpsertError: { message: string } | null = null;

function setupDb() {
  h.db = createFakeDb((call: FakeCall) => {
    if (call.table === 'broker_profiles') {
      const slug = call.filters.find((f) => f[0] === 'eq' && f[1] === 'slug')?.[2];
      if (slug === 'broker-a') {
        return { data: { user_id: UA, slug: 'broker-a', bio: null, specialty_regions: ['성수'], specialty_assets: ['꼬마빌딩'], is_public: true } };
      }
      return { data: null };
    }
    if (call.table === 'profiles') {
      return { data: { id: UA, display_name: '김중개', photo_url: null, company: '성수공인', tagline: '성수 전문', phone: '010-1234-5678' } };
    }
    if (call.table === 'magazine_subscribers') return { data: null, count: 7 };
    if (call.table === 'magazine_issues') return { error: call.op === 'upsert' ? issueUpsertError : null };
    if (call.table === 'magazine_editions') {
      if (call.op === 'insert') {
        const row = { id: `new-${rows.length + 1}`, created_at: '2026-10-05T00:00:00.000Z', updated_at: null, ...(call.payload as Row) };
        rows.push(row);
        return { data: row };
      }
      if (call.op === 'delete') {
        const id = call.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
        rows = rows.filter((r) => r.id !== id);
        return { data: null };
      }
      if (call.op === 'update') {
        const row = rowVisibleTo(rows, call);
        if (!row) return { data: null };
        // 낙관적 동시성: eq('updated_at', X) 필터 평가
        const exp = call.filters.find((f) => f[0] === 'eq' && f[1] === 'updated_at');
        if (exp && row.updated_at !== exp[2]) return { data: null };
        const merged = { ...row, ...(call.payload as Row) };
        Object.assign(row, merged);
        return { data: merged };
      }
      if (call.op === 'select' && call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) {
        const found = rowVisibleTo(rows, call);
        return { data: found ? { ...found } : null };
      }
      return { data: filterRows(rows, call) };
    }
    return { data: null };
  }) as never;
}

const req = (url: string, body?: unknown, method = 'POST') =>
  new NextRequest(`https://credeal.net${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const callsOf = (table: string, op?: string) =>
  (h.db.calls as FakeCall[]).filter((c) => c.table === table && (!op || c.op === op));

const draftContent = {
  schemaVersion: 1,
  kind: 'weekly',
  headline: '이번 주 성수',
  briefing: '거래가 늘었습니다.',
  poll: { question: 'q', choices: ['a', 'b'], options: [{ label: 'a' }, { label: 'b', intent: 'seller' }] },
};

beforeEach(() => {
  h.unauth = false;
  h.ctx = ctxA;
  issueUpsertError = null;
  rows = [
    { id: 'ed-draft', broker_id: 'broker-a', status: 'draft', edition_type: 'weekly', edition_label: 'W40-2026', updated_at: '2026-10-05T01:00:00.000Z', theme_color: '#6366f1', published_at: null, content: draftContent },
    { id: 'ed-pub', broker_id: 'broker-a', status: 'published', edition_type: 'weekly', edition_label: 'W39-2026', updated_at: '2026-09-28T01:00:00.000Z', published_at: '2026-09-28T01:00:00.000Z', theme_color: '#6366f1', content: { ...draftContent, headline: '지난 호' } },
    { id: 'ed-b', broker_id: 'broker-b', status: 'draft', edition_type: 'weekly', edition_label: 'W40-2026', updated_at: null, content: {} },
  ];
  setupDb();
});

describe('PATCH /api/magazine/editions — 낙관적 동시성·잠금', () => {
  it('expected_updated_at 이 일치하면 저장되고 updated_at 이 갱신된다', async () => {
    const res = await PATCH(req('/api/magazine/editions', { id: 'ed-draft', title: '새 제목', expected_updated_at: '2026-10-05T01:00:00.000Z' }, 'PATCH'));
    expect(res.status).toBe(200);
    const upd = callsOf('magazine_editions', 'update')[0];
    expect(upd.payload).toMatchObject({ title: '새 제목' });
    expect(typeof (upd.payload as Row).updated_at).toBe('string');
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'updated_at', '2026-10-05T01:00:00.000Z']]));
    expect((await res.json()).edition.updated_at).toBe((upd.payload as Row).updated_at);
  });

  it('expected_updated_at 이 오래되면 409 EDIT_CONFLICT + currentUpdatedAt', async () => {
    const res = await PATCH(req('/api/magazine/editions', { id: 'ed-draft', title: '덮어쓰기 시도', expected_updated_at: '2026-10-05T00:00:00.000Z' }, 'PATCH'));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('EDIT_CONFLICT');
    expect(json.currentUpdatedAt).toBe('2026-10-05T01:00:00.000Z');
    expect(rows.find((r) => r.id === 'ed-draft')?.title).toBeUndefined();
  });

  it('expected_updated_at 를 생략(덮어쓰기)하면 검사 없이 저장된다', async () => {
    const res = await PATCH(req('/api/magazine/editions', { id: 'ed-draft', title: '강제 저장' }, 'PATCH'));
    expect(res.status).toBe(200);
    expect(callsOf('magazine_editions', 'update')[0].filters.some((f) => f[1] === 'updated_at')).toBe(false);
  });

  it('임시저장(PATCH)은 magazine_issues 를 절대 건드리지 않는다', async () => {
    await PATCH(req('/api/magazine/editions', { id: 'ed-draft', title: 't', content: draftContent }, 'PATCH'));
    expect(callsOf('magazine_issues')).toHaveLength(0);
  });

  it('발행본의 content 저장은 409 PUBLISHED_LOCKED (정정 발행만 허용)', async () => {
    const res = await PATCH(req('/api/magazine/editions', { id: 'ed-pub', content: { headline: '몰래 수정' } }, 'PATCH'));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PUBLISHED_LOCKED');
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
  });

  it('잘못된 content 는 400 INVALID_CONTENT', async () => {
    const res = await PATCH(req('/api/magazine/editions', { id: 'ed-draft', content: { target_segment: 'everyone' } }, 'PATCH'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_CONTENT');
  });

  it('field_note 객체를 받아들인다 (에디터가 보내는 형태)', async () => {
    const res = await PATCH(
      req('/api/magazine/editions', { id: 'ed-draft', field_note: { question: 'q', buyerReaction: '', sellerReaction: '', marketJudgment: '', comment: '' } }, 'PATCH'),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/magazine/editions/draft', () => {
  it('비로그인 → 401', async () => {
    h.unauth = true;
    const res = await DRAFT(req('/api/magazine/editions/draft', {}));
    expect(res.status).toBe(401);
    expect(h.db.calls).toHaveLength(0);
  });

  it('이번 호가 없으면 빈 초안을 만든다 (draft, 내 slug, magazine_issues 미접촉) + 발송 meta', async () => {
    rows = rows.filter((r) => r.broker_id !== 'broker-a');
    const res = await DRAFT(req('/api/magazine/editions/draft', { edition_type: 'weekly', edition_label: 'W41-2026' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.created).toBe(true);
    expect(json.edition).toMatchObject({ broker_id: 'broker-a', status: 'draft', edition_label: 'W41-2026', edition_type: 'weekly' });
    expect(json.edition.content).toMatchObject({ schemaVersion: 1, kind: 'weekly', weekLabel: 'W41-2026' });
    expect(json.meta).toMatchObject({ sendEnabled: false, subscriberCount: 7 });
    expect(callsOf('magazine_issues')).toHaveLength(0);
    expect(callsOf('magazine_editions', 'insert')).toHaveLength(1);
  });

  it('이미 있는 초안은 새로 만들지 않고 그대로 돌려준다', async () => {
    const res = await DRAFT(req('/api/magazine/editions/draft', { edition_type: 'weekly', edition_label: 'W40-2026' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(false);
    expect(json.edition.id).toBe('ed-draft');
    expect(callsOf('magazine_editions', 'insert')).toHaveLength(0);
  });

  it('발행본이 있으면 발행본을 돌려준다 (다시 초안 만들지 않음)', async () => {
    const res = await DRAFT(req('/api/magazine/editions/draft', { edition_type: 'weekly', edition_label: 'W39-2026' }));
    const json = await res.json();
    expect(json.edition.id).toBe('ed-pub');
    expect(json.edition.status).toBe('published');
    expect(callsOf('magazine_editions', 'insert')).toHaveLength(0);
  });

  it('body.broker_id 는 무시한다 (타 브로커 행을 만들거나 읽지 않는다)', async () => {
    rows = rows.filter((r) => r.broker_id !== 'broker-a');
    const res = await DRAFT(req('/api/magazine/editions/draft', { edition_type: 'weekly', edition_label: 'W41-2026', broker_id: 'broker-b' }));
    expect((await res.json()).edition.broker_id).toBe('broker-a');
  });
});

describe('POST /api/magazine/editions/[id]/publish', () => {
  const call = (id: string, body: unknown = {}) =>
    PUBLISH(req(`/api/magazine/editions/${id}/publish`, body), { params: Promise.resolve({ id }) });

  it('비로그인 401 / 타 브로커·없는 id 404 (update 미실행)', async () => {
    h.unauth = true;
    expect((await call('ed-draft')).status).toBe(401);
    h.unauth = false;
    expect((await call('ed-b')).status).toBe(404);
    expect((await call('nope')).status).toBe(404);
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
    expect(callsOf('magazine_issues')).toHaveLength(0);
  });

  it('발행: 상태 published + published_at + 공개 행(magazine_issues) 기록 + broker 는 서버 프로필', async () => {
    const res = await call('ed-draft');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.edition.status).toBe('published');
    expect(typeof json.edition.published_at).toBe('string');

    const upd = callsOf('magazine_editions', 'update')[0];
    expect(upd.payload).toMatchObject({ status: 'published' });
    expect((upd.payload as Row).content).toMatchObject({ headline: '이번 주 성수', id: 'ed-draft' });

    const up = callsOf('magazine_issues', 'upsert')[0];
    expect(up.payload).toMatchObject({ broker_id: 'broker-a', issue_date: json.issueDate });
    const issueContent = (up.payload as { content: { broker: { slug: string; phone: string; name: string } } }).content;
    expect(issueContent.broker).toMatchObject({ slug: 'broker-a', phone: '010-1234-5678', name: '김중개' });
  });

  it('payload 를 함께 보내면 그 값으로 저장+발행한다 (컬럼도 반영)', async () => {
    const res = await call('ed-draft', {
      payload: { title: '폼 제목', theme_color: '#10b981', content: { ...draftContent, headline: '폼 헤드라인' } },
    });
    expect(res.status).toBe(200);
    const upd = callsOf('magazine_editions', 'update')[0];
    expect(upd.payload).toMatchObject({ title: '폼 제목', theme_color: '#10b981', status: 'published' });
    expect((upd.payload as { content: { headline: string } }).content.headline).toBe('폼 헤드라인');
  });

  it('이미 발행된 호수를 다시 발행하면 409 ALREADY_PUBLISHED, correction 이면 published_at 유지하고 공개 행 갱신', async () => {
    const dup = await call('ed-pub');
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('ALREADY_PUBLISHED');
    expect(callsOf('magazine_issues')).toHaveLength(0);

    const fix = await call('ed-pub', { correction: true, payload: { content: { ...draftContent, headline: '정정된 제목' } } });
    expect(fix.status).toBe(200);
    const upd = callsOf('magazine_editions', 'update')[0];
    expect(upd.payload).not.toHaveProperty('published_at');
    const up = callsOf('magazine_issues', 'upsert')[0];
    expect(up.payload).toMatchObject({ issue_date: '2026-09-28' });
    expect((up.payload as { content: { headline: string } }).content.headline).toBe('정정된 제목');
  });

  it('발행 전 호수에 correction 은 400', async () => {
    expect((await call('ed-draft', { correction: true })).status).toBe(400);
  });

  it('헤드라인이 없으면 422 EMPTY_HEADLINE 이고 아무것도 기록하지 않는다', async () => {
    const res = await call('ed-draft', { payload: { content: { briefing: '본문만' } } });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('EMPTY_HEADLINE');
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
    expect(callsOf('magazine_issues')).toHaveLength(0);
  });

  it('품질 게이트 불합격은 확인 없이는 409, acknowledgeQualityGate 면 발행', async () => {
    const failing = { ...draftContent, generation: { model: null, isMock: false, totalTokens: 0, llmCalls: 0, generatedAt: '2026-10-05T00:00:00.000Z', qualityGate: { passed: false, status: 'needs_review', score: 40, totalClaims: 5, matchedClaims: 2, failureReasons: ['근거 부족'], issues: [] }, sources: {}, sourceErrors: [] } };
    const blocked = await call('ed-draft', { payload: { content: failing } });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe('QUALITY_GATE_REVIEW');
    expect(callsOf('magazine_editions', 'update')).toHaveLength(0);
    const ok = await call('ed-draft', { acknowledgeQualityGate: true, payload: { content: failing } });
    expect(ok.status).toBe(200);
  });

  it('공개 행 기록이 실패하면 에디션 변경을 되돌리고 500 PUBLISH_FAILED', async () => {
    issueUpsertError = { message: 'db down' };
    const res = await call('ed-draft');
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('PUBLISH_FAILED');
    const updates = callsOf('magazine_editions', 'update');
    expect(updates).toHaveLength(2); // 발행 → 되돌리기
    expect(updates[1].payload).toMatchObject({ status: 'draft', published_at: null });
    expect(rows.find((r) => r.id === 'ed-draft')?.status).toBe('draft');
  });
});
