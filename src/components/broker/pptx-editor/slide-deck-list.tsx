'use client';

import React, { useState } from 'react';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';

interface SlideDeckListProps {
  slides: PptxSlide[];
  activeSlideIndex: number;
  onSelectSlide: (index: number) => void;
  onReorder: (reorderedSlideIds: string[]) => void;
  onToggleVisibility: (slideId: string) => void;
  className?: string;
}

export function SlideDeckList({
  slides,
  activeSlideIndex,
  onSelectSlide,
  onReorder,
  onToggleVisibility,
  className = '',
}: SlideDeckListProps) {
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [dragOverSlideId, setDragOverSlideId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedSlideId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragOverSlideId) {
      setDragOverSlideId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedSlideId;
    setDraggedSlideId(null);
    setDragOverSlideId(null);

    if (!sourceId || sourceId === targetId) return;

    const sourceIndex = slides.findIndex((s) => s.id === sourceId);
    const targetIndex = slides.findIndex((s) => s.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const newSlides = [...slides];
    const [moved] = newSlides.splice(sourceIndex, 1);
    newSlides.splice(targetIndex, 0, moved);

    onReorder(newSlides.map((s) => s.id));
  };

  const handleMove = (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const newSlides = [...slides];
    const [moved] = newSlides.splice(index, 1);
    newSlides.splice(targetIndex, 0, moved);

    onReorder(newSlides.map((s) => s.id));
  };

  return (
    <div className={`flex flex-col bg-slate-900 border-t border-slate-700/60 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-200">슬라이드 시퀀스 목록</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            총 {slides.length}면 (본문 {slides.filter((s) => s.category === 'body').length}면 + 부록 {slides.filter((s) => s.category === 'appendix').length}면)
          </span>
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>드래그 앤 드롭 또는 화살표로 순서 변경</span>
          <span className="inline-block w-1 h-1 rounded-full bg-slate-600" />
          <span>눈 아이콘으로 숨김 토글</span>
        </div>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {slides.map((slide, idx) => {
          const isActive = activeSlideIndex === idx;
          const isHidden = !!slide.hidden;
          const isAppendix = slide.category === 'appendix';
          const isDragging = draggedSlideId === slide.id;
          const isOver = dragOverSlideId === slide.id;

          const archetypeTag = slide.layoutType.split('_')[0] || 'A01';

          return (
            <div
              key={slide.id}
              draggable
              onDragStart={(e) => handleDragStart(e, slide.id)}
              onDragOver={(e) => handleDragOver(e, slide.id)}
              onDragLeave={() => setDragOverSlideId(null)}
              onDrop={(e) => handleDrop(e, slide.id)}
              onClick={() => onSelectSlide(idx)}
              className={`group relative flex-shrink-0 w-44 rounded-lg cursor-pointer transition-all duration-150 border select-none ${
                isActive
                  ? 'border-blue-500 bg-slate-800/90 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500'
                  : 'border-slate-700/80 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-600'
              } ${isHidden ? 'opacity-40 grayscale' : ''} ${
                isOver ? 'ring-2 ring-amber-400 border-amber-400 scale-[1.02]' : ''
              } ${isDragging ? 'opacity-20' : ''}`}
            >
              {/* Header inside card */}
              <div className="flex items-center justify-between p-2 border-b border-slate-700/40 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-400">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                      isAppendix
                        ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                        : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    }`}
                  >
                    {isAppendix ? '부록' : archetypeTag}
                  </span>
                </div>

                {/* Hide / Show Toggle Button */}
                <button
                  type="button"
                  title={isHidden ? '슬라이드 보이기' : '슬라이드 숨기기'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(slide.id);
                  }}
                  className={`p-1 rounded transition-colors hover:bg-slate-700 ${
                    isHidden ? 'text-rose-400 hover:text-rose-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isHidden ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Thumbnail body */}
              <div className="p-2.5 h-16 flex flex-col justify-between">
                <div className="line-clamp-2 text-xs text-slate-200 font-medium">
                  {slide.title || `슬라이드 ${idx + 1}`}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="truncate max-w-[90px]">{slide.kicker || slide.layoutType}</span>
                  {isHidden && <span className="text-rose-400 font-semibold">[숨김]</span>}
                </div>
              </div>

              {/* Card Footer: Reorder arrows */}
              <div className="flex items-center justify-between px-2 py-1 bg-slate-900/60 rounded-b-lg border-t border-slate-700/30 text-[10px] text-slate-400">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={(e) => handleMove(idx, 'up', e)}
                  className="px-1.5 py-0.5 rounded hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                  title="앞으로 이동"
                >
                  ◀
                </button>
                <span className="text-[9px] text-slate-500">드래그 가능</span>
                <button
                  type="button"
                  disabled={idx === slides.length - 1}
                  onClick={(e) => handleMove(idx, 'down', e)}
                  className="px-1.5 py-0.5 rounded hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                  title="뒤로 이동"
                >
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
