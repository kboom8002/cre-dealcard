import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

/**
 * [P0-03 / T3-TEST-1] 교차 인가 매트릭스 (broker A 자원 × broker B / 비로그인)
 *
 * - 계정 A = 기본 storageState(e2e/.auth/user.json) — `request` 픽스처
 * - 계정 B = env E2E_BROKER_B_STORAGE 가 가리키는 storageState (다른 중개사 계정)
 *   설정되지 않으면 조용히 skip 하지 않고 `test.fixme` 로 사유를 명시한다.
 * - 비로그인(401) 매트릭스는 B 계정 없이도 항상 실행된다.
 *
 * 기대값: 비로그인 401 / 타 중개사 404(존재 비노출) / 소유자 정상.
 */

const B_STORAGE = process.env.E2E_BROKER_B_STORAGE
  ? path.resolve(process.cwd(), process.env.E2E_BROKER_B_STORAGE)
  : '';
const B_READY = !!B_STORAGE && fs.existsSync(B_STORAGE);
const B_REASON = !B_STORAGE
  ? 'E2E_BROKER_B_STORAGE 환경변수 미설정 — 두 번째 중개사 계정 storageState 경로가 필요합니다 (A/B 교차 인가 검증 불가)'
  : `E2E_BROKER_B_STORAGE 경로에 파일이 없습니다: ${B_STORAGE}`;

const RUN_TAG = `E2E-AUTHZ-${Date.now().toString(36)}`;
const FAKE_UUID = '00000000-0000-4000-8000-000000000000';

function randomPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return `010${tail}`;
}

async function jsonOf(res: { json: () => Promise<unknown> }): Promise<Record<string, unknown>> {
  try {
    return ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

test.describe('Magazine authz matrix', () => {
  test.describe.configure({ mode: 'serial' });

  let baseURL = '';
  let anon: APIRequestContext;
  let brokerB: APIRequestContext | null = null;

  let aSlug = '';
  let aSubscriberId = '';
  let aEditionId = '';

  test.beforeAll(async ({ playwright }, testInfo) => {
    baseURL = String(testInfo.project.use.baseURL ?? '');
    anon = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    if (B_READY) {
      brokerB = await playwright.request.newContext({ baseURL, storageState: B_STORAGE });
    } else {
      console.warn(`[authz-matrix] B 계정 매트릭스 비활성: ${B_REASON}`);
    }
  });

  test.afterAll(async () => {
    await anon?.dispose();
    await brokerB?.dispose();
  });

  // ── 0. A 계정 시드 (A가 자기 자원을 만든다) ───────────────────────────
  test('seed: A 프로필/구독자/초안 호수 생성', async ({ request }) => {
    const profileRes = await request.get('/api/broker/profile');
    expect(profileRes.status(), 'A 프로필 조회').toBe(200);
    const pj = await jsonOf(profileRes);
    const data = (pj.data ?? pj) as Record<string, unknown>;
    const brokerPart = (data.broker ?? {}) as Record<string, unknown>;
    aSlug = String(brokerPart.slug ?? data.slug ?? '');
    expect(aSlug, 'A slug 존재').not.toBe('');

    const subRes = await request.post('/api/broker/magazine/subscribers', {
      data: { name: `${RUN_TAG}-sub`, phone: randomPhone(), channel: 'kakao', consentAttested: true },
    });
    expect([200, 201], `A 구독자 생성 status=${subRes.status()}`).toContain(subRes.status());
    const sj = await jsonOf(subRes);
    aSubscriberId = String((sj.subscriber as Record<string, unknown> | undefined)?.id ?? '');
    expect(aSubscriberId, 'A 구독자 id').not.toBe('');

    // POST /api/magazine/editions 는 생성기(LLM)를 호출하므로 시드에는 사용하지 않는다 — LLM 없는 draft 엔드포인트 사용
    const edRes = await request.post('/api/magazine/editions/draft', {
      data: { edition_type: 'weekly' },
    });
    expect([200, 201], `A 호수 생성 status=${edRes.status()}`).toContain(edRes.status());
    {
      const ej = await jsonOf(edRes);
      aEditionId = String((ej.edition as Record<string, unknown> | undefined)?.id ?? '');
    }
    expect(aEditionId, 'A 초안 호수 id').not.toBe('');
  });

  // ── 1. 비로그인 → 401 (B 계정 불필요) ────────────────────────────────
  test.describe('비로그인 401', () => {
    const cases: Array<[string, string, () => string, unknown?]> = [
      ['POST', '/api/magazine/editions', () => '/api/magazine/editions', { edition_label: 'x' }],
      ['PATCH', '/api/magazine/editions', () => '/api/magazine/editions', { id: 'x', title: 't' }],
      ['GET', 'analytics', () => '/api/broker/magazine/analytics'],
      ['GET', 'subscribers', () => '/api/broker/magazine/subscribers'],
      ['POST', 'subscribers', () => '/api/broker/magazine/subscribers', { name: 'a', phone: '01000000000' }],
      ['PATCH', 'subscribers/[id]', () => `/api/broker/magazine/subscribers/${FAKE_UUID}`, { status: 'active' }],
      ['DELETE', 'subscribers/[id]', () => `/api/broker/magazine/subscribers/${FAKE_UUID}`],
      ['POST', 'subscribers/[id]/intent', () => `/api/broker/magazine/subscribers/${FAKE_UUID}/intent`, {}],
      ['GET', 'profile', () => '/api/broker/profile'],
      ['PUT', 'profile', () => '/api/broker/profile', { slug: 'zzz-anon' }],
    ];
    for (const [method, name, url, body] of cases) {
      test(`${method} ${name} → 401`, async () => {
        const res = await anon.fetch(url(), { method, data: body });
        expect(res.status()).toBe(401);
      });
    }

    test('GET editions (draft 접근) → 비소유자는 draft 미노출', async () => {
      const res = await anon.get(`/api/magazine/editions?broker_id=${aSlug || 'unknown'}&status=draft`);
      expect([401, 404]).toContain(res.status());
      const list = ((await jsonOf(res)).editions ?? []) as unknown[];
      expect(list.length).toBe(0);
    });
  });

  // ── 2. B 계정 → A 자원 접근 = 404 ───────────────────────────────────
  test.describe('B → A 자원', () => {
    test.beforeEach(() => {
      test.fixme(!B_READY, B_REASON);
    });

    test('GET editions?status=draft — A 초안이 B에게 노출되지 않는다', async () => {
      const res = await brokerB!.get(`/api/magazine/editions?broker_id=${aSlug}&status=draft`);
      expect([200, 404]).toContain(res.status());
      const list = ((await jsonOf(res)).editions ?? []) as Array<{ id?: string }>;
      expect(list.some((e) => e.id === aEditionId)).toBe(false);
    });

    test('PATCH editions — B가 A 호수 수정 → 404', async () => {
      const res = await brokerB!.patch('/api/magazine/editions', {
        data: { id: aEditionId, title: 'hijack' },
      });
      expect(res.status()).toBe(404);
    });

    test('POST editions — body.broker_id 로 A를 지정해도 B 소유로만 생성/무시', async () => {
      const label = `${RUN_TAG}-b`;
      const res = await brokerB!.post('/api/magazine/editions', {
        data: { broker_id: aSlug, edition_type: 'weekly', edition_label: label },
      });
      // B가 slug 미설정이면 거부될 수 있음. 어느 쪽이든 A 소유로 생성되면 안 된다.
      expect([201, 400, 403, 409]).toContain(res.status());
      const aList = await anonLike(aSlug);
      expect(aList.some((e) => e.edition_label === label)).toBe(false);
    });

    test('PATCH subscribers/[id] — B가 A 구독자 수정 → 404', async () => {
      const res = await brokerB!.patch(`/api/broker/magazine/subscribers/${aSubscriberId}`, {
        data: { status: 'paused' },
      });
      expect(res.status()).toBe(404);
    });

    test('POST subscribers/[id]/intent — B → 404', async () => {
      const res = await brokerB!.post(`/api/broker/magazine/subscribers/${aSubscriberId}/intent`, { data: {} });
      expect(res.status()).toBe(404);
    });

    test('GET analytics?subscriberId= — B가 A 구독자 드릴다운 → 404', async () => {
      const res = await brokerB!.get(`/api/broker/magazine/analytics?subscriberId=${aSubscriberId}`);
      expect(res.status()).toBe(404);
    });

    test('GET subscribers — B 목록에 A 구독자가 없다', async () => {
      const res = await brokerB!.get('/api/broker/magazine/subscribers?limit=200');
      expect(res.status()).toBe(200);
      const body = await jsonOf(res);
      const rows = (body.subscribers ?? body.data ?? []) as Array<{ id?: string }>;
      expect(rows.some((r) => r.id === aSubscriberId)).toBe(false);
    });

    test('DELETE subscribers/[id] — B → 404 (A 구독자 보존)', async ({ request }) => {
      const res = await brokerB!.delete(`/api/broker/magazine/subscribers/${aSubscriberId}`);
      expect(res.status()).toBe(404);
      // A에게는 여전히 보인다
      const check = await request.patch(`/api/broker/magazine/subscribers/${aSubscriberId}`, {
        data: { status: 'active' },
      });
      expect(check.status(), 'A 구독자가 삭제되지 않았음').not.toBe(404);
    });
  });

  // ── 3. 해지 토큰 위조 (계정 불필요) ─────────────────────────────────
  test.describe('해지 토큰', () => {
    test('위조 토큰 POST → 400 (상태 변경 없음)', async () => {
      const res = await anon.post(`/api/public/magazine/unsubscribe?t=forged.token`, {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: 'List-Unsubscribe=One-Click',
      });
      expect(res.status()).toBe(400);
    });

    test('레거시 sub.broker.hexsig 토큰 → 400', async () => {
      const res = await anon.post(
        `/api/public/magazine/unsubscribe?t=${encodeURIComponent(`${FAKE_UUID}.${aSlug || 'x'}.deadbeef`)}`,
        { headers: { 'content-type': 'application/x-www-form-urlencoded' }, data: 'List-Unsubscribe=One-Click' },
      );
      expect(res.status()).toBe(400);
    });

    test('GET 해지 확인 페이지는 상태를 변경하지 않는다 (위조 토큰도 200/400 HTML)', async () => {
      const res = await anon.get(`/api/public/magazine/unsubscribe?t=forged.token`);
      expect([200, 400]).toContain(res.status());
      expect(res.headers()['content-type'] ?? '').toContain('text/html');
    });
  });

  // ── 4. 정리: A 구독자 삭제 ─────────────────────────────────────────
  test('cleanup: A 구독자 삭제', async ({ request }) => {
    if (!aSubscriberId) return;
    const res = await request.delete(`/api/broker/magazine/subscribers/${aSubscriberId}`);
    expect([200, 204]).toContain(res.status());
  });

  /** 비로그인 공개 API 로 A의 노출 호수 목록(published only) 조회 */
  async function anonLike(slug: string): Promise<Array<{ edition_label?: string }>> {
    const res = await anon.get(`/api/magazine/editions?broker_id=${slug}&limit=50`);
    if (res.status() !== 200) return [];
    return ((await jsonOf(res)).editions ?? []) as Array<{ edition_label?: string }>;
  }
});
