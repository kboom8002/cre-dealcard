"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  FOCUSABLE_SELECTOR,
  getFocusableTrapTarget,
} from "@/components/ui/modal-logic";
import type { MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";
import { KakaoStaticMap } from "./kakao-static-map";

interface PhotoGalleryProps {
  photos?: MobileIMDocument["photos"];
  coordinates?: MobileIMDocument["coordinates"];
  blindName: string;
}

export function PhotoGallery({
  photos,
  coordinates,
  blindName,
}: PhotoGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const touchStartX = useRef(0);

  // Build and sort: map first → order-based → rest (max 12 photos)
  const sortedItems = useMemo(() => {
    const raw = [...(photos || [])];
    const mapItems = raw.filter((i) => i.type === "map");
    const nonPhotoTypes = new Set(["floor_plan", "document", "business_card", "location_map", "district_plan_map", "cadastral", "land_plan"]);
    const photoItems = raw
      .filter(
        (i) =>
          (i as any).excluded !== true &&
          i.type !== "map" &&
          !nonPhotoTypes.has((i.type as string)?.toLowerCase() || "") &&
          !nonPhotoTypes.has(((i as any).category as string)?.toLowerCase() || "")
      )
      .sort((a: any, b: any) => {
        const aHero = a.role === "cover" || a.isHero ? 0 : 1;
        const bHero = b.role === "cover" || b.isHero ? 0 : 1;
        if (aHero !== bHero) return aHero - bHero;
        return (a.order ?? 99) - (b.order ?? 99);
      });
    return [...mapItems, ...photoItems.slice(0, 12)];
  }, [photos, coordinates, blindName]);

  const totalOriginal = (photos?.length ?? 0) + (coordinates ? 1 : 0);
  const overflowCount = Math.max(0, totalOriginal - sortedItems.length);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const scrollLeft = el.scrollLeft;
    const itemWidth = el.offsetWidth * 0.85;
    const idx = Math.round(scrollLeft / itemWidth);
    setActiveIdx(idx);
  }, []);

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx);
    setLightboxOpen(true);
  };

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const navigateLightbox = useCallback(
    (dir: -1 | 1) => {
      if (sortedItems.length <= 1) return;
      setLightboxIdx((prev) => {
        const next = prev + dir;
        if (next < 0) return sortedItems.length - 1;
        if (next >= sortedItems.length) return 0;
        return next;
      });
    },
    [sortedItems.length]
  );

  useEffect(() => {
    if (!lightboxOpen || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    if (!lightboxRef.current?.contains(document.activeElement)) {
      closeBtnRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        closeLightbox();
        return;
      }
      if (e.key === "ArrowLeft") {
        if (sortedItems.length > 1) {
          e.preventDefault();
          navigateLightbox(-1);
        }
        return;
      }
      if (e.key === "ArrowRight") {
        if (sortedItems.length > 1) {
          e.preventDefault();
          navigateLightbox(1);
        }
        return;
      }
      if (e.key === "Tab") {
        const dialogEl = lightboxRef.current;
        if (!dialogEl) return;
        const focusables = Array.from(
          dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        const activeIndex = focusables.indexOf(
          document.activeElement as HTMLElement
        );
        const target = getFocusableTrapTarget({
          count: focusables.length,
          activeIndex,
          shiftKey: e.shiftKey,
        });
        if (target === null) return;
        e.preventDefault();
        if (target === "container") {
          dialogEl.focus();
        } else {
          focusables[target]?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (
        previousActive &&
        previousActive.isConnected &&
        typeof previousActive.focus === "function"
      ) {
        previousActive.focus();
      }
    };
  }, [lightboxOpen, sortedItems.length, closeLightbox, navigateLightbox]);

  // Touch swipe handlers for lightbox
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) navigateLightbox(diff > 0 ? 1 : -1);
  };

  if (sortedItems.length === 0) return null;

  return (
    <>
      <div className="mb-5">
        {/* Horizontal scroll gallery */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {sortedItems.map((item, i) => (
            <div
              key={i}
              role={item.type !== "map" ? "button" : undefined}
              tabIndex={item.type !== "map" ? 0 : undefined}
              aria-label={
                item.type !== "map" ? `${item.label || "매물 사진"} 크게 보기` : undefined
              }
              className={`relative shrink-0 ${
                sortedItems.length === 1 ? "w-full" : "w-[88%] sm:w-[78%]"
              } snap-center rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 ${
                item.type !== "map" ? "cursor-pointer" : ""
              } shadow-lg`}
              onClick={() => item.type !== "map" && openLightbox(i)}
              onKeyDown={(e) => {
                if (item.type === "map") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openLightbox(i);
                }
              }}
            >
              {/* Map embed or photo */}
              {item.type === "map" && coordinates ? (
                <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-neutral-800">
                  <KakaoStaticMap
                    lat={coordinates.lat}
                    lng={coordinates.lng}
                    name={blindName}
                    mapUrl={item.url}
                  />
                </div>
              ) : (
                <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-neutral-800">
                  <Image
                    src={item.url}
                    alt={item.label}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 88vw, 78vw"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Type badge (top-left) */}
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-sm font-bold rounded-lg border border-white/10">
                  {item.label}
                </span>
              </div>

              {/* Counter (top-right) */}
              <div className="absolute top-3 right-3">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-sm font-medium rounded-lg border border-white/10">
                  {i + 1} / {sortedItems.length}
                </span>
              </div>

              {/* Caption overlay (bottom) */}
              {item.caption && item.caption.trim() !== (item.label || "").trim() && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <p className="text-white text-sm leading-snug line-clamp-2">
                    {item.caption}
                  </p>
                </div>
              )}

              {/* Overflow indicator on last item */}
              {i === sortedItems.length - 1 && overflowCount > 0 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">
                    +{overflowCount}장 더보기
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dot indicators */}
        {sortedItems.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {sortedItems.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  i === activeIdx ? "bg-primary w-4" : "bg-neutral-700"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Fullscreen Lightbox ── */}
      {lightboxOpen && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label="매물 사진 크게 보기"
          tabIndex={-1}
          data-testid="photo-gallery-lightbox"
          className="fixed inset-0 z-[100] flex items-center justify-center outline-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/95"
            onClick={closeLightbox}
          />

          {/* Close button */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 min-h-11 min-w-11 w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-xl transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-white/10 rounded-full text-white text-sm font-medium">
            {lightboxIdx + 1} / {sortedItems.length}
          </div>

          {/* Navigation arrows */}
          {sortedItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox(-1);
                }}
                className="absolute left-2 sm:left-4 z-10 min-h-11 min-w-11 w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg transition-colors"
                aria-label="이전 사진"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox(1);
                }}
                className="absolute right-2 sm:right-4 z-10 min-h-11 min-w-11 w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg transition-colors"
                aria-label="다음 사진"
              >
                ›
              </button>
            </>
          )}

          {/* Image */}
          <div className="relative z-10 w-full h-full max-w-4xl max-h-[80vh] mx-4">
            {sortedItems[lightboxIdx]?.type === "map" && coordinates ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full max-w-2xl aspect-[2/1] rounded-xl overflow-hidden">
                  <KakaoStaticMap
                    lat={coordinates.lat}
                    lng={coordinates.lng}
                    name={blindName}
                  />
                </div>
              </div>
            ) : sortedItems[lightboxIdx]?.url ? (
              <Image
                src={sortedItems[lightboxIdx].url}
                alt={sortedItems[lightboxIdx]?.label || ""}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            ) : null}
          </div>

          {/* Caption in lightbox */}
          {sortedItems[lightboxIdx]?.caption && (
            <div className="absolute bottom-4 left-4 right-4 z-10 text-center">
              <p className="inline-block px-4 py-2 bg-black/70 backdrop-blur-sm rounded-xl text-white text-sm leading-relaxed max-w-lg">
                {sortedItems[lightboxIdx].caption}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
