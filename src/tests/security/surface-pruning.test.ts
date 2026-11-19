import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  requireBrokerMock: vi.fn(async () => ({
    user: { id: '11111111-4444-4444-8444-111111111111' },
    role: 'broker',
    error: null,
  })),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => hoisted.requireBrokerMock(...(args as [])),
}));

import { proxy } from '@/proxy';
import { POST as campaignPOST, GET as campaignGET } from '@/app/api/broker/campaign/route';

describe('PR-2A Attack Surface Pruning & Canonical 308/404/410 Contracts', () => {
  const prevFlag = process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS;

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS;
    } else {
      process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS = prevFlag;
    }
    vi.unstubAllEnvs();
  });

  it('blocks /funding, /broker/circles, and /buildings/:id/schedule with 404 when flag is unset, and opens when =1', async () => {
    delete process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS;

    for (const p of [
      '/funding',
      '/funding/project/abc',
      '/broker/circles',
      '/broker/circles/join',
      '/buildings/abc-123/schedule',
    ]) {
      const res = await proxy(new NextRequest(`https://www.credeal.net${p}`));
      expect(res.status).toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }

    process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS = '1';
    vi.stubEnv('NODE_ENV', 'test');
    const fundingOpen = await proxy(new NextRequest('https://www.credeal.net/funding'));
    expect(fundingOpen.status).toBe(200);

    const scheduleOpen = await proxy(new NextRequest('https://www.credeal.net/buildings/abc-123/schedule'));
    expect(scheduleOpen.status).toBe(200);

    const circlesAuth = await proxy(
      new NextRequest('https://www.credeal.net/broker/circles', {
        headers: { 'x-playwright-test': 'true' },
      })
    );
    expect(circlesAuth.status).toBe(200);
  });

  it('returns 308 permanent redirects for /broker/campaign, /broker/w/magazine, /broker/magazine-editor, and /broker/inbox while preserving query', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const hdrs = { headers: { 'x-playwright-test': 'true' } };

    for (const src of ['/broker/campaign?deal=1', '/broker/w/magazine?tab=list', '/broker/magazine-editor?mode=simple']) {
      const res = await proxy(new NextRequest(`https://www.credeal.net${src}`, hdrs));
      expect(res.status).toBe(308);
      const loc = res.headers.get('location') || '';
      expect(loc.startsWith('https://www.credeal.net/broker/w/newsletter')).toBe(true);
      expect(loc).toContain(src.split('?')[1]);
    }

    const inboxRes = await proxy(new NextRequest('https://www.credeal.net/broker/inbox?filter=vip', hdrs));
    expect(inboxRes.status).toBe(308);
    expect(inboxRes.headers.get('location')).toBe('https://www.credeal.net/broker/w/inbox?filter=vip');
  });

  it('returns 410 Gone (DEPRECATED_ROUTE) on GET/POST /api/broker/campaign', async () => {
    const postRes = await campaignPOST(
      new NextRequest('https://www.credeal.net/api/broker/campaign', {
        method: 'POST',
        body: JSON.stringify({ dealId: 'x' }),
      })
    );
    expect(postRes.status).toBe(410);
    expect(await postRes.json()).toMatchObject({
      ok: false,
      code: 'DEPRECATED_ROUTE',
      redirect: '/broker/w/newsletter',
    });

    const getRes = await campaignGET(new NextRequest('https://www.credeal.net/api/broker/campaign'));
    expect(getRes.status).toBe(410);
  });

  it('keeps /broker/golden-admin layout guarded by requireAdminRsc()', () => {
    const layoutPath = path.resolve(
      process.cwd(),
      'src/app/(broker)/broker/golden-admin/layout.tsx'
    );
    const src = fs.readFileSync(layoutPath, 'utf-8');
    expect(src).toContain('requireAdminRsc');
  });
});
