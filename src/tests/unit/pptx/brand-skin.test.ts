import { describe, it, expect } from 'vitest';
import {
  deriveBrandSkin, normalizeBrandHex, applyBasicBrand, resolveBrandAccent, contrastRatio,
} from '@/domain/building/mobile-im/pptx/brand-skin';
import { getPptxTheme, validatePresetAccessibility } from '@/domain/building/mobile-im/pptx/pptx-theme';

const SAMPLES = ['1F4E8C', '0F766E', 'E11D48', 'FFD400', 'F5F5DC', '000000', 'FFFFFF', '808080', '7C3AED', 'FACC15'];

describe('brand-skin: normalizeBrandHex', () => {
  it('accepts #RRGGBB / RRGGBB / #RGB, rejects garbage', () => {
    expect(normalizeBrandHex('#1f4e8c')).toBe('1F4E8C');
    expect(normalizeBrandHex('1f4e8c')).toBe('1F4E8C');
    expect(normalizeBrandHex('#abc')).toBe('AABBCC');
    for (const bad of ['', 'red', '#12345', 'GGGGGG', null, undefined, 12345, {}]) expect(normalizeBrandHex(bad)).toBeNull();
  });
});

describe('brand-skin: deriveBrandSkin contrast guard', () => {
  it.each(SAMPLES)('%s → accent ≥4.5:1, accentL ≥3:1, dark text legible', (hex) => {
    const r = deriveBrandSkin(hex)!;
    expect(r).not.toBeNull();
    const p = r.palette as Record<string, string>;
    expect(contrastRatio(p.accent, 'FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.accentL, 'FFFFFF')).toBeGreaterThanOrEqual(3.0);
    expect(contrastRatio(p.darkBody, p.darkCard)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.darkAccentText, p.darkAccentBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.ink, 'FFFFFF')).toBeGreaterThanOrEqual(7);
    for (const v of Object.values(p)) expect(v).toMatch(/^[0-9A-F]{6}$/);
  });

  it('keeps a sufficiently dark brand color unchanged; adjusts a pale one', () => {
    expect(deriveBrandSkin('1F4E8C')!.palette.accent).toBe('1F4E8C');
    expect(deriveBrandSkin('1F4E8C')!.adjusted).toBe(false);
    const pale = deriveBrandSkin('FFD400')!;
    expect(pale.adjusted).toBe(true);
    expect(pale.palette.accent).not.toBe('FFD400');
  });

  it('invalid input → null (never throws)', () => {
    expect(deriveBrandSkin('zzz')).toBeNull();
    expect(deriveBrandSkin(undefined)).toBeNull();
  });
});

describe('brand-skin: applyBasicBrand', () => {
  const basic = getPptxTheme('credeal_basic');
  it('replaces palette only; fonts/presetId/layout/company unchanged; WCAG validator clean', () => {
    const t = applyBasicBrand(basic, '#1F4E8C');
    expect(t.accent).toBe('1F4E8C');
    expect(t.presetId).toBe('credeal_basic');
    expect(t.titleFont).toBe(basic.titleFont);
    expect(t.bodyFont).toBe(basic.bodyFont);
    expect(t.coverStyle).toBe(basic.coverStyle);
    expect(t.layoutStyle).toBe(basic.layoutStyle);
    expect(t.companyName).toBe(basic.companyName);
    // 라벨 가독성용 중립색과 의미색은 Basic 값 유지
    expect(t.slate).toBe(basic.slate);
    expect(t.mute).toBe(basic.mute);
    expect(t.red).toBe(basic.red);
    expect(t.green).toBe(basic.green);
    expect(validatePresetAccessibility({ ...t, body: basic.body } as any)).toEqual([]);
  });
  it('no-op for invalid color or non-basic preset', () => {
    expect(applyBasicBrand(basic, 'nope')).toBe(basic);
    expect(applyBasicBrand(basic, undefined)).toBe(basic);
    const pro = getPptxTheme('golden_institutional');
    expect(applyBasicBrand(pro, '1F4E8C')).toBe(pro);
  });
});

// ── resolveBrandAccent: 최소 Supabase 쿼리 빌더 목 ──
function mockDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const b: any = {
        select: () => b,
        eq: (k: string, v: any) => { rows = rows.filter(r => r[k] === v); return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
      };
      return b;
    },
  };
}
const UID = '11111111-1111-1111-1111-111111111111';
const PID = '22222222-2222-2222-2222-222222222222';

describe('brand-skin: resolveBrandAccent', () => {
  it('company default wins; falls back to own default; null when none', async () => {
    const db = mockDb({
      broker_profiles: [{ user_id: UID, company_id: 'C1' }],
      pptx_custom_presets: [
        { id: 'p-company', user_id: 'other', company_id: 'C1', is_company_default: true, tokens: { accent: '#1F4E8C' } },
        { id: 'p-own', user_id: UID, company_id: null, is_company_default: true, tokens: { accent: '0F766E' } },
      ],
    });
    expect(await resolveBrandAccent({ supabase: db, ownerId: UID })).toMatchObject({ accent: '1F4E8C', source: 'company_default' });

    const db2 = mockDb({
      broker_profiles: [{ user_id: UID, company_id: null }],
      pptx_custom_presets: [{ id: 'p-own', user_id: UID, company_id: null, is_company_default: true, tokens: { accent: '0F766E' } }],
    });
    expect(await resolveBrandAccent({ supabase: db2, ownerId: UID })).toMatchObject({ accent: '0F766E', source: 'user_default' });
    expect(await resolveBrandAccent({ supabase: mockDb({}), ownerId: UID })).toBeNull();
  });

  it('explicit UUID preset: owner / same company / public only', async () => {
    const mk = (row: any) => mockDb({ broker_profiles: [{ user_id: UID, company_id: 'C1' }], pptx_custom_presets: [{ id: PID, ...row }] });
    expect(await resolveBrandAccent({ supabase: mk({ user_id: UID, tokens: { accent: '1F4E8C' } }), ownerId: UID, presetParam: PID })).toMatchObject({ accent: '1F4E8C', source: 'preset' });
    expect(await resolveBrandAccent({ supabase: mk({ user_id: 'x', company_id: 'C1', tokens: { accent: '1F4E8C' } }), ownerId: UID, presetParam: PID })).not.toBeNull();
    expect(await resolveBrandAccent({ supabase: mk({ user_id: 'x', company_id: 'C2', is_public: false, tokens: { accent: '1F4E8C' } }), ownerId: UID, presetParam: PID })).toBeNull();
    expect(await resolveBrandAccent({ supabase: mk({ user_id: 'x', company_id: 'C2', is_public: true, tokens: { accent: '1F4E8C' } }), ownerId: UID, presetParam: PID })).not.toBeNull();
  });

  it('DB failure / missing owner → null without throwing', async () => {
    const boom = { from() { throw new Error('db down'); } };
    expect(await resolveBrandAccent({ supabase: boom as any, ownerId: UID })).toBeNull();
    expect(await resolveBrandAccent({ supabase: mockDb({}), ownerId: null })).toBeNull();
    expect(await resolveBrandAccent({ supabase: null, ownerId: UID })).toBeNull();
  });
});
