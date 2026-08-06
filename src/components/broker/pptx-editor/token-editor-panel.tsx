'use client';

import { HexColorInput } from './hex-color-input';
import { PptxThemeTokens } from '@/domain/building/mobile-im/pptx/pptx-theme';

interface TokenEditorPanelProps {
  tokens: PptxThemeTokens;
  presetName: string;
  onTokenChange: (key: keyof PptxThemeTokens, value: string) => void;
  onPresetNameChange: (name: string) => void;
  onBasePresetChange: (presetId: string) => void;
  onSave: () => Promise<void>;
  onDownloadPreview: () => void;
  isSaving: boolean;
  logoUrl?: string;
  onLogoUpload?: (file: File) => void;
  onLogoRemove?: () => void;
}

const PRESETS = [
  { id: 'golden_institutional', label: '황금 기관' },
  { id: 'credeal_signature', label: 'CREDEAL 시그니처' },
  { id: 'executive_gold', label: '임원 골드' },
  { id: 'corporate_clean', label: '코퍼릿 클린' },
  { id: 'pro_dark_obsidian', label: '프로 다크' },
];

const FONTS = [
  { id: '맑은 고딕', label: '맑은 고딕 (기본)' },
  { id: 'Noto Sans KR', label: 'Noto Sans KR' },
  { id: 'Noto Serif KR', label: 'Noto Serif KR' },
  { id: '나눔스퀘어', label: '나눔스퀘어' },
  { id: '나눔고딕', label: '나눔고딕' },
];

export function TokenEditorPanel({
  tokens,
  presetName,
  onTokenChange,
  onPresetNameChange,
  onBasePresetChange,
  onSave,
  onDownloadPreview,
  isSaving,
  logoUrl,
  onLogoUpload,
  onLogoRemove,
}: TokenEditorPanelProps) {
  const containerStyle: React.CSSProperties = {
    width: 280,
    flexShrink: 0,
    background: '#0F1923',
    borderRight: '1px solid #1E2D3D',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    color: '#E7ECF2',
  };

  const sectionStyle: React.CSSProperties = {
    padding: '20px 16px',
    borderBottom: '1px solid #1E2D3D',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#D1D5DB',
    margin: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#1A2333',
    border: '1px solid #2D3748',
    borderRadius: 6,
    color: '#E7ECF2',
    fontSize: 13,
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    width: '100%',
  };

  return (
    <div style={containerStyle}>
      {/* Preset Name & Save */}
      <div style={sectionStyle}>
        <div>
          <label style={labelStyle}>프리셋 이름</label>
          <input
            type="text"
            value={presetName}
            onChange={(e) => onPresetNameChange(e.target.value)}
            style={inputStyle}
            placeholder="새 프리셋"
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onSave}
            disabled={isSaving}
            style={{ ...buttonStyle, background: '#10B981', color: '#fff', flex: 1 }}
          >
            {isSaving ? '저장 중...' : '저장하기'}
          </button>
          <button
            onClick={onDownloadPreview}
            style={{ ...buttonStyle, background: '#2D3748', color: '#fff', flex: 1 }}
          >
            미리보기 다운로드
          </button>
        </div>
      </div>

      {/* Base Preset Selector */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>기본 프리셋 (Base)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PRESETS.map(preset => (
            <label
              key={preset.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 6px',
                background: '#1A2333',
                border: '1px solid #2D3748',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              <input
                type="radio"
                name="basePreset"
                value={preset.id}
                onChange={() => onBasePresetChange(preset.id)}
              />
              {preset.label}
            </label>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>색상 (Colors)</h3>
        <HexColorInput
          label="메인 액센트"
          value={tokens.accent}
          onChange={(v) => onTokenChange('accent', v)}
        />
        <HexColorInput
          label="본문 잉크"
          value={tokens.ink}
          onChange={(v) => onTokenChange('ink', v)}
        />
        <HexColorInput
          label="배경"
          value={tokens.bg}
          onChange={(v) => onTokenChange('bg', v)}
        />
        <HexColorInput
          label="성공/상승"
          value={tokens.green}
          onChange={(v) => onTokenChange('green', v)}
        />
        <HexColorInput
          label="위험/하락"
          value={tokens.red}
          onChange={(v) => onTokenChange('red', v)}
        />
        <HexColorInput
          label="경고"
          value={tokens.amber}
          onChange={(v) => onTokenChange('amber', v)}
        />
      </div>

      {/* Typography */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>타이포그래피 및 텍스트</h3>
        <div>
          <label style={labelStyle}>한글 폰트</label>
          <select
            value={tokens.titleFont}
            onChange={(e) => onTokenChange('titleFont', e.target.value)}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          >
            {FONTS.map(font => (
              <option key={font.id} value={font.id}>{font.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>회사 이름</label>
          <input
            type="text"
            value={tokens.companyName}
            onChange={(e) => onTokenChange('companyName', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>태그라인</label>
          <input
            type="text"
            value={tokens.companyTagline}
            onChange={(e) => onTokenChange('companyTagline', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Logo Upload */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>로고 이미지</h3>
        {logoUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={logoUrl}
              alt="로고"
              style={{
                width: 80, height: 32,
                objectFit: 'contain',
                background: '#1A2333',
                borderRadius: 4,
                border: '1px solid #2D3748',
              }}
            />
            <button
              type="button"
              onClick={onLogoRemove}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                color: '#EF4444',
                background: 'transparent',
                border: '1px solid #EF444433',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              삭제
            </button>
          </div>
        ) : (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 0',
            border: '1px dashed #2D3748',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#6B7280',
            fontSize: 12,
          }}>
            + 로고 이미지 업로드 (PNG/SVG)
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onLogoUpload) onLogoUpload(file);
              }}
              style={{ display: 'none' }}
            />
          </label>
        )}
        <p style={{ fontSize: 10, color: '#4A5568', marginTop: 4 }}>
          카버 · 면책 슬라이드 좌상단/푸터에 로고 삽입
        </p>
      </div>
    </div>
  );
}
