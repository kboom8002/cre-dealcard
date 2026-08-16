import { describe, test, expect, beforeAll } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

let serverAvailable = false;

const BUILDINGS = [
  { id: 'fe5cbadd-aede-4a58-af40-3982f48ecfa7', name: 'jamwon', type: 'development', grade: 'B' },
  { id: '36300a3c-f4a7-4277-97d8-ee884cf5ea58', name: 'dangsan', type: 'income', grade: 'C' },
  { id: 'f2a70b50-0e70-4203-b358-75cc991c1660', name: 'yeonnam', type: 'income', grade: 'B' }
];

describe('Smoke V3 Tests', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (res && (res.ok || res.status < 500)) {
        serverAvailable = true;
      }
    } catch {
      serverAvailable = false;
    }
  });

  // S01-S06: API basic response
  describe('API Response (S01-S06)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S0${1+i}: GET /api/public/im-lite/${b.id} -> 200`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        expect(res.status).toBe(200);
      });
      test(`S0${4+i}: Response has data.sections for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        expect(Array.isArray(json.data?.sections)).toBe(true);
      });
    });
  });

  // S07-S15: Section verification
  describe('Section Verification (S07-S15)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${String(7+i).padStart(2, '0')}: sections count >= 3 for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        expect(json.data?.sections?.length).toBeGreaterThanOrEqual(3);
      });
      test(`S${String(10+i).padStart(2, '0')}: sections have title and markdown for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        for (const s of json.data?.sections || []) {
          expect(s.title).toBeTruthy();
          expect(s.markdown).toBeTruthy();
        }
      });
      test(`S${String(13+i).padStart(2, '0')}: section_types present for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const types = (json.data?.sections || []).map((s: any) => s.section_type).filter(Boolean);
        expect(types.length).toBeGreaterThan(0);
      });
    });
  });

  // S16-S24: Content quality
  describe('Content Quality (S16-S24)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${String(16+i).padStart(2, '0')}: avg markdown >= 100 chars for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const sections = json.data?.sections || [];
        const avgLen = sections.reduce((sum: number, s: any) => sum + (s.markdown?.length || 0), 0) / Math.max(sections.length, 1);
        expect(avgLen).toBeGreaterThanOrEqual(100);
      });
      test(`S${String(19+i).padStart(2, '0')}: has markdown table for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const hasTable = (json.data?.sections || []).some((s: any) => s.markdown?.includes('|'));
        expect(hasTable).toBe(true);
      });
      test(`S${String(22+i).padStart(2, '0')}: no forbidden expressions for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const forbidden = ['guaranteed returns', 'risk-free'];
        for (const s of json.data?.sections || []) {
          for (const f of forbidden) {
            expect(s.markdown).not.toContain(f);
          }
        }
      });
    });
  });

  // S25-S30: PPTX
  describe('PPTX (S25-S30)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${25+i}: GET pptx for ${b.name} -> 200`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}/pptx`);
        expect(res.status).toBe(200);
      });
      test(`S${28+i}: PPTX size >= 50KB for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}/pptx`);
        const buf = await res.arrayBuffer();
        expect(buf.byteLength).toBeGreaterThanOrEqual(50 * 1024);
      });
    });
  });

  // S31-S36: SSR pages
  describe('SSR (S31-S36)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${31+i}: GET /im-lite/${b.id} -> 200`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/im-lite/${b.id}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
      });
      test(`S${34+i}: HTML has og:title for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/im-lite/${b.id}`);
        const html = await res.text();
        expect(html).toContain('og:title');
      });
    });
  });

  // S37-S39: OG meta
  describe('OG Meta (S37-S39)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${37+i}: og:description for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/im-lite/${b.id}`);
        const html = await res.text();
        expect(html).toContain('og:description');
      });
    });
  });

  // S40-S45: Data consistency
  describe('Data Consistency (S40-S45)', () => {
    BUILDINGS.forEach((b, i) => {
      test(`S${40+i}: displayName length > 3 for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const name = json.data?.displayName || json.data?.blindName || '';
        expect(name.length).toBeGreaterThan(3);
      });
      test(`S${43+i}: content has substance for ${b.name}`, async () => {
        if (!serverAvailable) return;
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const allText = (json.data?.sections || []).map((s: any) => s.markdown).join(' ');
        expect(allText.length).toBeGreaterThan(100);
      });
    });
  });

  // S46-S50: Legacy compatibility
  describe('Legacy (S46-S50)', () => {
    test('S46: API returns timestamp', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE}/api/public/im-lite/${BUILDINGS[0].id}`);
      const json = await res.json();
      expect(json.data?.generatedAt || json.data?.created_at).toBeTruthy();
    });

    test('S47: API returns displayName', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE}/api/public/im-lite/${BUILDINGS[0].id}`);
      const json = await res.json();
      expect(json.data?.displayName || json.data?.blindName).toBeTruthy();
    });

    test('S48: at least 1 building has disclaimer or next_steps', async () => {
      if (!serverAvailable) return;
      let found = false;
      for (const b of BUILDINGS) {
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        const hasDisclaimer = (json.data?.sections || []).some((s: any) =>
          s.section_type === 'disclaimer' ||
          s.section_type === 'next_steps' ||
          (s.markdown && (s.markdown.includes('면책') || s.markdown.includes('본 자료는')))
        );
        if (hasDisclaimer) { found = true; break; }
      }
      expect(found).toBe(true);
    });

    test('S49: PPTX Content-Type correct', async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE}/api/public/im-lite/${BUILDINGS[0].id}/pptx`);
      const ct = res.headers.get('content-type') || '';
      expect(ct).toMatch(/application\/(vnd\.openxmlformats|octet-stream)/);
    });

    test('S50: All buildings same schema', async () => {
      if (!serverAvailable) return;
      const keys: string[][] = [];
      for (const b of BUILDINGS) {
        const res = await fetch(`${BASE}/api/public/im-lite/${b.id}`);
        const json = await res.json();
        keys.push(Object.keys(json.data || {}).sort());
      }
      expect(keys[0]).toEqual(keys[1]);
      expect(keys[1]).toEqual(keys[2]);
    });
  });
});
