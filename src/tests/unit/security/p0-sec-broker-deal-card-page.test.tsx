/**
 * P0-SEC (SEC-3) — /broker/deal-card/[id] page: anonymous bot / human / non-owner paths
 * must not load or render private building data (raw_input, raw_address, ...).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  ua: '',
  viewer: { userId: null as string | null, isAdmin: false },
  accessRow: { owner_id: 'owner-1', status: 'public_signal_ready' } as Record<string, unknown> | null,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'user-agent': h.ua })),
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: vi.fn(async () => h.viewer),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: table === 'building_ssot_lite' ? h.accessRow : null,
          error: null,
        })),
      };
      return chain;
    }),
  })),
}));

const POISON = {
  id: 'bldg-1',
  owner_id: 'owner-1',
  raw_input: 'POISON_MEMO 매도자 급매 010-9999-1234',
  raw_address: '서울 영등포구 당산동 POISON_ADDR_117-3번지 호산당빌딩',
};
const readWithMigration = vi.fn(async () => ({ source: 'building_ssot_lite', data: POISON, migrated: false }));
vi.mock('@/lib/ssot-adapter', () => ({
  readWithMigration: (...args: unknown[]) => (readWithMigration as any)(...args),
  buildAttrsFromSsotLite: vi.fn(() => ({})),
  buildProvenanceFromSsotLite: vi.fn(() => ({})),
}));

import BrokerDealCardResultPage, { generateMetadata } from '@/app/(broker)/broker/deal-card/[id]/page';

const KAKAO = 'Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/)';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36';
const params = Promise.resolve({ id: 'bldg-1' });

function digestOf(err: unknown): string {
  return String((err as { digest?: string })?.digest ?? (err as Error)?.message ?? '');
}

describe('P0-SEC SEC-3: broker deal-card page access', () => {
  beforeEach(() => {
    h.ua = '';
    h.viewer = { userId: null, isAdmin: false };
    h.accessRow = { owner_id: 'owner-1', status: 'public_signal_ready' };
    readWithMigration.mockClear();
  });

  it('anonymous social bot → minimal shell, never loads raw building data', async () => {
    h.ua = KAKAO;
    const el = await BrokerDealCardResultPage({ params });
    const html = renderToStaticMarkup(el as any);
    expect(readWithMigration).not.toHaveBeenCalled();
    for (const t of ['POISON_MEMO', 'POISON_ADDR', '117-3', '호산당빌딩', '010-9999-1234']) {
      expect(html).not.toContain(t);
    }
    expect(html).toContain('/dc/bldg-1');
  });

  it('anonymous social bot on archived building → notFound', async () => {
    h.ua = KAKAO;
    h.accessRow = { owner_id: 'owner-1', status: 'archived' };
    await expect(BrokerDealCardResultPage({ params })).rejects.toSatisfy((e: unknown) => digestOf(e).includes('404'));
    expect(readWithMigration).not.toHaveBeenCalled();
  });

  it('anonymous human → redirect to /login', async () => {
    h.ua = CHROME;
    await expect(BrokerDealCardResultPage({ params })).rejects.toSatisfy((e: unknown) => digestOf(e).includes('/login'));
    expect(readWithMigration).not.toHaveBeenCalled();
  });

  it('authenticated non-owner → notFound without loading raw data', async () => {
    h.ua = CHROME;
    h.viewer = { userId: 'other-2', isAdmin: false };
    await expect(BrokerDealCardResultPage({ params })).rejects.toSatisfy((e: unknown) => digestOf(e).includes('404'));
    expect(readWithMigration).not.toHaveBeenCalled();
  });

  it('generateMetadata uses only public-safe columns (no readWithMigration)', async () => {
    h.ua = KAKAO;
    h.accessRow = { area_signal: '당산역 권역', asset_type: '근린생활시설', price_band: '80억대', status: 'public_signal_ready' };
    const meta = await generateMetadata({ params });
    expect(readWithMigration).not.toHaveBeenCalled();
    expect(String(meta.title)).toContain('당산역 권역');
    expect(JSON.stringify(meta)).not.toMatch(/POISON|117-3|호산당/);
    expect(JSON.stringify(meta.openGraph)).toContain('/api/og/deal/bldg-1');
  });
});
