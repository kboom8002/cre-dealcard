'use client';

import React, { useState } from 'react';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { useTheme } from '@/contexts/ThemeContext';

const SLIDE_META: Record<string, { label: string; icon: string; badge: string }> = {
  cover: { label: '표지 (Cover)', icon: '📘', badge: '필수' },
  highlights: { label: '투자 핵심 요약', icon: '⚡', badge: '핵심' },
  summary: { label: '투자 핵심 요약', icon: '⚡', badge: '핵심' },
  overview: { label: '물건 개요 · 건축물 제원', icon: '🏢', badge: '공부' },
  building: { label: '물건 개요 · 건축물 제원', icon: '🏢', badge: '공부' },
  location: { label: '입지 · 교통 · 상권 분석', icon: '🚇', badge: '지도' },
  land: { label: '토지이용계획 · 공법 규제', icon: '🗺️', badge: '지적도' },
  rentroll: { label: '렌트롤 · 스태킹 플랜', icon: '📋', badge: '임대차' },
  rentRoll: { label: '렌트롤 · 스태킹 플랜', icon: '📋', badge: '임대차' },
  yield: { label: '투자수익률 · 공시지가', icon: '📈', badge: '재무' },
  yieldFormula: { label: '투자수익률 · 공시지가', icon: '📈', badge: '재무' },
  comps: { label: '인근 매매 시세 비교', icon: '⚖️', badge: '선택' },
  brokerComps: { label: '인근 매매 시세 비교', icon: '⚖️', badge: '선택' },
  gallery: { label: '현장 실사 사진 갤러리', icon: '📷', badge: '사진' },
  closing: { label: '매입절차 · 문의 · 면책', icon: '🤝', badge: '필수' },
};

interface SlideNavigatorProps {
  slides: PptxSlide[];
  selectedIndex: number;
  dirtySlideIds?: Set<string>;
  onSelect: (index: number) => void;
  onToggleVisibility?: (slideId: string, nextHidden: boolean) => void;
  onReorder?: (orderedSlideIds: string[]) => void;
}

export function SlideNavigator({
  slides,
  selectedIndex,
  dirtySlideIds,
  onSelect,
  onToggleVisibility,
  onReorder,
}: SlideNavigatorProps) {
  const { tokens } = useTheme();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const visibleCount = slides.filter(s => !s.hidden).length;

  const isLockedSlide = (slide: PptxSlide) =>
    slide.dataKey === 'cover' || slide.dataKey === 'closing';

  const moveSlide = (fromIdx: number, direction: -1 | 1) => {
    if (!onReorder) return;
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= slides.length) return;
    if (isLockedSlide(slides[fromIdx]) || isLockedSlide(slides[toIdx])) return;

    const next = [...slides];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next.map(s => s.id));
    onSelect(toIdx);
  };

  return (
    <aside
      data-testid="studio-slide-navigator"
      className="w-72 border-r border-[#CBD5E1] bg-white overflow-y-auto shrink-0 flex flex-col"
    >
      {/* Header Summary */}
      <div className="p-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0F172A]">
            📑 슬라이드 구성 ({visibleCount}/{slides.length}면)
          </h3>
          <p className="text-sm font-medium text-[#475569] mt-0.5">
            순서 이동(▲▼) 및 포함/제외(👁️) 가능
          </p>
        </div>
      </div>

      {/* Slide Cards List */}
      <div className="p-2.5 space-y-1.5 flex-1">
        {slides.map((slide, idx) => {
          const isSelected = idx === selectedIndex;
          const isLocked = isLockedSlide(slide);
          const isDirty = dirtySlideIds?.has(slide.id);
          const meta = SLIDE_META[slide.dataKey || ''] || {
            label: slide.title || `슬라이드 ${idx + 1}`,
            icon: '📄',
            badge: '본문',
          };

          return (
            <div
              key={slide.id}
              draggable={!isLocked && Boolean(onReorder)}
              onDragStart={() => {
                if (!isLocked) setDraggedIdx(idx);
              }}
              onDragOver={e => {
                if (!isLocked && draggedIdx !== null && draggedIdx !== idx) {
                  e.preventDefault();
                }
              }}
              onDrop={e => {
                e.preventDefault();
                if (
                  draggedIdx === null ||
                  draggedIdx === idx ||
                  isLocked ||
                  isLockedSlide(slides[draggedIdx]) ||
                  !onReorder
                ) {
                  setDraggedIdx(null);
                  return;
                }
                const next = [...slides];
                const [moved] = next.splice(draggedIdx, 1);
                next.splice(idx, 0, moved);
                setDraggedIdx(null);
                onReorder(next.map(s => s.id));
                onSelect(idx);
              }}
              className={`group rounded-xl border p-2.5 min-h-[44px] transition-all select-none ${
                isSelected
                  ? 'border-[#1D4ED8] bg-[#EFF6FF] shadow-xs ring-2 ring-[#1D4ED8]/15'
                  : slide.hidden
                  ? 'border-[#E2E8F0] bg-[#F8FAFC] opacity-60 hover:opacity-90'
                  : 'border-[#CBD5E1] bg-white hover:border-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(idx)}
                  aria-current={isSelected ? 'true' : undefined}
                  className="flex items-center gap-2 min-w-0 flex-1 min-h-[44px] text-left cursor-pointer"
                >
                  <span
                    className="w-7 h-7 rounded-lg font-mono text-sm font-extrabold flex items-center justify-center shrink-0"
                    style={
                      isSelected
                        ? { backgroundColor: '#1D4ED8', color: '#FFFFFF' }
                        : slide.hidden
                        ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                        : { backgroundColor: `#${tokens.ink}`, color: '#FFFFFF' }
                    }
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-extrabold text-[#0F172A] truncate">
                        {meta.icon} {slide.title || meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-sm font-bold text-[#475569]">
                        {meta.label}
                      </span>
                      {isDirty && (
                        <span className="px-1.5 py-0.5 rounded text-sm font-extrabold bg-[#FEF3C7] text-[#92400E]">
                          편집중
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Right Controls: Visibility Toggle + Reorder */}
                <div className="flex items-center gap-1 shrink-0">
                  {isLocked ? (
                    <span
                      className="px-2 py-1 rounded text-sm font-bold bg-[#E2E8F0] text-[#334155]"
                      title="표지와 마감 슬라이드는 필수 포함 면입니다"
                    >
                      🔒 필수
                    </span>
                  ) : (
                    <>
                      {onReorder && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveSlide(idx, -1)}
                            disabled={idx <= 1}
                            aria-label={`${slide.title || meta.label} 위로 이동`}
                            className="min-h-[44px] min-w-[44px] px-2 text-sm font-bold rounded-lg border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                            title="위로 이동"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSlide(idx, 1)}
                            disabled={idx >= slides.length - 2}
                            aria-label={`${slide.title || meta.label} 아래로 이동`}
                            className="min-h-[44px] min-w-[44px] px-2 text-sm font-bold rounded-lg border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-30 cursor-pointer"
                            title="아래로 이동"
                          >
                            ▼
                          </button>
                        </div>
                      )}
                      {onToggleVisibility && (
                        <button
                          type="button"
                          onClick={() => onToggleVisibility(slide.id, !slide.hidden)}
                          aria-pressed={!slide.hidden}
                          className={`min-h-[44px] px-3 py-1 rounded-lg text-sm font-extrabold border transition-colors cursor-pointer ${
                            slide.hidden
                              ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                              : 'border-[#A7F3D0] bg-[#D1FAE5] text-[#065F46]'
                          }`}
                          title={slide.hidden ? '클릭하여 PPTX 다운로드에 포함' : '클릭하여 PPTX 다운로드에서 제외'}
                        >
                          {slide.hidden ? '제외됨' : '포함'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
