'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { SlidePreviewSVG } from '@/components/broker/pptx-editor/slide-preview-svg';
import { TokenEditorPanel } from '@/components/broker/pptx-editor/token-editor-panel';
import { CoverStylePicker, LayoutStylePicker } from '@/components/broker/pptx-editor/style-pickers';
import { PPTX_PRESET_TEMPLATES, PptxThemeTokens, DEFAULT_PPTX_PRESET } from '@/domain/building/mobile-im/pptx/pptx-theme';

export default function PptxEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tokens, setTokens] = useState<PptxThemeTokens>(PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PPTX_PRESET);
  const [isSaving, setIsSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const handleTokenChange = (key: keyof PptxThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const handleBasePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (PPTX_PRESET_TEMPLATES[presetId]) {
      setTokens(PPTX_PRESET_TEMPLATES[presetId]);
    }
  };

  // G3: 올바른 필드명 + 인증 헤더 + 전체 토큰 전달
  const handleSave = async () => {
    if (!presetName.trim()) {
      alert('프리셋 이름을 입력하세요');
      return;
    }
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/broker/pptx-preset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          preset_name: presetName,
          tokens,
          cover_style: tokens.coverStyle,
          layout_style: tokens.layoutStyle,
          company_name: tokens.companyName,
          company_tagline: tokens.companyTagline,
          logo_url: logoUrl ?? null,
          base_preset_id: selectedPresetId,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        alert(`프리셋 "${presetName}" 저장 완료!`);
        // 저장된 UUID로 선택 업데이트
        if (result.preset?.id) setSelectedPresetId(result.preset.id);
      } else {
        const err = await res.json().catch(() => ({ error: '알 수 없는 오류' }));
        alert(`저장 실패: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('네트워크 오류 발생');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewDownload = () => {
    const presetParam = selectedPresetId !== DEFAULT_PPTX_PRESET ? `&preset=${selectedPresetId}` : '';
    window.open(`/api/public/im-lite/${id}/pptx?preview=true${presetParam}`, '_blank');
  };

  // G2: 로고 업로드 → Supabase Storage
  const handleLogoUpload = async (file: File) => {
    const ext = file.name.split('.').pop();
    const path = `pptx-logos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('broker-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) {
      alert('로고 업로드 실패: ' + error.message);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('broker-assets').getPublicUrl(path);
    setLogoUrl(publicUrl);
  };

  const handleLogoRemove = () => setLogoUrl(undefined);

  return (
    <div className="min-h-screen bg-[#0A1628] text-[#E7ECF2] flex flex-col font-sans">
      <header className="h-16 border-b border-slate-700/50 flex items-center px-6 bg-slate-900/50">
        <Link href={`/broker/deal-card/${id}`} className="text-slate-400 hover:text-white transition-colors mr-4">
          ← 딜카드로
        </Link>
        <h1 className="text-lg font-bold">PPTX 템플릿 에디터</h1>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* 좌: 토큰 에디터 사이드바 */}
        <div className="flex flex-col" style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1E2D3D' }}>
          <TokenEditorPanel
            tokens={tokens}
            presetName={presetName}
            onTokenChange={handleTokenChange}
            onPresetNameChange={setPresetName}
            onBasePresetChange={handleBasePresetChange}
            onSave={handleSave}
            onDownloadPreview={handlePreviewDownload}
            isSaving={isSaving}
            logoUrl={logoUrl}
            onLogoUpload={handleLogoUpload}
            onLogoRemove={handleLogoRemove}
          />
        </div>

        {/* 우: 프리뷰 영역 */}
        <div className="flex-1 overflow-auto p-8 flex flex-col items-center bg-slate-900/30">
          <div className="mb-4 text-sm text-amber-500/80 bg-amber-500/10 px-4 py-2 rounded-full flex items-center gap-2">
            <span>⚠</span> 미리보기는 SVG 렌더링에 의한 근사치이며, 실제 PPTX와 약간의 차이가 있을 수 있습니다
          </div>

          <SlidePreviewSVG tokens={tokens} width={960} />

          {/* G2: 표지/레이아웃 스타일 선택기 */}
          <div className="mt-8 w-full max-w-[960px] grid grid-cols-2 gap-6">
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <CoverStylePicker
                value={tokens.coverStyle}
                onChange={(v) => handleTokenChange('coverStyle', v)}
                accentColor={tokens.accent}
              />
            </div>
            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
              <LayoutStylePicker
                value={tokens.layoutStyle}
                onChange={(v) => handleTokenChange('layoutStyle', v)}
                accentColor={tokens.accent}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
