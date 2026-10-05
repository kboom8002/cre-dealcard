import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

interface DbError { code: string; message: string }
const state: {
  insertError: DbError | null;
  votes: { choice: number }[];
  selectError: DbError | null;
  lastInsert: Record<string, unknown> | null;
  poll: Record<string, unknown> | null;
  issueExists: boolean;
  brokerExists: boolean;
} = {
  insertError: null,
  votes: [],
  selectError: null,
  lastInsert: null,
  poll: { question: 'q', choices: ['a', 'b', 'c'] },
  issueExists: true,
  brokerExists: true,
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'magazine_poll_responses') throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: Record<string, unknown>) => {
          state.lastInsert = row;
          return { error: state.insertError };
        },
        select: () => ({
          in: () => ({
            eq: async () => ({
              data: state.selectError ? null : state.votes,
              error: state.selectError,
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));

vi.mock('@/lib/magazine/public-page-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/public-page-data')>();
  return {
    ...actual,
    resolvePublicBroker: async () => (state.brokerExists ? { user_id: 'u-1', slug: 'my-mag' } : null),
    findIssueForDate: async () =>
      state.issueExists ? { id: 'iss-1', ...(state.poll ? { poll: state.poll } : {}) } : null,
  };
});

import { POST, GET } from '@/app/api/public/magazine/poll/route';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/public/magazine/poll', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const base = { brokerId: 'my-mag', editionDate: '2026-01-05', visitorId: 'visitor-abcdef12' };

beforeEach(() => {
  state.insertError = null;
  state.votes = [];
  state.selectError = null;
  state.lastInsert = null;
  state.poll = { question: 'q', choices: ['a', 'b', 'c'] };
  state.issueExists = true;
  state.brokerExists = true;
});

describe('poll route — 입력 검증 (choice 0..5 정수)', () => {
  it.each([[1.5], ['1'], [-1], [6], [3], [null]])('choice=%s 는 400', async (choice) => {
    const res = await POST(post({ ...base, choice }));
    expect(res.status).toBe(400);
    expect(state.lastInsert).toBeNull();
  });

  it('유효한 choice 는 200 + ok:true', async () => {
    const res = await POST(post({ ...base, choice: 2 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('brokerId/날짜 형식 오류는 400', async () => {
    expect((await POST(post({ ...base, brokerId: '', choice: 0 }))).status).toBe(400);
    expect((await POST(post({ ...base, editionDate: '2026-13-40', choice: 0 }))).status).toBe(400);
  });
});

describe('poll route — 가짜 결과 금지', () => {
  it('표본 5건 미만이면 results 는 null (가짜 퍼센트 없음)', async () => {
    state.votes = [{ choice: 0 }, { choice: 1 }];
    const json = await (await POST(post({ ...base, choice: 0 }))).json();
    expect(json.results).toBeNull();
  });

  it('표본 5건 이상이면 실제 집계를 돌려준다', async () => {
    state.votes = [{ choice: 0 }, { choice: 0 }, { choice: 1 }, { choice: 2 }, { choice: 0 }];
    const json = await (await POST(post({ ...base, choice: 0 }))).json();
    expect(json.results).toEqual({ total: 5, counts: { 0: 3, 1: 1, 2: 1 } });
  });

  it.each([['42P01'], ['PGRST205']])('테이블 미적용(%s)이면 503 이고 results 가 없다', async (code) => {
    state.insertError = { code, message: 'relation does not exist' };
    const res = await POST(post({ ...base, choice: 1 }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('POLL_UNAVAILABLE');
    expect('results' in json).toBe(false);
  });

  it('GET 집계 실패는 503 (가짜 0건 반환 금지)', async () => {
    state.selectError = { code: '42P01', message: 'missing' };
    const res = await GET(
      new NextRequest('http://localhost/api/public/magazine/poll?brokerId=my-mag&editionDate=2026-01-05'),
    );
    expect(res.status).toBe(503);
  });
});

describe('poll route — 중복/신뢰 경계', () => {
  it('unique 위반(23505)은 alreadyVoted:true', async () => {
    state.insertError = { code: '23505', message: 'duplicate' };
    const json = await (await POST(post({ ...base, choice: 1 }))).json();
    expect(json.ok).toBe(true);
    expect(json.alreadyVoted).toBe(true);
  });

  it('클라이언트가 보낸 subscriberPhone 은 저장 행에 포함되지 않는다', async () => {
    await POST(post({ ...base, choice: 1, subscriberPhone: '01012345678', phone: '01099998888' }));
    expect(state.lastInsert).not.toBeNull();
    expect(JSON.stringify(state.lastInsert)).not.toMatch(/0101234|0109999/);
    expect(state.lastInsert).toMatchObject({ choice: 1, visitor_id: 'visitor-abcdef12', broker_user_id: 'u-1' });
  });

  it('존재하지 않는 중개사/설문 없는 발행본은 404', async () => {
    state.brokerExists = false;
    expect((await POST(post({ ...base, choice: 0 }))).status).toBe(404);
    state.brokerExists = true;
    state.poll = null;
    expect((await POST(post({ ...base, choice: 0 }))).status).toBe(404);
  });
});
