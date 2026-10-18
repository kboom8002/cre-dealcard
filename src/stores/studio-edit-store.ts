'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';

const MAX_HISTORY_STEPS = 50;

export interface StudioHistoryEntry {
  slides: PptxSlide[];
  description: string;
  timestamp: number;
}

function cloneSlides(slides: PptxSlide[]): PptxSlide[] {
  return JSON.parse(JSON.stringify(slides));
}

export function useStudioHistory(initialSlides: PptxSlide[] = []) {
  const [slides, setSlidesState] = useState<PptxSlide[]>(initialSlides);
  const [past, setPast] = useState<StudioHistoryEntry[]>([]);
  const [future, setFuture] = useState<StudioHistoryEntry[]>([]);
  const [dirtySlideIds, setDirtySlideIds] = useState<Set<string>>(new Set());
  const slidesRef = useRef<PptxSlide[]>(initialSlides);
  slidesRef.current = slides;

  const hydrateSlides = useCallback((nextSlides: PptxSlide[]) => {
    const cloned = cloneSlides(nextSlides);
    setSlidesState(cloned);
    setPast([]);
    setFuture([]);
    setDirtySlideIds(new Set());
  }, []);

  const commitSlideChange = useCallback(
    (
      updater: (prev: PptxSlide[]) => PptxSlide[],
      description = '슬라이드 편집',
      dirtySlideId?: string
    ) => {
      setSlidesState(prev => {
        const snapshot = cloneSlides(prev);
        const next = cloneSlides(updater(prev));
        setPast(p => {
          const updated = [...p, { slides: snapshot, description, timestamp: Date.now() }];
          return updated.length > MAX_HISTORY_STEPS
            ? updated.slice(updated.length - MAX_HISTORY_STEPS)
            : updated;
        });
        setFuture([]);
        if (dirtySlideId) {
          setDirtySlideIds(d => {
            const copy = new Set(d);
            copy.add(dirtySlideId);
            return copy;
          });
        }
        return next;
      });
    },
    []
  );

  const undo = useCallback((): PptxSlide[] | null => {
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    const currentSnapshot = cloneSlides(slidesRef.current);

    setPast(p => p.slice(0, p.length - 1));
    setFuture(f => [
      { slides: currentSnapshot, description: previous.description, timestamp: Date.now() },
      ...f,
    ]);
    const restored = cloneSlides(previous.slides);
    setSlidesState(restored);
    return restored;
  }, [past]);

  const redo = useCallback((): PptxSlide[] | null => {
    if (future.length === 0) return null;
    const nextEntry = future[0];
    const currentSnapshot = cloneSlides(slidesRef.current);

    setFuture(f => f.slice(1));
    setPast(p => [
      ...p,
      { slides: currentSnapshot, description: nextEntry.description, timestamp: Date.now() },
    ]);
    const restored = cloneSlides(nextEntry.slides);
    setSlidesState(restored);
    return restored;
  }, [future]);

  const clearDirty = useCallback((slideId?: string) => {
    if (!slideId) {
      setDirtySlideIds(new Set());
    } else {
      setDirtySlideIds(prev => {
        const copy = new Set(prev);
        copy.delete(slideId);
        return copy;
      });
    }
  }, []);

  return {
    slides,
    setSlidesDirectly: setSlidesState,
    hydrateSlides,
    commitSlideChange,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    redoCount: future.length,
    lastActionLabel: past.length > 0 ? past[past.length - 1].description : null,
    dirtySlideIds,
    clearDirty,
  };
}

export function useUndoRedoShortcuts({
  onUndo,
  onRedo,
  enabled = true,
}: {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept native Undo/Redo inside focused input/textarea unless user holds Alt or is outside input
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditingInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (isEditingInput && !e.altKey) return;

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          onRedo();
        } else {
          e.preventDefault();
          onUndo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, enabled]);
}
