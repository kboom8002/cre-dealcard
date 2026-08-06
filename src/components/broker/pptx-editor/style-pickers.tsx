'use client';

import { PptxThemeTokens } from '@/domain/building/mobile-im/pptx/pptx-theme';

type CoverStyle = PptxThemeTokens['coverStyle'];
type LayoutStyle = PptxThemeTokens['layoutStyle'];

interface CoverStylePickerProps {
  value: CoverStyle;
  onChange: (v: CoverStyle) => void;
  accentColor: string;
}

const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: 'institutional_masses', label: 'Institutional' },
  { id: 'split', label: 'Split' },
  { id: 'hero_dark', label: 'Hero Dark' },
  { id: 'corporate_card', label: 'Corp Card' },
  { id: 'obsidian_glow', label: 'Glow' },
];

export function CoverStylePicker({ value, onChange, accentColor }: CoverStylePickerProps) {
  const accentHex = `#${accentColor}`;

  const renderThumbnail = (id: CoverStyle) => {
    switch (id) {
      case 'institutional_masses':
        return (
          <svg width="96" height="54" viewBox="0 0 96 54" fill="none">
            <rect width="96" height="54" fill="#F8FAFC" />
            <rect x="50" y="10" width="40" height="34" fill="#1E293B" opacity="0.1" />
            <rect x="60" y="20" width="30" height="24" fill="#1E293B" />
            <rect x="8" y="20" width="30" height="4" fill={accentHex} />
            <rect x="8" y="28" width="20" height="2" fill="#94A3B8" />
          </svg>
        );
      case 'split':
        return (
          <svg width="96" height="54" viewBox="0 0 96 54" fill="none">
            <path d="M0 0H60L40 54H0V0Z" fill="#F1F5F9" />
            <path d="M60 0H96V54H40L60 0Z" fill="#0F172A" />
            <rect x="8" y="24" width="24" height="4" fill={accentHex} />
          </svg>
        );
      case 'hero_dark':
        return (
          <svg width="96" height="54" viewBox="0 0 96 54" fill="none">
            <rect width="96" height="54" fill="#0F172A" />
            <rect x="33" y="20" width="30" height="4" fill="#FFFFFF" />
            <rect x="38" y="28" width="20" height="2" fill={accentHex} />
          </svg>
        );
      case 'corporate_card':
        return (
          <svg width="96" height="54" viewBox="0 0 96 54" fill="none">
            <rect width="96" height="54" fill="#E2E8F0" />
            <rect x="16" y="8" width="64" height="38" rx="4" fill="#FFFFFF" />
            <rect x="24" y="20" width="30" height="4" fill={accentHex} />
          </svg>
        );
      case 'obsidian_glow':
        return (
          <svg width="96" height="54" viewBox="0 0 96 54" fill="none">
            <rect width="96" height="54" fill="#020617" />
            <circle cx="80" cy="10" r="20" fill={accentHex} opacity="0.3" filter="blur(4px)" />
            <rect x="16" y="24" width="40" height="4" fill="#FFFFFF" />
          </svg>
        );
    }
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: '#D1D5DB', marginBottom: 8 }}>표지 스타일 (Cover)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {COVER_STYLES.map(style => (
          <button
            key={style.id}
            onClick={() => onChange(style.id)}
            title={style.label}
            style={{
              padding: 0,
              background: 'transparent',
              border: value === style.id ? `2px solid ${accentHex}` : '2px solid transparent',
              borderRadius: 4,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {renderThumbnail(style.id)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface LayoutStylePickerProps {
  value: LayoutStyle;
  onChange: (v: LayoutStyle) => void;
  accentColor: string;
}

const LAYOUT_STYLES: { id: LayoutStyle; label: string }[] = [
  { id: 'classic', label: '클래식' },
  { id: 'modern', label: '모던' },
  { id: 'executive', label: '임원' },
  { id: 'minimal', label: '미니멀' },
  { id: 'dramatic', label: '드라마틱' },
];

export function LayoutStylePicker({ value, onChange, accentColor }: LayoutStylePickerProps) {
  const accentHex = `#${accentColor}`;

  const renderThumbnail = (id: LayoutStyle) => {
    switch (id) {
      case 'classic':
        return (
          <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
            <rect width="60" height="34" fill="#FFFFFF" />
            <circle cx="10" cy="10" r="2" fill={accentHex} />
            <rect x="16" y="9" width="30" height="2" fill="#333" />
          </svg>
        );
      case 'modern':
        return (
          <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
            <rect width="60" height="34" fill="#FFFFFF" />
            <rect x="6" y="6" width="2" height="8" fill={accentHex} />
            <rect x="12" y="9" width="30" height="2" fill="#333" />
            <rect x="6" y="16" width="48" height="1" fill="#E2E8F0" />
          </svg>
        );
      case 'executive':
        return (
          <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
            <rect width="60" height="34" fill="#FFFFFF" />
            <rect x="15" y="9" width="30" height="2" fill="#333" />
            <rect x="6" y="14" width="48" height="1" fill={accentHex} opacity="0.5" />
            <rect x="6" y="16" width="48" height="1" fill={accentHex} opacity="0.5" />
          </svg>
        );
      case 'minimal':
        return (
          <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
            <rect width="60" height="34" fill="#FFFFFF" />
            <rect x="6" y="10" width="24" height="2" fill="#333" />
          </svg>
        );
      case 'dramatic':
        return (
          <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
            <rect width="60" height="34" fill="#FFFFFF" />
            <rect width="60" height="16" fill="#0F172A" />
            <rect x="6" y="7" width="30" height="2" fill={accentHex} />
          </svg>
        );
    }
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: '#D1D5DB', marginBottom: 8 }}>레이아웃 스타일</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LAYOUT_STYLES.map(style => (
          <div key={style.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => onChange(style.id)}
              style={{
                padding: 0,
                background: 'transparent',
                border: value === style.id ? `2px solid ${accentHex}` : '2px solid #334155',
                borderRadius: 4,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {renderThumbnail(style.id)}
            </button>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{style.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
