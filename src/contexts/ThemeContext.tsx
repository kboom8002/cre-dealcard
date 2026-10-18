'use client';

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import {
  PPTX_PRESET_TEMPLATES,
  PRIME_TEMPLATE_ALIASES,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import { deriveBrandSkin } from '@/domain/building/mobile-im/pptx/brand-skin';
import {
  DEFAULT_HEADER_FOOTER,
  type HeaderFooterConfig,
} from '@/domain/building/mobile-im/pptx/header-footer';

export interface StudioPresetOption {
  id: string;
  label: string;
  desc: string;
  tier: 'basic' | 'pro' | 'custom';
  badge?: string;
  tokens: PptxThemeTokens;
}

export const STUDIO_BUILTIN_PRESETS: StudioPresetOption[] = [
  {
    id: 'credeal_basic',
    label: '표준 네이비 & 골드',
    desc: '기관급 표준 매각 IM (네이비·브래스 골드)',
    tier: 'basic',
    badge: '기본 추천',
    tokens: PPTX_PRESET_TEMPLATES.credeal_basic,
  },
  {
    id: 'corporate_clean',
    label: '코퍼레이트 에메랄드',
    desc: '신뢰감 있는 딥 그린 & 화이트 (사옥·오피스)',
    tier: 'basic',
    badge: '사옥 인기',
    tokens: PPTX_PRESET_TEMPLATES.corporate_clean,
  },
  {
    id: 'minimal_clean',
    label: '미니멀 슬레이트 블루',
    desc: '단정하고 절제된 차콜 & 스틸 블루',
    tier: 'basic',
    tokens: PPTX_PRESET_TEMPLATES.minimal_clean,
  },
  {
    id: 'warm_beige',
    label: '웜 베이지 & 브라운',
    desc: '따뜻하고 안정적인 테라코타 브라운 (근생·상가주택)',
    tier: 'basic',
    tokens: PPTX_PRESET_TEMPLATES.warm_beige,
  },
  {
    id: 'wine_burgundy',
    label: '와인 버건디 프라임',
    desc: '품격 있는 딥 버건디 & 로즈골드 (강남권 꼬마빌딩)',
    tier: 'basic',
    tokens: PPTX_PRESET_TEMPLATES.wine_burgundy,
  },
  {
    id: 'mono_contrast',
    label: '모노 고대비 (인쇄용)',
    desc: '흑백 출력·팩스·서면 브리핑 최적화 고대비',
    tier: 'basic',
    badge: '인쇄 최적',
    tokens: PPTX_PRESET_TEMPLATES.mono_contrast,
  },
  {
    id: 'golden_institutional',
    label: '기관투자자 프라임 골드',
    desc: '다크 네이비 매스 & 클래식 골드',
    tier: 'pro',
    tokens: PPTX_PRESET_TEMPLATES.institutional_dark_gold,
  },
  {
    id: 'commercial_visual_grid',
    label: '커머셜 로열 블루',
    desc: '메디컬·리테일 빌딩용 선명한 로열 블루',
    tier: 'pro',
    tokens: PPTX_PRESET_TEMPLATES.commercial_visual_grid,
  },
  {
    id: 'executive_gold',
    label: '이그제큐티브 미드나잇',
    desc: '프리미엄 딥 네이비 & 샴페인 골드',
    tier: 'pro',
    tokens: PPTX_PRESET_TEMPLATES.executive_gold,
  },
  {
    id: 'pro_dark_obsidian',
    label: '옵시디언 사이언',
    desc: '모던 테크·신축 개발부지용 시안 액센트',
    tier: 'pro',
    tokens: PPTX_PRESET_TEMPLATES.pro_dark_obsidian,
  },
];

interface ThemeContextValue {
  presetId: string;
  tokens: PptxThemeTokens;
  brandAccent: string;
  coverStyle: PptxThemeTokens['coverStyle'];
  layoutStyle: PptxThemeTokens['layoutStyle'];
  headerFooterConfig: HeaderFooterConfig;
  presets: StudioPresetOption[];
  setPreset: (presetId: string) => void;
  setBrandAccent: (hex: string) => void;
  setCoverStyle: (style: PptxThemeTokens['coverStyle']) => void;
  setLayoutStyle: (style: PptxThemeTokens['layoutStyle']) => void;
  setHeaderFooterConfig: (patch: Partial<HeaderFooterConfig>) => void;
  hydrateFromProject: (project: {
    visualPreset?: string;
    brandAccent?: string;
    coverStyle?: PptxThemeTokens['coverStyle'];
    layoutStyle?: PptxThemeTokens['layoutStyle'];
    headerFooter?: HeaderFooterConfig;
  }) => void;
  saveCustomPreset: (name: string) => Promise<boolean>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPresetId = 'credeal_basic',
  onThemeChange,
}: {
  children: React.ReactNode;
  initialPresetId?: string;
  onThemeChange?: (patch: {
    visualPreset?: string;
    brandAccent?: string;
    coverStyle?: PptxThemeTokens['coverStyle'];
    layoutStyle?: PptxThemeTokens['layoutStyle'];
    headerFooter?: Partial<HeaderFooterConfig>;
  }) => void;
}) {
  const [presetId, setPresetIdState] = useState<string>(initialPresetId);
  const [brandAccent, setBrandAccentState] = useState<string>('');
  const [coverStyle, setCoverStyleState] = useState<PptxThemeTokens['coverStyle']>('institutional_masses');
  const [layoutStyle, setLayoutStyleState] = useState<PptxThemeTokens['layoutStyle']>('classic');
  const [headerFooterConfig, setHeaderFooterState] = useState<HeaderFooterConfig>(DEFAULT_HEADER_FOOTER);
  const [customPresets, setCustomPresets] = useState<StudioPresetOption[]>([]);

  // Load user's saved custom presets from /api/broker/pptx-preset if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/broker/pptx-preset');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.presets)) {
          const mapped: StudioPresetOption[] = data.presets.map((p: any) => ({
            id: p.id,
            label: p.name || '내 커스텀 프리셋',
            desc: p.company_name ? `${p.company_name} 전용 테마` : '사용자 정의 브랜드 테마',
            tier: 'custom' as const,
            badge: p.is_company_default ? '회사 기본' : '커스텀',
            tokens: {
              ...PPTX_PRESET_TEMPLATES.credeal_basic,
              ...(p.tokens || {}),
              presetId: p.id,
              presetName: p.name || '커스텀',
              coverStyle: p.cover_style || 'institutional_masses',
              layoutStyle: p.layout_style || 'classic',
              companyName: p.company_name || DEFAULT_HEADER_FOOTER.companyName,
              companyTagline: p.company_tagline || DEFAULT_HEADER_FOOTER.companyTagline,
            },
          }));
          setCustomPresets(mapped);
        }
      } catch {
        // Non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const presets = useMemo(
    () => [...STUDIO_BUILTIN_PRESETS, ...customPresets],
    [customPresets]
  );

  const tokens = useMemo<PptxThemeTokens>(() => {
    const customMatch = customPresets.find(p => p.id === presetId);
    const aliasId = PRIME_TEMPLATE_ALIASES[presetId] || presetId;
    const baseTpl =
      customMatch?.tokens ||
      PPTX_PRESET_TEMPLATES[presetId] ||
      PPTX_PRESET_TEMPLATES[aliasId] ||
      PPTX_PRESET_TEMPLATES.credeal_basic;

    let merged: PptxThemeTokens = {
      ...baseTpl,
      coverStyle: coverStyle || baseTpl.coverStyle,
      layoutStyle: layoutStyle || baseTpl.layoutStyle,
      companyName: headerFooterConfig.companyName || baseTpl.companyName,
      companyTagline: headerFooterConfig.companyTagline || baseTpl.companyTagline,
      logoUrl: headerFooterConfig.logoUrl || baseTpl.logoUrl,
    };

    if (brandAccent) {
      const derived = deriveBrandSkin(brandAccent);
      if (derived) {
        merged = {
          ...merged,
          ...derived.palette,
        };
      }
    }

    return merged;
  }, [presetId, customPresets, brandAccent, coverStyle, layoutStyle, headerFooterConfig]);

  const setPreset = useCallback(
    (nextId: string) => {
      setPresetIdState(nextId);
      setBrandAccentState('');
      const match = presets.find(p => p.id === nextId);
      const nextCover = match?.tokens.coverStyle ?? 'institutional_masses';
      const nextLayout = match?.tokens.layoutStyle ?? 'classic';
      setCoverStyleState(nextCover);
      setLayoutStyleState(nextLayout);
      onThemeChange?.({
        visualPreset: nextId,
        brandAccent: '',
        coverStyle: nextCover,
        layoutStyle: nextLayout,
      });
    },
    [presets, onThemeChange]
  );

  const setBrandAccent = useCallback(
    (hex: string) => {
      setBrandAccentState(hex);
      onThemeChange?.({ brandAccent: hex });
    },
    [onThemeChange]
  );

  const setCoverStyle = useCallback(
    (style: PptxThemeTokens['coverStyle']) => {
      setCoverStyleState(style);
      onThemeChange?.({ coverStyle: style });
    },
    [onThemeChange]
  );

  const setLayoutStyle = useCallback(
    (style: PptxThemeTokens['layoutStyle']) => {
      setLayoutStyleState(style);
      onThemeChange?.({ layoutStyle: style });
    },
    [onThemeChange]
  );

  const setHeaderFooterConfig = useCallback(
    (patch: Partial<HeaderFooterConfig>) => {
      setHeaderFooterState(prev => {
        const next = { ...prev, ...patch };
        return next;
      });
      onThemeChange?.({ headerFooter: patch });
    },
    [onThemeChange]
  );

  const hydrateFromProject = useCallback(
    (project: {
      visualPreset?: string;
      brandAccent?: string;
      coverStyle?: PptxThemeTokens['coverStyle'];
      layoutStyle?: PptxThemeTokens['layoutStyle'];
      headerFooter?: HeaderFooterConfig;
    }) => {
      if (project.visualPreset) setPresetIdState(project.visualPreset);
      if (project.brandAccent !== undefined) setBrandAccentState(project.brandAccent);
      if (project.coverStyle) setCoverStyleState(project.coverStyle);
      if (project.layoutStyle) setLayoutStyleState(project.layoutStyle);
      if (project.headerFooter) {
        setHeaderFooterState(prev => ({ ...prev, ...project.headerFooter }));
      }
    },
    []
  );

  const saveCustomPreset = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/broker/pptx-preset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || '내 브랜드 프리셋',
            tokens,
            cover_style: coverStyle,
            layout_style: layoutStyle,
            company_name: headerFooterConfig.companyName,
            company_tagline: headerFooterConfig.companyTagline,
            logo_url: headerFooterConfig.logoUrl,
            is_company_default: true,
          }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data?.preset) {
          const p = data.preset;
          const newOpt: StudioPresetOption = {
            id: p.id,
            label: p.name || name,
            desc: `${headerFooterConfig.companyName} 브랜드 프리셋`,
            tier: 'custom',
            badge: '회사 기본',
            tokens: { ...tokens, presetId: p.id, presetName: p.name || name },
          };
          setCustomPresets(prev => [newOpt, ...prev]);
          return true;
        }
        return true;
      } catch {
        return false;
      }
    },
    [tokens, coverStyle, layoutStyle, headerFooterConfig]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      presetId,
      tokens,
      brandAccent,
      coverStyle,
      layoutStyle,
      headerFooterConfig,
      presets,
      setPreset,
      setBrandAccent,
      setCoverStyle,
      setLayoutStyle,
      setHeaderFooterConfig,
      hydrateFromProject,
      saveCustomPreset,
    }),
    [
      presetId,
      tokens,
      brandAccent,
      coverStyle,
      layoutStyle,
      headerFooterConfig,
      presets,
      setPreset,
      setBrandAccent,
      setCoverStyle,
      setLayoutStyle,
      setHeaderFooterConfig,
      hydrateFromProject,
      saveCustomPreset,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
