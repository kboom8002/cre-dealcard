/**
 * H5 — 편집기 UI E2E: 중개인 사진 태깅(유형/캡션/대표/IM 제외) → 저장 → 새로고침 후 유지 → DB(photos, photos_v2) 동기화
 *
 * 대상 화면: /broker/im-approval/[id] (모바일 IM 편집 화면의 사진 그리드)
 * 선행 조건: E2E 계정이 소유한 IM 문서(골든 E2E 산출물) 1건 이상, 사진 3장 이상.
 *   - 없으면 skip (골든 E2E를 먼저 실행).
 * 안전: 테스트는 문서 status/body 를 임시로 변경하므로 afterAll 에서 원본 스냅샷으로 완전히 복원한다.
 *   (published 문서는 save-sections 가 400 으로 거부하므로 draft 로 임시 전환)
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

type Photo = { url: string; category?: string; caption?: string; role?: string; isHero?: boolean; excluded?: boolean };

let supabase: SupabaseClient;
let docId = '';
let snapshot: { status: string; body: Record<string, any> } | null = null;

async function findEditableDoc(): Promise<string | null> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !password || !anonKey) return null;
  // auth.admin.listUsers 는 일부 환경에서 실패하므로, E2E 계정으로 직접 로그인해 user id 를 얻는다.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey);
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password });
  const user = signIn?.user;
  if (!user) return null;
  const { data: docs } = await supabase
    .from('document_objects')
    .select('id, body, created_at')
    .or(`broker_id.eq.${user.id},owner_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(15);
  const hit = (docs ?? []).find((d: any) => {
    const b = d.body ?? {};
    return Array.isArray(b.photos) && b.photos.length >= 3 && Array.isArray(b.photos_v2) && b.photos_v2.length >= 3;
  });
  return hit?.id ?? null;
}

async function fetchBody(): Promise<Record<string, any>> {
  const { data } = await supabase.from('document_objects').select('body').eq('id', docId).single();
  return (data?.body ?? {}) as Record<string, any>;
}

/** 화면 로드 후 사진 그리드가 보일 때까지 대기 */
async function openEditor(page: Page) {
  await page.goto(`/broker/im-approval/${docId}`);
  await expect(page.getByLabel('사진 1 유형')).toBeVisible({ timeout: 60_000 });
}

/** save-sections PUT 응답(성공)을 기다리며 액션 수행 */
async function withSave(page: Page, action: () => Promise<void>) {
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/api/broker/im-lite/${docId}/save-sections`) && r.request().method() === 'PUT',
    { timeout: 30_000 },
  );
  await action();
  const res = await saved;
  expect(res.ok(), `save-sections status=${res.status()} body=${(await res.text()).slice(0, 300)}`).toBeTruthy();
}

function card(page: Page, n: number) {
  // 사진 n 유형 select 를 포함하는 카드 컨테이너
  return page.locator('div.space-y-1').filter({ has: page.getByLabel(`사진 ${n} 유형`) });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  supabase = createClient(url, key);
  const id = await findEditableDoc();
  if (!id) return;
  docId = id;
  const { data } = await supabase.from('document_objects').select('status, body').eq('id', id).single();
  snapshot = { status: data!.status, body: data!.body };
  await supabase.from('document_objects').update({ status: 'draft' }).eq('id', id);
});

test.afterAll(async () => {
  if (!snapshot || !docId) return;
  await supabase.from('document_objects').update({ status: snapshot.status, body: snapshot.body }).eq('id', docId);
});

test.beforeEach(() => {
  test.skip(!docId, '편집 가능한 E2E IM 문서 없음 (골든 E2E 선행 필요)');
});

test('유형 태깅: 선택 → 저장 → 새로고침 후 유지 + photos_v2 동기화', async ({ page }) => {
  await openEditor(page);
  await withSave(page, async () => {
    await page.getByLabel('사진 3 유형').selectOption('corridor');
  });

  await page.reload();
  await expect(page.getByLabel('사진 3 유형')).toHaveValue('corridor');

  const body = await fetchBody();
  const p3 = (body.photos as Photo[])[2];
  expect(p3.category).toBe('corridor');
  const v2 = (body.photos_v2 as Photo[]).find((p) => p.url === p3.url);
  expect(v2?.category).toBe('corridor');
});

test('캡션 편집: blur 저장 → 새로고침 후 유지', async ({ page }) => {
  const caption = `E2E-캡션-${Date.now()}`;
  await openEditor(page);
  await withSave(page, async () => {
    const input = page.getByPlaceholder('사진 2 캡션');
    await input.fill(caption);
    await input.blur();
  });

  await page.reload();
  await expect(page.getByPlaceholder('사진 2 캡션')).toHaveValue(caption);
  const body = await fetchBody();
  expect((body.photos as Photo[])[1].caption).toBe(caption);
  const url = (body.photos as Photo[])[1].url;
  expect((body.photos_v2 as Photo[]).find((p) => p.url === url)?.caption).toBe(caption);
});

test('IM 제외 토글: 배지 표시 → 새로고침 후 유지 → photos_v2 excluded 동기화 → 해제 복구', async ({ page }) => {
  await openEditor(page);
  await withSave(page, async () => {
    await card(page, 4).getByRole('button', { name: '🚫 제외' }).click();
  });
  await expect(card(page, 4).getByText('🚫 IM 제외')).toBeVisible();

  await page.reload();
  await expect(card(page, 4).getByText('🚫 IM 제외')).toBeVisible();
  // 제외된 사진은 유형 select 비활성
  await expect(page.getByLabel('사진 4 유형')).toBeDisabled();

  let body = await fetchBody();
  const url = (body.photos as Photo[])[3].url;
  expect((body.photos as Photo[])[3].excluded).toBe(true);
  expect((body.photos_v2 as Photo[]).find((p) => p.url === url)?.excluded).toBe(true);

  // 해제 → 복구
  await withSave(page, async () => {
    await card(page, 4).getByRole('button', { name: '🚫 제외' }).click();
  });
  await page.reload();
  await expect(card(page, 4).getByText('🚫 IM 제외')).toHaveCount(0);
  body = await fetchBody();
  expect((body.photos_v2 as Photo[]).find((p) => p.url === url)?.excluded).toBeFalsy();
});

test('대표 사진 지정: 단일 cover 유지 + 제외 사진은 cover 불가 해제', async ({ page }) => {
  await openEditor(page);
  await withSave(page, async () => {
    await card(page, 2).getByRole('button', { name: '📌 대표' }).click();
  });

  await page.reload();
  // 배지(span.absolute) 와 버튼 텍스트가 같으므로 배지만 지정\n  await expect(card(page, 2).locator('span.absolute', { hasText: '📌 대표' })).toBeVisible();

  const body = await fetchBody();
  const covers = (body.photos as Photo[]).filter((p) => p.role === 'cover');
  expect(covers).toHaveLength(1);
  expect(covers[0].url).toBe((body.photos as Photo[])[1].url);

  // 대표 사진을 제외하면 cover 역할이 해제되어야 한다 (제외 자산이 표지/개요 사진이 되지 않도록)
  await withSave(page, async () => {
    await card(page, 2).getByRole('button', { name: '🚫 제외' }).click();
  });
  const after = await fetchBody();
  const p2 = (after.photos as Photo[])[1];
  expect(p2.excluded).toBe(true);
  expect(p2.role).not.toBe('cover');
  expect(p2.isHero).toBeFalsy();
});
