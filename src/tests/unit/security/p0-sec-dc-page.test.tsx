/**
 * P0-SEC (SEC-5 + status filtering) — /dc/[id] page.
 *  - private fields never reach the element tree handed to (client) components;
 *  - non-public states 404 for the public but stay visible to the authenticated owner
 *    (LiveDealCardPreviewCard iframe `/dc/{id}?preview=1`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  viewer: { userId: null as string | null, isAdmin: false },
  ssotMeta: { owner_id: 'owner-1', status: 'public_signal_ready' } as Record<string, unknown> | null,
  signalCard: { title: '당산역 권역 근생 매각', area_signal: '당산역 권역', asset_type: '근린생활시설', price_band: '80억대', body: {}, status: 'draft', visibility: 'public_blind' } as Record<string, unknown> | null,
}));

const POISON_ADDR = '서울특별시 영등포구 당산동5가 POISON_ADDR_117-3번지 호산당빌딩';
const building = {
  id: 'bldg-1',
  raw_input: 'POISON_MEMO 매도자 급매 010-9999-1234',
  raw_address: POISON_ADDR,
  area_signal: '당산역 권역',
  asset_type: '근린생활시설',
  price_band: '80억대',
  lease_summary: { tenants: [{ tenant_name: 'POISON_TENANT_스타벅스', monthly_rent_krw: 12345678 }] },
  layers: {
    location: { raw_address: POISON_ADDR, exact_address: POISON_ADDR },
    finance: { asking_price_krw: 8_500_000_000, monthly_rent_krw: 32_000_000 },
    rent_roll: [{ tenant_name: 'POISON_TENANT_스타벅스', monthly_rent_krw: 12345678 }],
  },
};

vi.mock('@/lib/server-viewer', () => ({ getServerViewer: vi.fn(async () => h.viewer) }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'building_ssot_lite') return { data: h.ssotMeta, error: null };
          if (table === 'building_signal_cards') return { data: h.signalCard, error: null };
          if (table === 'broker_profiles') return { data: { display_name: '김중개', phone: '010-1111-2222', slug: 'kim' }, error: null };
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  })),
}));

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    readWithMigration: vi.fn(async () => ({ source: 'building_ssot_lite', data: building, migrated: false })),
  };
});

vi.mock('@/domain/building/im-core', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    readBuilding: vi.fn(async () => building),
    readBuildingPure: vi.fn(async () => building),
  };
});

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async () => building),
  readBuildingPure: vi.fn(async () => building),
}));

import DealCardShortPage, { generateMetadata } from '@/app/(public)/dc/[id]/page';

/** Collects the props of every element in the tree (what would be serialised for client components). */
function collectProps(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectProps(n, out));
  } else if (React.isValidElement(node)) {
    const { children, ...rest } = (node.props ?? {}) as Record<string, unknown>;
    out.push(rest);
    collectProps(children, out);
  }
  return out;
}
const safeJson = (v: unknown) =>
  JSON.stringify(v, (_k, val) => (typeof val === 'function' || typeof val === 'symbol' ? undefined : val));

const run = (preview = false) =>
  DealCardShortPage({
    params: Promise.resolve({ id: 'bldg-1' }),
    searchParams: Promise.resolve(preview ? { preview: '1' } : {}),
  });

function digestOf(err: unknown): string {
  return String((err as { digest?: string })?.digest ?? (err as Error)?.message ?? '');
}

describe('P0-SEC: /dc/[id] page', () => {
  beforeEach(() => {
    h.viewer = { userId: null, isAdmin: false };
    h.ssotMeta = { owner_id: 'owner-1', status: 'public_signal_ready' };
    h.signalCard = { title: '당산역 권역 근생 매각', area_signal: '당산역 권역', asset_type: '근린생활시설', price_band: '80억대', body: {}, status: 'draft', visibility: 'public_blind' };
  });

  it('public card renders without any private field in component props (RSC boundary)', async () => {
    const el = await run();
    const json = safeJson(collectProps(el));
    for (const t of ['POISON_MEMO', 'POISON_ADDR', '117-3', '호산당빌딩', 'POISON_TENANT', '12345678', '010-9999-1234', 'rawInput', 'rentRoll']) {
      expect(json, `leaked: ${t}`).not.toContain(t);
    }
    // PostureWidget gets the minimal input only
    expect(json).toContain('"askingPriceEok":85');
    expect(json).not.toContain('"attrs"');
    expect(json).not.toContain('"teaserView"');
  });

  it('draft signal card / draft building are still public (shared links keep working)', async () => {
    h.ssotMeta = { owner_id: 'owner-1', status: 'draft' };
    await expect(run()).resolves.toBeTruthy();
  });

  it.each([
    ['archived building', { owner_id: 'owner-1', status: 'archived' }, undefined],
    ['internal_only signal card', undefined, { visibility: 'internal_only', status: 'draft' }],
    ['archived signal card', undefined, { visibility: 'public_blind', status: 'archived' }],
  ])('%s → 404 for anonymous and other users, visible to owner/admin (preview)', async (_label, meta, card) => {
    if (meta) h.ssotMeta = meta;
    if (card) h.signalCard = { ...h.signalCard, ...card };

    await expect(run(true)).rejects.toSatisfy((e: unknown) => digestOf(e).includes('404'));

    h.viewer = { userId: 'other-2', isAdmin: false };
    await expect(run(true)).rejects.toSatisfy((e: unknown) => digestOf(e).includes('404'));

    h.viewer = { userId: 'owner-1', isAdmin: false };
    await expect(run(true)).resolves.toBeTruthy();

    h.viewer = { userId: 'admin-9', isAdmin: true };
    await expect(run(true)).resolves.toBeTruthy();
  });

  it('generateMetadata exposes nothing for non-public cards', async () => {
    h.ssotMeta = { owner_id: 'owner-1', status: 'archived' };
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'bldg-1' }) });
    expect(meta.openGraph).toBeUndefined();
    expect(safeJson(meta)).not.toContain('당산');
  });
});
