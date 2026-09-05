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
  customPresets?: any[];
}

export const CORE_PRIME_PRESETS = [
  {
    id: 'institutional_dark_gold',
    label: '🏛️ 기관투자자 프라임',
    desc: 'Dark / Gold · Cap Rate/NOI · WALE · 렌트롤',
    badge: 'Finance',
    alias: 'golden_institutional',
  },
  {
    id: 'institutional_slate',
    label: '🏛️ 기관투자자 슬레이트',
    desc: 'Slate / Champagne Gold · 오픈 프레임 · WALE · 고대비',
    badge: 'Institutional',
    alias: 'institutional_slate',
  },
  {
    id: 'corporate_clean_white',
    label: '🏢 기업 사옥용 모던',
    desc: 'Clean White · 사옥 브랜딩 · 취득원가 · TCO',
    badge: 'Corporate',
    alias: 'corporate_clean',
  },
  {
    id: 'commercial_visual_grid',
    label: '🏥 메디컬/근생형 비주얼',
    desc: 'Royal Blue · 층별 MD · 로드뷰 · 유동인구',
    badge: 'Retail/MD',
    alias: 'commercial_visual',
  },
  {
    id: 'development_technical_blueprint',
    label: '📐 개발부지형 테크니컬',
    desc: 'Deep Navy · 다필지 · 3단 투입비 · 규제 완화',
    badge: 'Dev/PF',
    alias: 'development_blueprint',
  },
];

export const ADDITIONAL_PRESETS = [
  { id: 'credeal_signature', label: 'CREDEAL 시그니처' },
  { id: 'executive_gold', label: '임원 골드' },
  { id: 'pro_dark_obsidian', label: '프로 다크' },
];

export const LAYOUT_STYLE_PRESETS = [
  { id: 'classic', label: '클래식 (Classic 라운드)' },
  { id: 'modern', label: '모던 (Modern 상단 액센트)' },
  { id: 'executive', label: '이그제큐티브 (Executive 보더)' },
  { id: 'minimal', label: '미니멀 (Minimal 여백)' },
  { id: 'dramatic', label: '드라마틱 (Dramatic 전폭 바)' },
  { id: 'open_frame', label: '오픈 프레임 (Open Frame 미니멀 라인)' },
];

export const FONT_PRESETS = [
  { id: 'Pretendard', label: 'Pretendard (현대적·표준)' },
  { id: '맑은 고딕', label: '맑은 고딕 (기본)' },
  { id: 'Noto Sans KR', label: 'Noto Sans KR (본고딕)' },
  { id: '나눔스퀘어', label: '나눔스퀘어 (가독성)' },
  { id: 'Noto Serif KR', label: 'Noto Serif KR (명조)' },
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
  customPresets = [],
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
    padding: '16px 14px',
    borderBottom: '1px solid #1E2D3D',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#D1D5DB',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: '#1A2333',
    border: '1px solid #2D3748',
    borderRadius: 6,
    color: '#E7ECF2',
    fontSize: 12,
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    width: '100%',
  };

  return (
    <div style={containerStyle}>
      {/* 4대 핵심 완성형 프라임 템플릿 선택기 */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>
          <span>4대 핵심 프라임 템플릿</span>
          <span style={{ fontSize: 10, color: '#10B981', fontWeight: 'bold' }}>SSoT Ready</span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CORE_PRIME_PRESETS.map(preset => {
            const isSelected = tokens.presetId === preset.id || (preset.alias && tokens.presetId === preset.alias);
            return (
              <div
                key={preset.id}
                onClick={() => onBasePresetChange(preset.id)}
                style={{
                  padding: '8px 10px',
                  background: isSelected ? '#1E3A8A25' : '#1A2333',
                  border: isSelected ? '1.5px solid #3B82F6' : '1px solid #2D3748',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#60A5FA' : '#E2E8F0' }}>
                    {preset.label}
                  </span>
                  <span style={{
                    fontSize: 9,
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: '#2D3748',
                    color: '#94A3B8',
                  }}>
                    {preset.badge}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#94A3B8' }}>{preset.desc}</span>
              </div>
            );
          })}
        </div>

        {/* 추가 내장 템플릿 토글 / 서브 그리드 */}
        <details style={{ marginTop: 2, fontSize: 11, color: '#94A3B8' }}>
          <summary style={{ cursor: 'pointer', padding: '4px 0', userSelect: 'none' }}>기타 내장 템플릿 (3종)</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
            {ADDITIONAL_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onBasePresetChange(preset.id)}
                style={{
                  padding: '6px',
                  background: tokens.presetId === preset.id ? '#374151' : '#1A2333',
                  border: '1px solid #2D3748',
                  borderRadius: 4,
                  color: '#CBD5E1',
                  fontSize: 10,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {/* 저장된 커스텀 프리셋 (재사용) */}
      {customPresets.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>
            <span>내 커스텀 프리셋</span>
            <span style={{ fontSize: 10, color: '#F59E0B' }}>{customPresets.length}개</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
            {customPresets.map((preset: any) => (
              <div
                key={preset.id}
                onClick={() => {
                  onPresetNameChange(preset.preset_name);
                  if (preset.base_preset_id) onBasePresetChange(preset.base_preset_id);
                  if (preset.tokens) {
                    Object.entries(preset.tokens).forEach(([k, v]) => {
                      onTokenChange(k as keyof PptxThemeTokens, v as string);
                    });
                  }
                }}
                style={{
                  padding: '6px 8px',
                  background: '#1A2333',
                  border: '1px solid #2D3748',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ⭐ {preset.preset_name}
                </span>
                <span style={{ fontSize: 9, color: '#64748B' }}>
                  {preset.company_name || '사용자'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 브로커 커스텀 빌더 (이름 지정 & 저장) */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>브로커 프리셋 빌더</h3>
        <div>
          <label style={labelStyle}>커스텀 프리셋 이름</label>
          <input
            type="text"
            value={presetName}
            onChange={(e) => onPresetNameChange(e.target.value)}
            style={inputStyle}
            placeholder="예: 삼경파트너스 골드 프리셋"
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onSave}
            disabled={isSaving}
            style={{ ...buttonStyle, background: '#10B981', color: '#fff', flex: 1 }}
          >
            {isSaving ? '저장 중...' : '프리셋 영구 저장'}
          </button>
          <button
            onClick={onDownloadPreview}
            style={{ ...buttonStyle, background: '#2D3748', color: '#fff', flex: 1 }}
          >
            미리보기 다운로드
          </button>
        </div>
      </div>

      {/* Colors (색상 커스터마이징) */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>브랜드 컬러 커스텀</h3>
        <HexColorInput
          label="메인 액센트 (Primary Accent)"
          value={tokens.accent}
          onChange={(v) => onTokenChange('accent', v)}
        />
        <HexColorInput
          label="본문 잉크 (Text Ink)"
          value={tokens.ink}
          onChange={(v) => onTokenChange('ink', v)}
        />
        <HexColorInput
          label="슬라이드 배경 (Background)"
          value={tokens.bg}
          onChange={(v) => onTokenChange('bg', v)}
        />
        <HexColorInput
          label="성공/상승 (Green Indicator)"
          value={tokens.green}
          onChange={(v) => onTokenChange('green', v)}
        />
        <HexColorInput
          label="위험/하락 (Red Warning)"
          value={tokens.red}
          onChange={(v) => onTokenChange('red', v)}
        />
        <HexColorInput
          label="경고/주의 (Amber Alert)"
          value={tokens.amber}
          onChange={(v) => onTokenChange('amber', v)}
        />
      </div>

      {/* Typography & Fonts */}
      <div style={sectionStyle}>
        <h3 style={headingStyle}>폰트 및 회사 정보</h3>
        <div>
          <label style={labelStyle}>제목 및 본문 폰트 세트</label>
          <select
            value={tokens.titleFont}
            onChange={(e) => {
              onTokenChange('titleFont', e.target.value);
              onTokenChange('bodyFont', e.target.value);
            }}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          >
            {FONT_PRESETS.map(font => (
              <option key={font.id} value={font.id}>{font.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>레이아웃 스타일</label>
          <select
            value={tokens.layoutStyle || 'classic'}
            onChange={(e) => onTokenChange('layoutStyle', e.target.value)}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          >
            {LAYOUT_STYLE_PRESETS.map(style => (
              <option key={style.id} value={style.id}>{style.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>중개법인 / 회사명</label>
          <input
            type="text"
            value={tokens.companyName}
            onChange={(e) => onTokenChange('companyName', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>회사 태그라인 / 슬로건</label>
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
