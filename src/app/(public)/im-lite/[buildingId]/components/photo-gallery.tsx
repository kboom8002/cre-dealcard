"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
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
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const touchStartX = useRef(0);

  // Build and sort: map first → order-based → rest (max 12 photos)
  const sortedItems = useMemo(() => {
    const raw = [
      ...(photos || []),
      ...(coordinates
        ? [
            {
              url: `https://map.kakao.com/link/map/${encodeURIComponent(
                blindName
              )},${coordinates.lat},${coordinates.lng}`,
              type: "map" as const,
              label: "위치 지도",
              caption: undefined as string | undefined,
              order: undefined as number | undefined,
            },
          ]
        : []),
    ];
    const mapItems = raw.filter((i) => i.type === "map");
    const photoItems = raw
      .filter((i) => i.type !== "map")
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
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

  const closeLightbox = () => setLightboxOpen(false);

  const navigateLightbox = (dir: -1 | 1) => {
    setLightboxIdx((prev) => {
      const next = prev + dir;
      if (next < 0) return sortedItems.length - 1;
      if (next >= sortedItems.length) return 0;
      return next;
    });
  };

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
              className={`relative shrink-0 ${
                sortedItems.length === 1 ? "w-full" : "w-[88%] sm:w-[78%]"
              } snap-center rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer shadow-lg`}
              onClick={() => item.type !== "map" && openLightbox(i)}
            >
              {/* Map embed or photo */}
              {item.type === "map" && coordinates ? (
                <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-neutral-800">
                  <KakaoStaticMap
                    lat={coordinates.lat}
                    lng={coordinates.lng}
                    name={blindName}
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
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded-lg border border-white/10">
                  {item.label}
                </span>
              </div>

              {/* Counter (top-right) */}
              <div className="absolute top-3 right-3">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-lg border border-white/10">
                  {i + 1} / {sortedItems.length}
                </span>
              </div>

              {/* Caption overlay (bottom) */}
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <p className="text-white text-xs leading-snug line-clamp-2">
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
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-xl transition-colors"
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
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox(-1);
                }}
                className="absolute left-2 sm:left-4 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg transition-colors"
                aria-label="이전 사진"
              >
                ‹
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateLightbox(1);
                }}
                className="absolute right-2 sm:right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg transition-colors"
                aria-label="다음 사진"
              >
                ›
              </button>
            </>
          )}

          {/* Image */}
          <div
            className="relative w-full h-full max-w-4xl max-h-[80vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
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
            ) : (
              <Image
                src={sortedItems[lightboxIdx]?.url || ""}
                alt={sortedItems[lightboxIdx]?.label || ""}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            )}
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
