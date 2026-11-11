'use client';

import React, { useEffect, useState, useCallback, useRef, use } from 'react';
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
  project,
  setProject,
}: {
  buildingId: string;
  initialPresetParam?: string | null;
  project: PptxProject | null;
  setProject: React.Dispatch<React.SetStateAction<PptxProject | null>>;
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

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rightTab, setRightTab] = useState<RightPanelTab>('content');
  const [mobileStudioPane, setMobileStudioPane] = useState<'slides' | 'canvas' | 'inspector'>('canvas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [navigatingBack, setNavigatingBack] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQualityPopover, setShowQualityPopover] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

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

  const slidesRef = useRef<PptxSlide[]>(slides);
  slidesRef.current = slides;
  const dirtySlideIdsRef = useRef<Set<string>>(dirtySlideIds);
  dirtySlideIdsRef.current = dirtySlideIds;
  const projectRef = useRef<PptxProject | null>(project);
  projectRef.current = project;

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

  // Save all dirty slides before download, navigation back, or when clicking "전체 저장"
  const flushAllDirtySlides = useCallback(async () => {
    const activeProject = projectRef.current;
    const latestSlides = slidesRef.current;
    const latestDirtyIds = dirtySlideIdsRef.current;
    if (!activeProject || latestDirtyIds.size === 0) return;
    setSaving(true);
    try {
      let currentLockVersion = activeProject.lockVersion;
      for (const s of latestSlides) {
        if (latestDirtyIds.has(s.id)) {
          const res = await fetch(`/api/broker/basic-im-studio/${activeProject.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'override',
              slideId: s.id,
              lockVersion: currentLockVersion,
              overrides: {
                ...s.slideOverrides,
                title: s.title,
                kicker: s.kicker,
                layoutType: s.layoutType,
              },
            }),
          });
          if (!res.ok) throw new Error('Save failed');
          const json = await res.json();
          if (json?.project?.lockVersion != null) {
            currentLockVersion = json.project.lockVersion;
            setProject((prev) =>
              prev
                ? { ...prev, ...json.project, lockVersion: json.project.lockVersion }
                : json.project
            );
          }
        }
      }
      clearDirty();
    } finally {
      setSaving(false);
    }
  }, [setProject, clearDirty]);

  const handleNavigateBack = useCallback(async () => {
    if (navigatingBack) return;
    setNavigatingBack(true);
    try {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      await Promise.resolve();
      if (dirtySlideIdsRef.current.size > 0) {
        await flushAllDirtySlides().catch(() => {
          // Non-fatal so user is never trapped if network fails
        });
      }
    } finally {
      router.push(`/broker/w/im?buildingId=${encodeURIComponent(buildingId)}`);
    }
  }, [navigatingBack, flushAllDirtySlides, router, buildingId]);

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

  // Keyboard shortcuts: Ctrl+S (save), Alt+ArrowUp/Down/Left/Right (slide nav), ? (shortcut help), Escape (exit fullscreen / close modal & popover)
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
        if (showShortcutHelp) {
          e.preventDefault();
          setShowShortcutHelp(false);
          return;
        }
        if (showQualityPopover) {
          e.preventDefault();
          setShowQualityPopover(false);
          return;
        }
        if (isFullscreen) {
          e.preventDefault();
          setIsFullscreen(false);
          return;
        }
        if (typeof document !== 'undefined') {
          const remedyDialog = document.querySelector('[aria-label="고객 수정 요청 30초 해결 처방전"]');
          if (remedyDialog && remedyDialog.parentElement) {
            e.preventDefault();
            remedyDialog.parentElement.click();
          }
        }
        return;
      }
      if (
        e.key === '?' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)
        )
      ) {
        e.preventDefault();
        setShowShortcutHelp(v => !v);
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
    showShortcutHelp,
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
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-[#CBD5E1] bg-white shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            data-testid="studio-back-btn"
            disabled={navigatingBack}
            onClick={() => void handleNavigateBack()}
            className="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0] disabled:opacity-50 transition-colors shrink-0"
          >
            {navigatingBack ? '저장 후 이동 중…' : '← 돌아가기'}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-[#0F172A] break-keep">
                📐 {project.title}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setRightTab('theme');
                  setMobileStudioPane('inspector');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:border-[#1D4ED8] shrink-0"
                title="클릭하여 프리셋·테마 변경"
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/20"
                  style={{ backgroundColor: `#${tokens.accent}` }}
                />
                <span>테마: {tokens.presetName}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Toolbar: IM Quality Check / Quick Remedy / Shortcut Help / Undo / Redo / Save / Download */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                        setMobileStudioPane('inspector');
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
            onOpenThemeTab={() => {
              setRightTab('theme');
              setMobileStudioPane('inspector');
            }}
            onOpenContentTab={() => {
              setRightTab('content');
              setMobileStudioPane('inspector');
            }}
          />

          <button
            type="button"
            data-testid="studio-shortcut-help-btn"
            onClick={() => setShowShortcutHelp(true)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] hover:bg-[#E2E8F0] transition-colors shrink-0"
            title="키보드 단축키 도움말 (?)"
          >
            ⌨️ 단축키
          </button>

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

      {/* Responsive Sub-<1024px Pane Switcher (prevents crushing center 16:9 canvas) */}
      <div
        data-testid="studio-mobile-pane-tabs"
        className="flex lg:hidden items-center gap-1.5 px-3 py-2 bg-white border-b border-[#CBD5E1] shrink-0"
      >
        <button
          type="button"
          onClick={() => setMobileStudioPane('slides')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold border transition-colors ${
            mobileStudioPane === 'slides'
              ? 'bg-[#0F172A] text-white border-[#0F172A]'
              : 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]'
          }`}
        >
          📑 슬라이드 목록 ({slides.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileStudioPane('canvas')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold border transition-colors ${
            mobileStudioPane === 'canvas'
              ? 'bg-[#0F172A] text-white border-[#0F172A]'
              : 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]'
          }`}
        >
          🖼️ 미리보기 ({selectedIndex + 1}/{slides.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileStudioPane('inspector')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold border transition-colors ${
            mobileStudioPane === 'inspector'
              ? 'bg-[#0F172A] text-white border-[#0F172A]'
              : 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]'
          }`}
        >
          📝 항목·테마 편집{dirtySlideIds.size > 0 ? ` (${dirtySlideIds.size})` : ''}
        </button>
      </div>

      {/* Main 3-Column Studio Workspace (responsive tab collapse below lg <1024px) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: 10-Slide Navigator (Reorder + Show/Hide) */}
        <div
          className={`${
            mobileStudioPane === 'slides' ? 'flex flex-1 justify-center bg-white' : 'hidden'
          } lg:flex lg:flex-none h-full overflow-hidden`}
        >
          <SlideNavigator
            slides={slides}
            selectedIndex={selectedIndex}
            dirtySlideIds={dirtySlideIds}
            onSelect={(idx) => {
              setSelectedIndex(idx);
              setMobileStudioPane('canvas');
            }}
            onToggleVisibility={handleToggleVisibility}
            onReorder={handleReorderSlides}
          />
        </div>

        {/* Center: Live 16:9 Slide Preview Canvas with Inline Click-to-Edit */}
        <main
          className={`${
            mobileStudioPane === 'canvas' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 items-center justify-center p-3 sm:p-6 bg-[#E2E8F0]/60 overflow-auto`}
        >
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
        <div
          className={`${
            mobileStudioPane === 'inspector' ? 'flex flex-1 justify-center bg-white' : 'hidden'
          } lg:flex lg:flex-none h-full overflow-hidden`}
        >
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
      </div>

      {/* Keyboard Shortcut Help Modal */}
      {showShortcutHelp && (
        <div
          data-testid="studio-shortcut-help-modal"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowShortcutHelp(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="단축키 도움말"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#CBD5E1] bg-white text-[#0F172A] shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h2 className="text-base font-black text-[#0F172A]">⌨️ 슬라이드 편집 단축키 도움말</h2>
              <button
                type="button"
                data-testid="studio-shortcut-help-close-btn"
                onClick={() => setShowShortcutHelp(false)}
                className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-xs font-extrabold text-[#0F172A]"
              >
                ✕ 닫기 (Esc)
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="font-semibold text-[#334155]">변경사항 저장</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-bold">Ctrl + S</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="font-semibold text-[#334155]">실행 취소 / 다시 실행</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-bold">Ctrl + Z / Ctrl + Shift + Z</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="font-semibold text-[#334155]">이전 · 다음 슬라이드 이동</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-bold">Alt + ↑ / ↓</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold text-[#334155]">전체화면 · 창 닫기</span>
                <kbd className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-bold">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

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
  const [project, setProject] = useState<PptxProject | null>(null);

  const handleThemePersist = useCallback(
    async (patch: Record<string, any>) => {
      try {
        const targetId = project?.id || buildingId;
        const res = await fetch(`/api/broker/basic-im-studio/${targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'theme',
            themePatch: patch,
            lockVersion: project?.lockVersion,
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json?.project?.lockVersion != null) {
            setProject((prev) =>
              prev ? { ...prev, lockVersion: json.project.lockVersion } : json.project
            );
          }
        }
      } catch {
        // Non-blocking theme persistence
      }
    },
    [project?.id, project?.lockVersion, buildingId]
  );

  return (
    <ThemeProvider
      initialPresetId={initialPresetParam || 'credeal_basic'}
      onThemeChange={handleThemePersist}
    >
      <BasicImStudioInner
        buildingId={buildingId}
        initialPresetParam={initialPresetParam}
        project={project}
        setProject={setProject}
      />
    </ThemeProvider>
  );
}
