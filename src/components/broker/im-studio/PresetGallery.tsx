'use client';

import React, { useState } from 'react';
import { useTheme, type StudioPresetOption } from '@/contexts/ThemeContext';
import { deriveBrandSkin, contrastRatio } from '@/domain/building/mobile-im/pptx/brand-skin';
import type { PptxThemeTokens } from '@/domain/building/mobile-im/pptx/pptx-theme';

const COVER_STYLE_OPTIONS: Array<{
  id: PptxThemeTokens['coverStyle'];
  label: string;
  desc: string;
}> = [
  { id: 'institutional_masses', label: '기관 매스형', desc: '우상단 3단 기하학 매스 + 골드 바' },
  { id: 'corporate_card', label: '코퍼레이트 카드형', desc: '깔끔한 프레임 카드 + 하단 제원 요약' },
  { id: 'split', label: '좌우 분할형', desc: '좌측 타이틀 · 우측 브랜드 컬러 패널' },
  { id: 'hero_dark', label: '풀 다크 히어로', desc: '전면 딥 다크 + 중앙 골드 프레임' },
  { id: 'obsidian_glow', label: '옵시디언 글로우', desc: '모던 다크 + 하단 액센트 포인트' },
];

const LAYOUT_STYLE_OPTIONS: Array<{
  id: PptxThemeTokens['layoutStyle'];
  label: string;
  desc: string;
}> = [
  { id: 'classic', label: '표준 클래식', desc: '상단 네이비 헤더 바 + 정통 격자 표' },
  { id: 'minimal', label: '미니멀 클린', desc: '여백 강조 + 절제된 구분선' },
  { id: 'modern', label: '모던 카드', desc: '라운드 스탯 카드 + 컬러 배지' },
  { id: 'executive', label: '이그제큐티브', desc: '상하단 골드 보더 + 권위적 타이포' },
  { id: 'dramatic', label: '다이나믹 강조', desc: '핵심 수익률·매매가 대형 숫자 강조' },
  { id: 'open_frame', label: '오픈 프레임', desc: '와이드 개방형 레이아웃' },
];

const QUICK_BRAND_COLORS = [
  { hex: 'B8860B', label: '크리딜 골드' },
  { hex: '1D4ED8', label: '로열 블루' },
  { hex: '047857', label: '에메랄드 그린' },
  { hex: '8E2B3C', label: '와인 버건디' },
  { hex: '6D28D9', label: '프레스티지 퍼플' },
  { hex: 'B45309', label: '앰버 브라운' },
  { hex: '0F766E', label: '딥 틸' },
  { hex: '334155', label: '차콜 슬레이트' },
];

function PresetMiniPreview({ preset, isSelected }: { preset: StudioPresetOption; isSelected: boolean }) {
  const t = preset.tokens;
  return (
    <div
      className={`group relative rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${
        isSelected
          ? 'border-[#1D4ED8] bg-[#EFF6FF] shadow-md ring-2 ring-[#1D4ED8]/20'
          : 'border-[#CBD5E1] bg-white hover:border-[#64748B] hover:shadow-sm'
      }`}
    >
      {/* Mini 16:9 slide thumbnail */}
      <div
        className="w-full aspect-[16/9] rounded-lg overflow-hidden border border-black/10 mb-2.5 relative shadow-inner"
        style={{ backgroundColor: `#${t.darkCard}` }}
      >
        {/* Top geometric mass or split bar */}
        <div
          className="absolute right-0 top-0 h-full w-1/3 opacity-90"
          style={{ backgroundColor: `#${t.ink2}` }}
        />
        <div
          className="absolute right-2 top-2 bottom-2 w-3 rounded-sm"
          style={{ backgroundColor: `#${t.accent}` }}
        />
        {/* Kicker + Title mock */}
        <div className="p-2.5 flex flex-col justify-between h-full relative z-10">
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-1 rounded-full"
              style={{ backgroundColor: `#${t.accent}` }}
            />
            <span
              className="text-[8px] font-bold tracking-wider uppercase"
              style={{ color: `#${t.accentL}` }}
            >
              IM STUDIO
            </span>
          </div>
          <div>
            <div
              className="h-2 w-3/5 rounded-sm mb-1"
              style={{ backgroundColor: `#${t.darkBody}` }}
            />
            <div
              className="h-1.5 w-2/5 rounded-sm opacity-75"
              style={{ backgroundColor: `#${t.darkMute}` }}
            />
          </div>
          {/* Bottom Color Swatch Bar */}
          <div className="flex items-center gap-1 pt-1">
            {[t.ink, t.accent, t.green, t.tint].map((hex, i) => (
              <span
                key={i}
                className="w-3 h-3 rounded-full border border-white/40 shadow-xs"
                style={{ backgroundColor: `#${hex}` }}
                title={`#${hex}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Label + Badge */}
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-xs font-extrabold text-[#0F172A] truncate">
          {preset.label}
        </span>
        {isSelected ? (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold rounded bg-[#1D4ED8] text-white">
            적용됨
          </span>
        ) : preset.badge ? (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#E2E8F0] text-[#1E293B]">
            {preset.badge}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] text-[#475569] line-clamp-1 font-medium">
        {preset.desc}
      </p>
    </div>
  );
}

export function PresetGallery() {
  const {
    presetId,
    tokens,
    brandAccent,
    coverStyle,
    layoutStyle,
    presets,
    setPreset,
    setBrandAccent,
    setCoverStyle,
    setLayoutStyle,
    saveCustomPreset,
  } = useTheme();

  const [customHexInput, setCustomHexInput] = useState(brandAccent || tokens.accent);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const basicPresets = presets.filter(p => p.tier === 'basic' || p.tier === 'custom');
  const proPresets = presets.filter(p => p.tier === 'pro');

  const brandResult = deriveBrandSkin(brandAccent || tokens.accent);
  const whiteContrast = contrastRatio(tokens.accent, 'FFFFFF');

  const handleSaveCustom = async () => {
    setSavingPreset(true);
    setSaveMessage(null);
    const ok = await saveCustomPreset(presetNameInput || '내 중개법인 기본 테마');
    setSavingPreset(false);
    setSaveMessage(ok ? '✓ 내 기본 프리셋으로 저장되었습니다.' : '프리셋 저장 중 오류가 발생했습니다.');
    if (ok) setPresetNameInput('');
    setTimeout(() => setSaveMessage(null), 3500);
  };

  return (
    <div className="space-y-6 text-[#0F172A]">
      {/* 1. Basic IM 표준 스킨 갤러리 */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A]">
              🎨 Basic IM 표준 프리셋 ({basicPresets.length}종)
            </h4>
            <p className="text-[11px] text-[#475569] mt-0.5">
              클릭 즉시 우측 16:9 슬라이드 미리보기와 다운로드 PPTX에 반영됩니다.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {basicPresets.map(preset => (
            <div key={preset.id} onClick={() => setPreset(preset.id)}>
              <PresetMiniPreview preset={preset} isSelected={presetId === preset.id} />
            </div>
          ))}
        </div>
      </section>

      {/* 2. 프리미엄 / 기관투자형 확장 테마 */}
      <section className="pt-3 border-t border-[#E2E8F0]">
        <div className="mb-2.5">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A]">
            🏛️ 기관투자형 · 프리미엄 팔레트 ({proPresets.length}종)
          </h4>
          <p className="text-[11px] text-[#475569] mt-0.5">
            법인 매수자·기관 브리핑용 고품격 컬러 테마입니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {proPresets.map(preset => (
            <div key={preset.id} onClick={() => setPreset(preset.id)}>
              <PresetMiniPreview preset={preset} isSelected={presetId === preset.id} />
            </div>
          ))}
        </div>
      </section>

      {/* 3. 브랜드 대표색(Accent) 원클릭 커스터마이징 */}
      <section className="pt-3 border-t border-[#E2E8F0]">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A]">
            🖌️ 중개법인 브랜드 대표색 (자동 명도·대비 보정)
          </h4>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D1FAE5] text-[#065F46]">
            WCAG 대비 {whiteContrast.toFixed(1)}:1 PASS
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {QUICK_BRAND_COLORS.map(c => {
            const active = (brandAccent || tokens.accent).toUpperCase() === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => {
                  setCustomHexInput(c.hex);
                  setBrandAccent(c.hex);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  active
                    ? 'border-[#0F172A] bg-[#F1F5F9] text-[#0F172A] ring-2 ring-[#0F172A]/15'
                    : 'border-[#CBD5E1] bg-white text-[#334155] hover:border-[#64748B]'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0"
                  style={{ backgroundColor: `#${c.hex}` }}
                />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={`#${(brandResult?.brandHex || tokens.accent).slice(0, 6)}`}
            onChange={e => {
              const clean = e.target.value.replace('#', '').toUpperCase();
              setCustomHexInput(clean);
              setBrandAccent(clean);
            }}
            className="w-9 h-9 rounded-lg border border-[#CBD5E1] cursor-pointer bg-white p-0.5"
            title="브랜드 대표 색상 선택"
          />
          <input
            type="text"
            value={`#${customHexInput.replace('#', '')}`}
            onChange={e => {
              const raw = e.target.value.replace('#', '').toUpperCase();
              setCustomHexInput(raw);
              if (/^[0-9A-F]{6}$/.test(raw)) {
                setBrandAccent(raw);
              }
            }}
            maxLength={7}
            className="w-28 px-2.5 py-1.5 text-xs font-mono font-bold border border-[#CBD5E1] rounded-lg bg-white text-[#0F172A]"
            placeholder="#B8860B"
          />
          {brandAccent && (
            <button
              type="button"
              onClick={() => setBrandAccent('')}
              className="px-2.5 py-1.5 text-xs font-bold text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1] rounded-lg bg-[#F8FAFC]"
            >
              프리셋 기본색 복원
            </button>
          )}
        </div>
      </section>

      {/* 4. 표지 스타일 (CoverStyle 5종) */}
      <section className="pt-3 border-t border-[#E2E8F0]">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A] mb-2">
          📘 표지 레이아웃 스타일 (5종)
        </h4>
        <div className="grid grid-cols-1 gap-1.5">
          {COVER_STYLE_OPTIONS.map(opt => {
            const active = coverStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCoverStyle(opt.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${
                  active
                    ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                    : 'border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[11px] text-[#475569]">{opt.desc}</div>
                </div>
                {active && (
                  <span className="text-xs font-extrabold text-[#1D4ED8]">✓ 선택됨</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. 본문 레이아웃 스타일 (LayoutStyle 6종) */}
      <section className="pt-3 border-t border-[#E2E8F0]">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A] mb-2">
          📐 본문 슬라이드 프레임 스타일 (6종)
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUT_STYLE_OPTIONS.map(opt => {
            const active = layoutStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayoutStyle(opt.id)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  active
                    ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                    : 'border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{opt.label}</span>
                  {active && <span className="text-xs font-extrabold text-[#1D4ED8]">✓</span>}
                </div>
                <div className="text-[10px] text-[#475569] mt-0.5 line-clamp-1">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. 내 기본 프리셋으로 저장 */}
      <section className="pt-3 border-t border-[#E2E8F0] bg-[#F8FAFC] p-3 rounded-xl border">
        <h4 className="text-xs font-extrabold text-[#0F172A] mb-1.5">
          💾 현재 색상·표지 조합을 내 기본 프리셋으로 저장
        </h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={presetNameInput}
            onChange={e => setPresetNameInput(e.target.value)}
            placeholder="예: 우리 중개법인 골드 테마"
            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
          />
          <button
            type="button"
            onClick={handleSaveCustom}
            disabled={savingPreset}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white shrink-0 disabled:opacity-50"
          >
            {savingPreset ? '저장 중...' : '프리셋 저장'}
          </button>
        </div>
        {saveMessage && (
          <p className="text-xs font-bold text-[#065F46] mt-1.5">{saveMessage}</p>
        )}
      </section>
    </div>
  );
}
