'use client';

import { useState, use, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import { SlidePreviewSVG, BuildingPreviewData } from '@/components/broker/pptx-editor/slide-preview-svg';
import { TokenEditorPanel } from '@/components/broker/pptx-editor/token-editor-panel';
import { CoverStylePicker, LayoutStylePicker } from '@/components/broker/pptx-editor/style-pickers';
import { SlideDeckList } from '@/components/broker/pptx-editor/slide-deck-list';
import { StudioApprovalBar } from '@/components/broker/pptx-editor/studio-approval-bar';
import { PPTX_PRESET_TEMPLATES, PptxThemeTokens, DEFAULT_PPTX_PRESET, getPptxTheme } from '@/domain/building/mobile-im/pptx/pptx-theme';
import type { PptxProject, PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { useDealcardRealtimeSync } from '@/platform/im-pipeline/realtime/use-dealcard-realtime-sync';


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

  // Studio Interactive Deck & 2-Stage Approval state
  const [project, setProject] = useState<PptxProject | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [isEditorialLoading, setIsEditorialLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // 1. Fetch Building Data
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
              title: json.data?.title || (b.area_signal ? `${b.area_signal} 상업용 자산` : undefined),
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

  // 2. Fetch or Initialize Studio Project
  useEffect(() => {
    async function initProject() {
      try {
        const getRes = await fetch(`/api/broker/pptx-studio/projects/${id}`);
        if (getRes.ok) {
          const json = await getRes.json();
          if (json.project) {
            setProject(json.project);
            return;
          }
        }

        // Initialize new project for deal card if not found
        const postRes = await fetch('/api/broker/pptx-studio/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealId: id,
            title: buildingData?.title || 'CRE 투자설명서 (IM)',
            themeId: selectedPresetId,
          }),
        });

        if (postRes.ok) {
          const json = await postRes.json();
          if (json.project) {
            setProject(json.project);
          }
        }
      } catch (err) {
        console.warn('Failed to load/init studio project, initializing local fallback:', err);
      }
    }

    initProject();
  }, [id, buildingData?.title, selectedPresetId]);

  useDealcardRealtimeSync(realBuildingId || id, {
    onContentMutated: async () => {
      try {
        const res = await fetch(`/api/broker/pptx-studio/projects/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.project) setProject(json.project);
        }
      } catch (err) {
        console.warn('Realtime refresh failed:', err);
      }
    },
    onApprovalChanged: (payload) => {
      if (payload.stage) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                stage: payload.stage as any,
                artifactFileHash: payload.targetHash || prev.artifactFileHash,
              }
            : null
        );
      }
    },
  });

  // 3. Fetch Custom Presets

  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await fetch('/api/broker/pptx-preset?include_builtin=true');
        if (res.ok) {
          const json = await res.json();
          const presets = [
            ...(json.my_presets || []),
            ...(json.company_presets || []),
          ];
          setCustomPresets(presets);
          return;
        }
      } catch (e) {
        console.warn('API preset fetch failed, falling back to direct table query:', e);
      }

      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabaseClient = createClient();
        const { data } = await supabaseClient
          .from('pptx_custom_presets')
          .select('*')
          .order('created_at', { ascending: false });
        if (data) setCustomPresets(data);
      } catch (e) {
        console.error('Failed to load custom presets from Supabase:', e);
      }
    }
    loadPresets();
  }, []);

  const handleTokenChange = (key: keyof PptxThemeTokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const handleBasePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const theme = getPptxTheme(presetId);
    if (theme) {
      setTokens(theme);
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
        if (result.preset?.id) {
          setSelectedPresetId(result.preset.id);
          setCustomPresets((prev) => [result.preset, ...prev]);
        }
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
    const bId = realBuildingId ?? id;
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

  // Deck Sequence Reorder Handler
  const handleReorderSlides = async (reorderedSlideIds: string[]) => {
    if (!project) return;
    const slideMap = new Map(project.slides.map((s) => [s.id, s]));
    const newSlides: PptxSlide[] = [];

    for (const sid of reorderedSlideIds) {
      const s = slideMap.get(sid);
      if (s) newSlides.push(s);
    }
    newSlides.forEach((s, idx) => {
      s.slideIndex = idx + 1;
    });

    setProject({
      ...project,
      slides: newSlides,
      lockVersion: project.lockVersion + 1,
    });

    try {
      await fetch(`/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          slideIds: reorderedSlideIds,
          expectedLockVersion: project.lockVersion,
        }),
      });
      toast.success('슬라이드 순서가 업데이트되었습니다.');
    } catch (e) {
      console.warn('Reorder API sync failed:', e);
    }
  };

  // Slide Visibility Toggle Handler
  const handleToggleVisibility = async (slideId: string) => {
    if (!project) return;
    const targetSlide = project.slides.find((s) => s.id === slideId);
    const newHidden = !targetSlide?.hidden;

    const newSlides = project.slides.map((s) =>
      s.id === slideId ? { ...s, hidden: newHidden } : s
    );

    setProject({
      ...project,
      slides: newSlides,
      lockVersion: project.lockVersion + 1,
    });

    try {
      await fetch(`/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_visibility',
          slideId,
          hidden: newHidden,
          expectedLockVersion: project.lockVersion,
        }),
      });
      toast.info(newHidden ? '슬라이드가 숨김 처리되었습니다.' : '슬라이드가 다시 표시됩니다.');
    } catch (e) {
      console.warn('Visibility API sync failed:', e);
    }
  };

  // Inline Slide Overrides Change Handler
  const handleSlideOverrideChange = useCallback(
    async (overrides: Record<string, unknown>) => {
      if (!project) return;
      const currentSlide = project.slides[activeSlideIndex];
      if (!currentSlide) return;

      const updatedSlide: PptxSlide = {
        ...currentSlide,
        slideOverrides: { ...currentSlide.slideOverrides, ...overrides },
        title: typeof overrides.title === 'string' ? overrides.title : currentSlide.title,
        kicker: typeof overrides.kicker === 'string' ? overrides.kicker : currentSlide.kicker,
      };

      const newSlides = [...project.slides];
      newSlides[activeSlideIndex] = updatedSlide;

      setProject({
        ...project,
        slides: newSlides,
      });

      // Background persist to server
      try {
        await fetch(`/api/broker/pptx-studio/projects/${project.id}/slides`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'patch_overrides',
            slideId: currentSlide.id,
            overrides,
          }),
        });
      } catch (err) {
        console.warn('Background override persist failed:', err);
      }
    },
    [project, activeSlideIndex]
  );

  // Stage 1: Editorial Approval (S60)
  const handleApproveEditorial = async () => {
    if (!project) return;
    setIsEditorialLoading(true);
    try {
      const res = await fetch(`/api/broker/pptx-studio/projects/${project.id}/approve-editorial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                stage: 'S60_EDITORIAL_APPROVAL',
                editorialApprovedBy: data.editorialApprovedBy || '브로커',
                editorialApprovedAt: data.editorialApprovedAt || new Date().toISOString(),
              }
            : null
        );
        toast.success('1단계: 슬라이드 편집 승인(S60)이 완료되었습니다.');
      } else {
        toast.error(`편집 승인 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      toast.error(`네트워크 오류: ${err.message}`);
    } finally {
      setIsEditorialLoading(false);
    }
  };

  // Stage 2: File Binary Approval (S70)
  const handleApproveFile = async () => {
    if (!project) return;
    setIsFileLoading(true);
    try {
      const res = await fetch(`/api/broker/pptx-studio/projects/${project.id}/approve-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                stage: 'S70_FILE_APPROVAL',
                fileApprovedBy: data.fileApprovedBy || '브로커',
                fileApprovedAt: data.fileApprovedAt || new Date().toISOString(),
                artifactFileHash: data.artifactFileHash,
              }
            : null
        );
        toast.success('2단계: PPTX 바이너리 해시 승인(S70) 완료! 공식 발행되었습니다.');
      } else {
        toast.error(`파일 승인 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      toast.error(`네트워크 오류: ${err.message}`);
    } finally {
      setIsFileLoading(false);
    }
  };

  // Official PPTX Download Handler
  const handleDownloadOfficial = () => {
    if (!project) return;
    window.open(`/api/broker/pptx-studio/projects/${project.id}/download`, '_blank');
  };

  const activeSlide = project?.slides[activeSlideIndex];

  return (
    <div className="min-h-screen bg-[#0A1628] text-[#E7ECF2] flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 border-b border-slate-700/50 flex items-center px-6 bg-slate-900/80">
        <Link
          href={`/broker/deal-card/${id}`}
          className="text-slate-400 hover:text-white transition-colors mr-4 text-sm font-medium"
        >
          ← IM 관리로
        </Link>
        <h1 className="text-base font-bold text-white">PPTX 템플릿 에디터</h1>
        <span className="ml-auto text-xs text-amber-400/90 font-medium">
          템플릿: {tokens.presetName || selectedPresetId}
        </span>
      </header>

      {/* Sticky 2-Stage Sequential Approval Bar */}
      <StudioApprovalBar
        projectId={project?.id || id}
        stage={project?.stage || 'S40_PREVIEW'}
        editorialApprovedBy={project?.editorialApprovedBy}
        editorialApprovedAt={project?.editorialApprovedAt}
        fileApprovedBy={project?.fileApprovedBy}
        fileApprovedAt={project?.fileApprovedAt}
        artifactFileHash={project?.artifactFileHash}
        onApproveEditorial={handleApproveEditorial}
        onApproveFile={handleApproveFile}
        onDownloadOfficial={handleDownloadOfficial}
        onDownloadDraftPreview={handlePreviewDownload}
        isEditorialLoading={isEditorialLoading}
        isFileLoading={isFileLoading}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Token & Preset Editor Sidebar */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1E2D3D' }}
        >
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

        {/* Center: Canvas Preview & Style Selectors */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center bg-slate-900/30">
          <div className="mb-3 text-xs text-amber-500/90 bg-amber-500/10 px-4 py-1.5 rounded-full flex items-center gap-2">
            <span>⚡</span> 실시간 SVG 렌더링 엔진: 템플릿/컬러/폰트 및 문안 수정이 100ms 이내 실시간 화면에 반영됩니다
          </div>

          <SlidePreviewSVG
            tokens={tokens}
            width={960}
            buildingData={buildingData}
            activeSlide={activeSlide}
            onOverrideChange={handleSlideOverrideChange}
            isInlineEditable={true}
          />

          {/* Cover & Layout Style Pickers */}
          <div className="mt-6 w-full max-w-[960px] grid grid-cols-2 gap-6">
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

      {/* Bottom: Multi-Slide Deck Sequence Thumbnail Strip */}
      {project && project.slides && project.slides.length > 0 && (
        <SlideDeckList
          slides={project.slides}
          activeSlideIndex={activeSlideIndex}
          onSelectSlide={setActiveSlideIndex}
          onReorder={handleReorderSlides}
          onToggleVisibility={handleToggleVisibility}
        />
      )}
    </div>
  );
}
