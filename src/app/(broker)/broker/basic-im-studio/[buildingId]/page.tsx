'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { SlideNavigator } from './components/SlideNavigator';
import { SlideEditor, type RightPanelTab } from './components/SlideEditor';
import { SlidePreview } from './components/SlidePreview';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useStudioHistory, useUndoRedoShortcuts } from '@/stores/studio-edit-store';
import type { PptxProject, PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { QuickRemedyPopover } from '@/components/help/QuickRemedyPopover';
import { SeniorTermTooltip } from '@/components/help/SeniorTermTooltip';

function BasicImStudioInner({
  buildingId,
  initialPresetParam,
}: {
  buildingId: string;
  initialPresetParam?: string | null;
}) {
  const router = useRouter();
  const {
    presetId,
    tokens,
    brandAccent,
    coverStyle,
    layoutStyle,
    headerFooterConfig,
    hydrateFromProject,
  } = useTheme();

  const [project, setProject] = useState<PptxProject | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rightTab, setRightTab] = useState<RightPanelTab>('content');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQualityPopover, setShowQualityPopover] = useState(false);

  const {
    slides,
    hydrateSlides,
    commitSlideChange,
    undo,
    redo,
    canUndo,
    canRedo,
    dirtySlideIds,
    clearDirty,
  } = useStudioHistory([]);

  useUndoRedoShortcuts({
    onUndo: () => {
      const restored = undo();
      if (restored) toast.info('↩ 이전 편집 상태로 되돌렸습니다.');
    },
    onRedo: () => {
      const restored = redo();
      if (restored) toast.info('↪ 편집을 다시 적용했습니다.');
    },
    enabled: !loading,
  });

  // Initialize or load existing Basic IM Studio project
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/broker/basic-im-studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingId,
            preset: initialPresetParam || undefined,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.ok && data.project) {
          const proj: PptxProject = data.project;
          setProject(proj);
          hydrateSlides(proj.slides || []);
          hydrateFromProject({
            visualPreset: initialPresetParam || proj.visualPreset || 'credeal_basic',
            brandAccent: proj.brandAccent,
            coverStyle: proj.coverStyle,
            layoutStyle: proj.layoutStyle,
            headerFooter: proj.headerFooter,
          });
        } else if (!cancelled) {
          toast.error(data.error || 'Basic IM 스튜디오 로드에 실패했습니다.');
        }
      } catch {
        if (!cancelled) toast.error('네트워크 오류가 발생했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildingId, initialPresetParam, hydrateSlides, hydrateFromProject]);

  const currentSlide: PptxSlide | undefined = slides[selectedIndex] || slides[0];

  // Field change handler (pushes to 50-step Undo/Redo stack & updates live 16:9 preview immediately)
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      if (!currentSlide) return;
      commitSlideChange(
        prev =>
          prev.map(s => {
            if (s.id !== currentSlide.id) return s;
            const nextOverrides = { ...(s.slideOverrides || {}), [key]: value };
            return {
              ...s,
              title: key === 'title' && typeof value === 'string' ? value : s.title,
              kicker: key === 'kicker' && typeof value === 'string' ? value : s.kicker,
              slideOverrides: nextOverrides,
            };
          }),
        `${currentSlide.title || '슬라이드'} · ${key} 수정`,
        currentSlide.id
      );
    },
    [currentSlide, commitSlideChange]
  );

  // Save a single slide to backend
  const handleSaveSlide = useCallback(
    async (targetSlide?: PptxSlide) => {
      const slideToSave = targetSlide || currentSlide;
      if (!project || !slideToSave) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'override',
            slideId: slideToSave.id,
            overrides: {
              ...slideToSave.slideOverrides,
              title: slideToSave.title,
              kicker: slideToSave.kicker,
              layoutType: slideToSave.layoutType,
            },
          }),
        });
        const data = await res.json();
        if (data.ok && data.project) {
          setProject(data.project);
          clearDirty(slideToSave.id);
          toast.success(`✓ [${slideToSave.title}] 슬라이드가 저장되었습니다.`);
        } else {
          toast.error(data.error || '저장에 실패했습니다.');
        }
      } catch {
        toast.error('저장 중 네트워크 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
    },
    [project, currentSlide, clearDirty]
  );

  // Save all dirty slides before download or when clicking "전체 저장"
  const flushAllDirtySlides = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    try {
      for (const s of slides) {
        if (dirtySlideIds.has(s.id)) {
          await fetch(`/api/broker/basic-im-studio/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'override',
              slideId: s.id,
              overrides: {
                ...s.slideOverrides,
                title: s.title,
                kicker: s.kicker,
                layoutType: s.layoutType,
              },
            }),
          });
        }
      }
      clearDirty();
    } finally {
      setSaving(false);
    }
  }, [project, slides, dirtySlideIds, clearDirty]);

  // Toggle slide visibility (👁️/🚫)
  const handleToggleVisibility = useCallback(
    async (slideId: string, nextHidden: boolean) => {
      if (!project) return;
      commitSlideChange(
        prev => prev.map(s => (s.id === slideId ? { ...s, hidden: nextHidden } : s)),
        nextHidden ? '슬라이드 숨김' : '슬라이드 표시'
      );
      try {
        const res = await fetch(`/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'toggle',
            slideId,
            hidden: nextHidden,
          }),
        });
        const data = await res.json();
        if (data.ok && data.project) {
          setProject(data.project);
          toast.success(nextHidden ? '슬라이드가 다운로드에서 제외되었습니다.' : '슬라이드가 다운로드에 포함됩니다.');
        }
      } catch {
        toast.error('표시 상태 변경에 실패했습니다.');
      }
    },
    [project, commitSlideChange]
  );

  // Reorder slides (▲/▼ or Drag & Drop)
  const handleReorderSlides = useCallback(
    async (orderedSlideIds: string[]) => {
      if (!project) return;
      commitSlideChange(prev => {
        const map = new Map(prev.map(s => [s.id, s]));
        return orderedSlideIds
          .map((id, idx) => {
            const item = map.get(id);
            return item ? { ...item, slideIndex: idx + 1 } : null;
          })
          .filter((s): s is PptxSlide => s !== null);
      }, '슬라이드 순서 변경');

      try {
        const res = await fetch(`/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reorder',
            orderedSlideIds,
          }),
        });
        const data = await res.json();
        if (data.ok && data.project) {
          setProject(data.project);
        }
      } catch {
        toast.error('슬라이드 순서 저장에 실패했습니다.');
      }
    },
    [project, commitSlideChange]
  );

  // Switch compatible layout/archetype
  const handleLayoutChange = useCallback(
    async (layoutType: string) => {
      if (!project || !currentSlide) return;
      commitSlideChange(
        prev => prev.map(s => (s.id === currentSlide.id ? { ...s, layoutType } : s)),
        '슬라이드 레이아웃 변경',
        currentSlide.id
      );
      try {
        await fetch(`/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'layout',
            slideIndex: currentSlide.slideIndex,
            layoutType,
          }),
        });
        toast.success('슬라이드 레이아웃이 변경되었습니다.');
      } catch {
        // Non-blocking
      }
    },
    [project, currentSlide, commitSlideChange]
  );

  // Reset slide to initial extracted SSOT defaults
  const handleResetSlide = useCallback(async () => {
    if (!project || !currentSlide) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/broker/basic-im-studio/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          slideId: currentSlide.id,
        }),
      });
      const data = await res.json();
      if (data.ok && data.project) {
        setProject(data.project);
        hydrateSlides(data.project.slides);
        toast.success('이 슬라이드를 공부·초기 추출값으로 복원했습니다.');
      }
    } catch {
      toast.error('초기값 복원에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [project, currentSlide, hydrateSlides]);

  // Download edited PPTX binary
  const handleDownload = useCallback(async () => {
    if (!project) return;
    setDownloading(true);
    try {
      if (dirtySlideIds.size > 0) {
        await flushAllDirtySlides();
      }
      const qs = new URLSearchParams({
        visualPreset: presetId,
        coverStyle,
        layoutStyle,
      });
      if (brandAccent) qs.set('brandAccent', brandAccent);
      if (headerFooterConfig) qs.set('headerFooter', JSON.stringify(headerFooterConfig));

      const res = await fetch(`/api/broker/basic-im-studio/${project.id}/download?${qs.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'PPTX 생성에 실패했습니다.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title || 'Basic_IM'}_편집본.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('📥 편집 내용과 테마가 반영된 PPTX 다운로드가 완료되었습니다!');
    } catch (err: any) {
      toast.error(err.message || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  }, [project, dirtySlideIds.size, flushAllDirtySlides, presetId, coverStyle, layoutStyle, brandAccent, headerFooterConfig]);

  // Keyboard shortcuts: Ctrl+S (save), Alt+ArrowUp/Down/Left/Right (slide nav), Escape (exit fullscreen / close popover)
  useEffect(() => {
    if (loading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirtySlideIds.size > 0) {
          void flushAllDirtySlides().then(() => {
            toast.success('💾 모든 슬라이드 변경사항이 저장되었습니다.');
          });
        } else {
          void handleSaveSlide();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        if (showQualityPopover) setShowQualityPopover(false);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
        e.preventDefault();
        setSelectedIndex(i => Math.min(slides.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    loading,
    dirtySlideIds.size,
    flushAllDirtySlides,
    handleSaveSlide,
    isFullscreen,
    showQualityPopover,
    slides.length,
  ]);

  // Warn before accidentally closing browser tab when there are unsaved slide edits
  useEffect(() => {
    if (dirtySlideIds.size === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySlideIds.size]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC] text-[#0F172A]">
        <div className="text-center space-y-2">
          <div className="text-2xl animate-spin">⏳</div>
          <p className="text-sm font-extrabold text-[#0F172A]">
            건물 공부 제원 · 렌트롤 · 입지 데이터를 16:9 슬라이드로 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  if (!project || !currentSlide) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <p className="text-sm font-bold text-[#B91C1C]">프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 5-Point IM Quality Readiness Check
  const findSlideIndexByKey = (keys: string[], fallbackIdx: number) => {
    const idx = slides.findIndex(s => keys.includes(s.dataKey || ''));
    return idx >= 0 ? idx : Math.min(fallbackIdx, Math.max(0, slides.length - 1));
  };
  const coverIdx = findSlideIndexByKey(['cover'], 0);
  const overviewIdx = findSlideIndexByKey(['overview', 'building'], 2);
  const locationIdx = findSlideIndexByKey(['location'], 3);
  const landIdx = findSlideIndexByKey(['land'], 4);
  const rentrollIdx = findSlideIndexByKey(['rentroll', 'rentRoll'], 5);
  const galleryIdx = findSlideIndexByKey(['gallery'], 8);

  const covOv = (slides[coverIdx]?.slideOverrides || {}) as Record<string, any>;
  const ovOv = (slides[overviewIdx]?.slideOverrides || {}) as Record<string, any>;
  const locOv = (slides[locationIdx]?.slideOverrides || {}) as Record<string, any>;
  const landOv = (slides[landIdx]?.slideOverrides || {}) as Record<string, any>;
  const rrOv = (slides[rentrollIdx]?.slideOverrides || {}) as Record<string, any>;
  const galOv = (slides[galleryIdx]?.slideOverrides || {}) as Record<string, any>;

  const qualityChecks = [
    {
      id: 'cover',
      label: '표지·매매희망가',
      passed: Boolean((covOv.title || slides[coverIdx]?.title) && covOv.askingPrice),
      targetIdx: coverIdx,
    },
    {
      id: 'overview',
      label: '건축물 공부 제원',
      passed: Boolean(ovOv.landArea && ovOv.grossArea),
      targetIdx: overviewIdx,
    },
    {
      id: 'location_land',
      label: '입지·토지 공법',
      passed: Boolean(locOv.transitInfo && landOv.zoningInfo),
      targetIdx: !locOv.transitInfo ? locationIdx : landIdx,
    },
    {
      id: 'rentroll',
      label: '렌트롤·임대수익',
      passed: Boolean(
        rrOv.depositTotal ||
          rrOv.monthlyRentTotal ||
          (Array.isArray(rrOv.tenantData) && rrOv.tenantData.length > 0) ||
          (Array.isArray(project.buildingContext?.floor_leases) && project.buildingContext.floor_leases.length > 0)
      ),
      targetIdx: rentrollIdx,
    },
    {
      id: 'gallery',
      label: '현장 실사 사진',
      passed: Boolean(
        (Array.isArray(galOv.photos) &&
          galOv.photos.some((p: any) =>
            typeof p === 'string' ? Boolean(p) : p?.included !== false && p?.excluded !== true && Boolean(p?.url)
          )) ||
          (Array.isArray(project.buildingContext?.photos_v2) && project.buildingContext.photos_v2.length > 0) ||
          (Array.isArray(project.buildingContext?.photos) && project.buildingContext.photos.length > 0)
      ),
      targetIdx: galleryIdx,
    },
  ];
  const passedCount = qualityChecks.filter(c => c.passed).length;

  return (
    <div className="flex flex-col h-screen bg-[#F1F5F9] text-[#0F172A]">
      {/* Top Studio Header Bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#CBD5E1] bg-white shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0] transition-colors shrink-0"
          >
            ← 돌아가기
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-[#0F172A] truncate">
                📐 {project.title} 편집 스튜디오
              </h1>
              <button
                type="button"
                onClick={() => setRightTab('theme')}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:border-[#1D4ED8]"
                title="클릭하여 프리셋·테마 변경"
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/20"
                  style={{ backgroundColor: `#${tokens.accent}` }}
                />
                <span>테마: {tokens.presetName}</span>
              </button>
              <SeniorTermTooltip
                termKey="모노 고대비"
                buttonLabel="🖨️ 흑백 인쇄·팩스 팁"
                actionLabel="🎨 테마 탭에서 모노 고대비 고르기"
                onAction={() => setRightTab('theme')}
              />
            </div>
          </div>
        </div>

        {/* Right Toolbar: IM Quality Check / Quick Remedy / Undo / Redo / Save / Download */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Live IM Quality Readiness Checklist Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQualityPopover(v => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors flex items-center gap-1.5 ${
                passedCount === 5
                  ? 'bg-[#ECFDF5] text-[#065F46] border-[#6EE7B7] hover:bg-[#D1FAE5]'
                  : 'bg-[#FFFBEB] text-[#92400E] border-[#FCD34D] hover:bg-[#FEF3C7]'
              }`}
              title="클릭하여 5대 IM 품질 점검 항목 확인 및 바로 이동"
            >
              <span>{passedCount === 5 ? `✅ IM 품질 ${passedCount}/5` : `⚡ IM 점검 ${passedCount}/5`}</span>
            </button>
            {showQualityPopover && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-[#CBD5E1] bg-white shadow-xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E2E8F0]">
                  <span className="text-xs font-black text-[#0F172A]">
                    📋 Basic IM 5대 핵심 품질 점검 ({passedCount}/5)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQualityPopover(false)}
                    className="text-xs font-bold text-[#64748B] hover:text-[#0F172A]"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5">
                  {qualityChecks.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedIndex(item.targetIdx);
                        setRightTab('content');
                        setShowQualityPopover(false);
                      }}
                      className="w-full px-2.5 py-2 rounded-xl border border-[#E2E8F0] hover:border-[#1D4ED8] hover:bg-[#F8FAFC] flex items-center justify-between text-left transition-all"
                    >
                      <span className="text-xs font-extrabold text-[#0F172A]">{item.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          item.passed
                            ? 'bg-[#DCFCE7] text-[#166534]'
                            : 'bg-[#FEF3C7] text-[#92400E]'
                        }`}
                      >
                        {item.passed ? '✓ 완료' : '⚠️ 확인 필요'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-[#E2E8F0] text-[10px] font-medium text-[#475569]">
                  💡 항목을 클릭하면 해당 슬라이드 편집 화면으로 즉시 이동합니다. (단축키: Ctrl+S 저장, Alt+↑/↓ 이동)
                </div>
              </div>
            )}
          </div>

          <QuickRemedyPopover
            onOpenThemeTab={() => setRightTab('theme')}
            onOpenContentTab={() => setRightTab('content')}
          />
          <div className="flex items-center rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-0.5">
            <button
              type="button"
              onClick={() => undo()}
              disabled={!canUndo}
              className="px-2.5 py-1.5 text-xs font-bold text-[#0F172A] hover:bg-white rounded-lg disabled:opacity-35 transition-all"
              title="실행 취소 (Ctrl+Z)"
            >
              ↩ 실행취소
            </button>
            <button
              type="button"
              onClick={() => redo()}
              disabled={!canRedo}
              className="px-2.5 py-1.5 text-xs font-bold text-[#0F172A] hover:bg-white rounded-lg disabled:opacity-35 transition-all"
              title="다시 실행 (Ctrl+Shift+Z)"
            >
              ↪ 다시실행
            </button>
          </div>

          {dirtySlideIds.size > 0 && (
            <button
              type="button"
              onClick={flushAllDirtySlides}
              disabled={saving}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B] hover:bg-[#FDE68A] transition-colors"
            >
              💾 변경사항 전체 저장 ({dirtySlideIds.size}면)
            </button>
          )}

          <button
            type="button"
            data-testid="studio-download-pptx-btn"
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-xl text-xs sm:text-sm font-black transition-all disabled:opacity-50 shadow-sm flex items-center gap-1.5"
          >
            <span>{downloading ? '⏳ PPTX 빌드 중...' : '📥 편집 반영 PPTX 다운로드'}</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: 10-Slide Navigator (Reorder + Show/Hide) */}
        <SlideNavigator
          slides={slides}
          selectedIndex={selectedIndex}
          dirtySlideIds={dirtySlideIds}
          onSelect={setSelectedIndex}
          onToggleVisibility={handleToggleVisibility}
          onReorder={handleReorderSlides}
        />

        {/* Center: Live 16:9 Slide Preview Canvas with Inline Click-to-Edit */}
        <main className="flex-1 flex items-center justify-center p-6 bg-[#E2E8F0]/60 overflow-auto">
          <SlidePreview
            slide={currentSlide}
            totalSlides={slides.length}
            visibleSlideNumber={selectedIndex + 1}
            buildingContext={project.buildingContext}
            onInlineChange={handleFieldChange}
            onTitleChange={t => handleFieldChange('title', t)}
            onKickerChange={k => handleFieldChange('kicker', k)}
            onPrevSlide={
              selectedIndex > 0 ? () => setSelectedIndex(i => Math.max(0, i - 1)) : undefined
            }
            onNextSlide={
              selectedIndex < slides.length - 1
                ? () => setSelectedIndex(i => Math.min(slides.length - 1, i + 1))
                : undefined
            }
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(f => !f)}
          />
        </main>

        {/* Right: 3-Tab Slide Content / Preset Gallery / Header-Footer Editor */}
        <SlideEditor
          projectId={project.id}
          slide={currentSlide}
          activeTab={rightTab}
          onTabChange={setRightTab}
          onChange={handleFieldChange}
          onLayoutChange={handleLayoutChange}
          onSave={() => handleSaveSlide(currentSlide)}
          onResetSlide={handleResetSlide}
          saving={saving}
        />
      </div>

      {/* Fullscreen Presentation Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-8">
          <SlidePreview
            slide={currentSlide}
            totalSlides={slides.length}
            visibleSlideNumber={selectedIndex + 1}
            buildingContext={project.buildingContext}
            onInlineChange={handleFieldChange}
            onTitleChange={t => handleFieldChange('title', t)}
            onKickerChange={k => handleFieldChange('kicker', k)}
            onPrevSlide={
              selectedIndex > 0 ? () => setSelectedIndex(i => Math.max(0, i - 1)) : undefined
            }
            onNextSlide={
              selectedIndex < slides.length - 1
                ? () => setSelectedIndex(i => Math.min(slides.length - 1, i + 1))
                : undefined
            }
            isFullscreen={true}
            onToggleFullscreen={() => setIsFullscreen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default function BasicImStudioPage({
  params,
}: {
  params: Promise<{ buildingId: string }>;
}) {
  const { buildingId } = use(params);
  const searchParams = useSearchParams();
  const initialPresetParam = searchParams.get('preset');

  const handleThemePersist = useCallback(
    async (patch: Record<string, any>) => {
      try {
        await fetch(`/api/broker/basic-im-studio/${buildingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'theme',
            themePatch: patch,
          }),
        });
      } catch {
        // Non-blocking theme persistence
      }
    },
    [buildingId]
  );

  return (
    <ThemeProvider
      initialPresetId={initialPresetParam || 'credeal_basic'}
      onThemeChange={handleThemePersist}
    >
      <BasicImStudioInner buildingId={buildingId} initialPresetParam={initialPresetParam} />
    </ThemeProvider>
  );
}
