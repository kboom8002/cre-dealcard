'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import { SlidePreviewSVG, BuildingPreviewData } from '@/components/broker/pptx-editor/slide-preview-svg';
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
  const [buildingData, setBuildingData] = useState<BuildingPreviewData | undefined>(undefined);
  const [realBuildingId, setRealBuildingId] = useState<string | undefined>(undefined);
  const [customPresets, setCustomPresets] = useState<any[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    async function fetchBuilding() {
      try {
        const res = await fetch(`/api/broker/deal-card/${id}`);
        if (res.ok) {
          const json = await res.json();
          const b = json.data?.building || json.building;
          if (b) {
            setRealBuildingId(b.id);
            setBuildingData({
              title: json.data?.title || b.area_signal ? `${b.area_signal} 상업용 자산` : undefined,
              subtitle: `${b.area_signal || ''} | ${b.asset_type || ''} | ${b.price_band || ''}`,
              price: b.price_band,
              area: b.size_signal,
              vacancy: b.vacancy_signal,
              leadSentence: b.fit_summary,
            });
          }
        }
      } catch {
        // Fallback to sample data
      }
    }
    fetchBuilding();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabaseClient = createClient();
        const { data } = await supabaseClient
          .from('pptx_presets')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setCustomPresets(data);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const handleTokenChange = (key: keyof PptxThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const handleBasePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (PPTX_PRESET_TEMPLATES[presetId]) {
      setTokens(PPTX_PRESET_TEMPLATES[presetId]);
    }
  };

  const handleSave = async () => {
    if (!presetName.trim()) {
      toast.error('프리셋 이름을 입력하세요.');
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
        toast.success(`프리셋 "${presetName}" 저장 완료!`);
        if (result.preset?.id) setSelectedPresetId(result.preset.id);
      } else {
        const err = await res.json().catch(() => ({ error: '알 수 없는 오류' }));
        toast.error(`저장 실패: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      toast.error('네트워크 오류 발생');
    } finally {
      setIsSaving(false);
    }
  };

  // PX-1: 라이브 토큰을 쿼리 파라미터로 직접 전달
  const handlePreviewDownload = () => {
    const params = new URLSearchParams({
      preview: 'true',
      preset: selectedPresetId,
      accent: tokens.accent,
      ink: tokens.ink,
      bg: tokens.bg,
      coverStyle: tokens.coverStyle,
      layoutStyle: tokens.layoutStyle,
      bodyFont: tokens.bodyFont,
    }).toString();
    const bId = realBuildingId ?? id;  // buildingId 우선, dealId fallback
    window.open(`/api/public/im-lite/${bId}/pptx?${params}`, '_blank');
  };

  const handleLogoUpload = async (file: File) => {
    const ext = file.name.split('.').pop();
    const { data: { user } } = await supabase.auth.getUser();
    const path = `pptx-logos/${user?.id ?? 'anon'}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('broker-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) {
      toast.error('로고 업로드 실패: ' + error.message);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('broker-assets').getPublicUrl(path);
    setLogoUrl(publicUrl);
    toast.success('로고 업로드 완료');
  };

  const handleLogoRemove = () => setLogoUrl(undefined);

  return (
    <div className="min-h-screen bg-[#0A1628] text-[#E7ECF2] flex flex-col font-sans">
      <header className="h-16 border-b border-slate-700/50 flex items-center px-6 bg-slate-900/50">
        <Link href={`/broker/deal-card/${id}`} className="text-slate-400 hover:text-white transition-colors mr-4">
          ← IM 관리로
        </Link>
        <h1 className="text-lg font-bold">PPTX 템플릿 에디터</h1>
        <span className="ml-auto text-sm text-amber-400/80">
          현재: {tokens.presetName || selectedPresetId}
        </span>
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
            customPresets={customPresets}
          />
        </div>

        {/* 우: 프리뷰 영역 */}
        <div className="flex-1 overflow-auto p-8 flex flex-col items-center bg-slate-900/30">
          <div className="mb-4 text-sm text-amber-500/80 bg-amber-500/10 px-4 py-2 rounded-full flex items-center gap-2">
            <span>⚠</span> 미리보기는 SVG 렌더링에 의한 근사치이며, 실제 PPTX와 약간의 차이가 있을 수 있습니다
          </div>

          <SlidePreviewSVG tokens={tokens} width={960} buildingData={buildingData} />

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
