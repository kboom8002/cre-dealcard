import { describe, it, expect } from 'vitest';
import {
  PPTX_PRESET_TEMPLATES,
  BASIC_SKIN_IDS,
  isBasicSkinId,
  applyBasicSkin,
  getPptxTheme,
} from '@/domain/building/mobile-im/pptx/pptx-theme';

describe('Basic IM 시각 스킨 (applyBasicSkin)', () => {
  const base = PPTX_PRESET_TEMPLATES.credeal_basic;

  it('Basic 3종 ID 가 모두 테마로 정의되어 있다 (minimal_clean 포함)', () => {
    for (const id of BASIC_SKIN_IDS) {
      expect(PPTX_PRESET_TEMPLATES[id], id).toBeTruthy();
      expect(isBasicSkinId(id)).toBe(true);
    }
    expect(isBasicSkinId('executive_gold')).toBe(false);
    expect(isBasicSkinId(undefined)).toBe(false);
  });

  it('credeal_basic / 미지정 / 알 수 없는 ID 는 base 를 그대로 반환한다', () => {
    expect(applyBasicSkin(base, undefined)).toBe(base);
    expect(applyBasicSkin(base, null)).toBe(base);
    expect(applyBasicSkin(base, 'credeal_basic')).toBe(base);
    expect(applyBasicSkin(base, 'nonexistent')).toBe(base);
    expect(applyBasicSkin(base, 'executive_gold')).toBe(base);
  });

  it.each(['minimal_clean', 'corporate_clean'] as const)('%s: 팔레트만 교체하고 presetId·글꼴·레이아웃은 유지', (skinId) => {
    const out = applyBasicSkin(base, skinId);
    const skin = PPTX_PRESET_TEMPLATES[skinId];
    expect(out).not.toBe(base);
    expect(out.presetId).toBe('credeal_basic');
    expect(out.accent).toBe(skin.accent);
    expect(out.accent).not.toBe(base.accent);
    expect(out.titleFont).toBe(base.titleFont);
    expect(out.bodyFont).toBe(base.bodyFont);
    expect(out.coverStyle).toBe(base.coverStyle);
    expect(out.layoutStyle).toBe(base.layoutStyle);
  });

  it('Basic 이 아닌 base(Pro 테마)에는 스킨을 적용하지 않는다', () => {
    const pro = getPptxTheme('executive_gold');
    expect(applyBasicSkin(pro, 'minimal_clean')).toBe(pro);
  });

  it('3종의 accent 가 서로 다르다', () => {
    const accents = new Set(BASIC_SKIN_IDS.map((id) => PPTX_PRESET_TEMPLATES[id].accent));
    expect(accents.size).toBe(3);
  });

  it.each(['minimal_clean', 'corporate_clean'] as const)('%s: 라벨용 중립 글자색(slate/mute/mute2)은 Basic 값 유지', (skinId) => {
    const out = applyBasicSkin(base, skinId);
    expect(out.slate).toBe(base.slate);
    expect(out.mute).toBe(base.mute);
    expect(out.mute2).toBe(base.mute2);
  });

  it('corporate_clean: 밝은 배경 라벨색(accentL)이 흰 배경 대비 3:1 이상', () => {
    const lum = (hex: string) => {
      const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const out = applyBasicSkin(base, 'corporate_clean');
    expect(1.05 / (lum(out.accentL) + 0.05)).toBeGreaterThanOrEqual(3);
    // Pro 용 원본 테마는 그대로 (어두운 배경용 밝은 민트)
    expect(PPTX_PRESET_TEMPLATES.corporate_clean.accentL).toBe('34D399');
  });

  it('표지/마지막 면용 어두운 톤(ink)이 스킨마다 다르다 (네이비 고정 아님)', () => {
    const inks = new Set(BASIC_SKIN_IDS.map((id) => applyBasicSkin(base, id).ink));
    expect(inks.size).toBe(3);
  });
});
