"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import type { MobileIMDocument, MobileIMSection } from "@/lib/demo/mobile-im-demo-data";
import { getTemplateById } from "@/lib/vibe/vibe-templates";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { HeroCard } from "./hero-card";
import { DCFHeatmap } from "./dcf-heatmap";
import { LeverageChart } from "./leverage-chart";

// 카카오 SDK 초기화 헬퍼 함수
const initKakao = () => {
  if (typeof window !== "undefined" && (window as any).kakao) {
    // Kakao Map SDK는 별도의 초기화 없이 객체 사용 가능
  }
};

// ─── Voice Briefing Player ─────────────────────────────────────────────────

function VoiceBriefingPlayer({ buildingId }: { buildingId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlay = async () => {
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('paused');
      return;
    }
    if (state === 'paused' && audioRef.current) {
      audioRef.current.play();
      setState('playing');
      return;
    }

    // Load audio
    setState('loading');
    try {
      const audio = new Audio(`/api/public/im-lite/${buildingId}/tts`);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
        setState('ready');
        audio.play();
        setState('playing');
      });

      audio.addEventListener('canplay', () => {
        if (state === 'loading') {
          setDuration(audio.duration || 60);
          audio.play();
          setState('playing');
        }
      });

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
        if (audio.duration > 0) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      });

      audio.addEventListener('ended', () => {
        setState('idle');
        setProgress(0);
        setCurrentTime(0);
      });

      audio.addEventListener('error', () => {
        setState('error');
      });

      audio.load();
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  if (state === 'error') {
    return (
      <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-3 mb-4">
        <p className="text-xs text-red-400 text-center">음성 브리핑 생성에 실패했습니다</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 via-primary/10 to-indigo-500/10 border border-white/10 backdrop-blur-sm p-4 mb-5">
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={handlePlay}
          disabled={state === 'loading'}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
            state === 'loading'
              ? 'bg-primary/20 animate-pulse'
              : state === 'playing'
              ? 'bg-gradient-to-br from-violet-500 to-primary shadow-lg shadow-primary/25'
              : 'bg-gradient-to-br from-violet-500/80 to-primary/80 hover:from-violet-500 hover:to-primary hover:shadow-lg hover:shadow-primary/25'
          }`}
          aria-label={state === 'playing' ? '일시정지' : '음성 브리핑 재생'}
        >
          {state === 'loading' ? (
            <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : state === 'playing' ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Info + Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-bold text-white">🎧 음성 브리핑</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-full font-medium">
              ~1분
            </span>
            {state === 'loading' && (
              <span className="text-[10px] text-neutral-500 animate-pulse">AI 음성 생성 중...</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {(state === 'playing' || state === 'paused') && (
              <span className="text-[10px] tabular-nums text-neutral-500 shrink-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            )}
          </div>

          {state === 'idle' && (
            <p className="text-[10px] text-neutral-600 mt-1">
              AI가 매물 핵심 정보를 요약해 읽어드립니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kakao Static Map Component ────────────────────────────────────────────
function KakaoStaticMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
    if (!appKey || !mapRef.current) {
      setMapError(true);
      setMapLoading(false);
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;

    const initMap = () => {
      const kakao = (window as any).kakao;
      if (!kakao || !kakao.maps || !mapRef.current) {
        setMapError(true);
        setMapLoading(false);
        return;
      }
      try {
        const options = {
          center: new kakao.maps.LatLng(lat, lng),
          level: 4,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
        };
        const map = new kakao.maps.Map(mapRef.current, options);
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(lat, lng),
        });
        marker.setMap(map);
        setMapLoading(false);
      } catch {
        setMapError(true);
        setMapLoading(false);
      }
    };

    // SDK 로드 타임아웃
    timeout = setTimeout(() => {
      if (mapLoading) {
        setMapError(true);
        setMapLoading(false);
      }
    }, 8000);

    const kakao = (window as any).kakao;
    if (kakao && kakao.maps && kakao.maps.load) {
      kakao.maps.load(initMap);
    } else {
      // 이미 스크립트가 추가되어 있는지 확인
      const existingScript = document.querySelector(
        `script[src*="dapi.kakao.com"]`
      );
      if (existingScript) {
        // 이미 로딩 중 — 재시도
        const retry = setInterval(() => {
          const k = (window as any).kakao;
          if (k && k.maps && k.maps.load) {
            clearInterval(retry);
            k.maps.load(initMap);
          }
        }, 500);
        setTimeout(() => clearInterval(retry), 7000);
      } else {
        const script = document.createElement("script");
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
        script.async = true;
        script.onload = () => {
          (window as any).kakao.maps.load(initMap);
        };
        script.onerror = () => {
          setMapError(true);
          setMapLoading(false);
        };
        document.head.appendChild(script);
      }
    }

    return () => clearTimeout(timeout);
  }, [lat, lng]);

  const mapLink = `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;

  return (
    <div className="relative w-full h-full bg-neutral-800">
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* 로딩 상태 */}
      {mapLoading && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-800">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-neutral-400">지도 로딩 중...</p>
          </div>
        </div>
      )}

      {/* 에러 폴백 */}
      {mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-800/90">
          <div className="text-center px-4">
            <svg className="w-8 h-8 text-neutral-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-xs text-neutral-400 mb-3">지도를 불러올 수 없습니다</p>
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/20 text-primary text-xs font-bold rounded-xl hover:bg-primary/30 transition-colors border border-primary/30"
            >
              카카오맵에서 보기 →
            </a>
          </div>
        </div>
      )}

      {/* 성공 시 오버레이 */}
      {!mapLoading && !mapError && (
        <div className="absolute inset-0 z-10 bg-black/10 flex flex-col items-center justify-center pointer-events-none transition-colors duration-300">
          <div className="pointer-events-auto mt-auto mb-4">
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-black/70 backdrop-blur-md text-white text-xs font-bold rounded-xl hover:bg-black/90 transition-colors border border-white/20 shadow-lg"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              카카오맵 앱에서 열기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Photo Gallery ─────────────────────────────────────────────────────────

function PhotoGallery({ photos, coordinates, blindName }: {
  photos?: MobileIMDocument['photos'];
  coordinates?: MobileIMDocument['coordinates'];
  blindName: string;
}) {
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
        ? [{ url: `https://map.kakao.com/link/map/${encodeURIComponent(blindName)},${coordinates.lat},${coordinates.lng}`, type: 'map' as const, label: '위치 지도', caption: undefined as string | undefined, order: undefined as number | undefined }]
        : [])
    ];
    const mapItems = raw.filter(i => i.type === 'map');
    const photoItems = raw
      .filter(i => i.type !== 'map')
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
    setLightboxIdx(prev => {
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
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sortedItems.map((item, i) => (
            <div
              key={i}
              className="relative shrink-0 w-[85%] sm:w-[75%] snap-center rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer"
              onClick={() => item.type !== 'map' && openLightbox(i)}
            >
              {/* Map embed or photo */}
              {item.type === 'map' && coordinates ? (
                <div className="relative w-full aspect-[2/1] bg-neutral-800">
                  <KakaoStaticMap lat={coordinates.lat} lng={coordinates.lng} name={blindName} />
                </div>
              ) : (
                <div className="relative w-full aspect-[2/1] bg-neutral-800">
                  <Image
                    src={item.url}
                    alt={item.label}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 85vw, 75vw"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Type badge (top-left) */}
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg border border-white/10">
                  {item.label}
                </span>
              </div>

              {/* Counter (top-right) */}
              <div className="absolute top-3 right-3">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium rounded-lg border border-white/10">
                  {i + 1} / {sortedItems.length}
                </span>
              </div>

              {/* Caption overlay (bottom) */}
              {item.caption && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <p className="text-white text-xs leading-snug line-clamp-2">{item.caption}</p>
                </div>
              )}

              {/* Overflow indicator on last item */}
              {i === sortedItems.length - 1 && overflowCount > 0 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">+{overflowCount}장 더보기</span>
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
                  i === activeIdx ? 'bg-primary w-4' : 'bg-neutral-700'
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
                onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
                className="absolute left-2 sm:left-4 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white text-lg transition-colors"
                aria-label="이전 사진"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
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
            {sortedItems[lightboxIdx]?.type === 'map' && coordinates ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full max-w-2xl aspect-[2/1] rounded-xl overflow-hidden">
                  <KakaoStaticMap lat={coordinates.lat} lng={coordinates.lng} name={blindName} />
                </div>
              </div>
            ) : (
              <Image
                src={sortedItems[lightboxIdx]?.url || ''}
                alt={sortedItems[lightboxIdx]?.label || ''}
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

interface Props {
  document: MobileIMDocument | null;
  buildingId: string;
  ssotData?: Record<string, unknown>;
  docId?: string;
}

// ─── Section Card ─────────────────────────────────────────────────────────

function SectionCard({
  section,
  index,
  isOpen,
  onToggle,
}: {
  section: MobileIMSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const aiRoleBadgeMap: Record<string, { label: string; color: string }> = {
    auto: { label: "SSoT 자동", color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
    ai_generated: { label: "AI 생성", color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
    static: { label: "정적", color: "text-neutral-400 bg-neutral-400/10 border-neutral-400/20" },
  };
  const aiRoleBadge = aiRoleBadgeMap[section.aiRole] ?? aiRoleBadgeMap.static;

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
        section.locked
          ? "border-neutral-800 bg-neutral-950/50"
          : isOpen
          ? "border-primary/30 bg-neutral-900/80 shadow-lg shadow-primary/5"
          : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        disabled={section.locked}
        className="w-full flex items-center gap-4 p-4 text-left"
        aria-expanded={isOpen}
      >
        {/* Number badge */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
            section.locked
              ? "bg-neutral-800 text-neutral-600"
              : "bg-primary/20 text-primary"
          }`}
        >
          {section.locked ? "🔒" : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{section.icon}</span>
            <span
              className={`text-base font-bold truncate ${
                section.locked ? "text-neutral-600" : "text-white"
              }`}
            >
              {section.title}
            </span>
          </div>
          {/* Provenance badges */}
          {(section as any).provenance && (section as any).provenance.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
              {Array.from(new Set((section as any).provenance.map((p: any) => p.source))).map((source: any) => (
                <span key={source} className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  source === 'public_data' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  source === 'broker_input' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  source === 'ai_inferred' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                  source === 'expert_verified' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
                }`}>
                  {source === 'public_data' ? '✓ 공부 확인' :
                   source === 'broker_input' ? '👤 중개인 입력' :
                   source === 'ai_inferred' ? '⚙ AI 추정' :
                   source === 'expert_verified' ? '★ 전문가 검증' :
                   source}
                </span>
              ))}
            </div>
          )}
          {section.locked && section.lockedReason && (
            <p className="text-xs text-neutral-600 mt-0.5 line-clamp-1">
              {section.lockedReason}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!section.locked && (
            <span
              className={`hidden sm:inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${aiRoleBadge.color}`}
            >
              {aiRoleBadge.label}
            </span>
          )}
          {!section.locked && section.confidence === 'confirmed' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              확인됨
            </span>
          )}
          {!section.locked && (
            <svg
              className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Locked overlay */}
      {section.locked && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 p-4 text-center">
            <p className="text-xs text-neutral-500 leading-relaxed">
              {section.lockedReason}
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              데이터 확보 후 자동 공개됩니다
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {!section.locked && isOpen && (
        <div className="px-4 pb-5 border-t border-neutral-800/50">
          <div className="pt-4 prose prose-invert prose-sm max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-primary prose-h3:mt-4 prose-h3:mb-2
            prose-p:text-neutral-300 prose-p:leading-relaxed prose-p:text-sm
            prose-strong:text-white prose-strong:font-semibold
            prose-table:text-xs prose-table:w-full
            prose-th:text-neutral-400 prose-th:font-medium prose-th:text-left prose-th:pb-2
            prose-td:text-neutral-300 prose-td:py-1.5
            prose-li:text-neutral-300 prose-li:text-sm
            prose-blockquote:text-neutral-400 prose-blockquote:border-l-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-3
          ">
            <MarkdownRenderer content={section.content || (section as any).markdown || ""} />
          </div>

          {section.boundaryNote && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
              <span className="text-amber-400 text-sm shrink-0">⚠️</span>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                {section.boundaryNote}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Simple Markdown Renderer ─────────────────────────────────────────────
// Renders markdown to JSX without a full markdown library dependency

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flush = () => {
    if (tableBuffer.length > 0) {
      elements.push(<TableFromLines key={key++} lines={tableBuffer} />);
      tableBuffer = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect table
    if (line.startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
      continue;
    }

    if (inTable && !line.startsWith("|")) {
      flush();
    }

    if (line.startsWith("### ")) {
      flush();
      elements.push(
        <h3 key={key++} className="text-xs font-bold uppercase tracking-wider text-primary mt-4 mb-2">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flush();
      elements.push(
        <h2 key={key++} className="text-sm font-bold text-white mt-4 mb-2">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("**") && line.endsWith("**") && !line.includes(" ")) {
      flush();
      elements.push(
        <p key={key++} className="font-bold text-white text-sm">
          {line.slice(2, -2)}
        </p>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flush();
      elements.push(
        <li key={key++} className="text-neutral-300 text-sm leading-relaxed ml-4 list-disc">
          <InlineMarkdown text={line.slice(2)} />
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      flush();
      const text = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li key={key++} className="text-neutral-300 text-sm leading-relaxed ml-4 list-decimal">
          <InlineMarkdown text={text} />
        </li>,
      );
    } else if (line.startsWith("> ")) {
      flush();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-2 border-primary/50 bg-primary/5 rounded-r-lg py-1 px-3 my-2"
        >
          <p className="text-neutral-400 text-xs leading-relaxed">
            <InlineMarkdown text={line.slice(2)} />
          </p>
        </blockquote>,
      );
    } else if (line.trim() === "") {
      flush();
      elements.push(<div key={key++} className="h-2" />);
    } else {
      flush();
      elements.push(
        <p key={key++} className="text-neutral-300 text-sm leading-relaxed">
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }

  flush();
  return <div className="space-y-1">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // [text](url) → clickable link
  let processed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline">$1</a>');

  // If links were found, render via dangerouslySetInnerHTML for the link tags,
  // but we still need bold/italic. Process **bold** and *italic* as HTML too.
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  processed = processed.replace(/\*([^*]+)\*/g, '<em class="italic text-neutral-200">$1</em>');

  // If any HTML was injected, use dangerouslySetInnerHTML
  if (processed !== text) {
    return <span dangerouslySetInnerHTML={{ __html: processed }} />;
  }

  // Fallback: no special syntax, render as plain text with bold/italic via React
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i} className="italic text-neutral-200">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TableFromLines({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => !l.match(/^\|[\s-|]+\|$/));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const parseRow = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(header);

  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-neutral-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-950/50">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-neutral-400 font-medium px-3 py-2">
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-neutral-300">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Share Buttons ─────────────────────────────────────────────────────────

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400">복사됨</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          공유
        </>
      )}
    </button>
  );
}

/** 카카오톡·LINE·링크복사 공유 버튼 모음 */
function BottomShareBar({ title, buildingId, docId, areaSignal, blindName, priceBand, heroCard }: { title: string; buildingId: string; docId?: string; areaSignal?: string; blindName?: string; priceBand?: string; heroCard?: { capRateBase?: number } }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Kakao && !(window as any).Kakao.isInitialized()) {
      const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
      if (appKey) (window as any).Kakao.init(appKey);
    }
  }, []);

  const handleKakao = async () => {
    if (typeof window !== "undefined" && (window as any).Kakao) {
      const Kakao = (window as any).Kakao;
      if (!Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) Kakao.init(appKey);
      }
      if (Kakao.isInitialized()) {
        try {
          // Vercel Preview 등 미등록 도메인에서 공유 시 카카오 API가 거부하므로 프로덕션 도메인으로 강제 변환
          const baseUrl = window.location.hostname.includes("vercel.app") 
            ? "https://www.credeal.net" 
            : window.location.origin;
          
          const canonicalShareUrl = shareUrl.replace(window.location.origin, baseUrl);
          const canonicalImageUrl = `${baseUrl}/api/og/deal/${buildingId}`;

          Kakao.Share.sendDefault({
            objectType: "feed",
            content: {
              title: areaSignal && blindName && !blindName.includes(areaSignal)
                ? `[${areaSignal}] ${blindName}`
                : blindName || title || '투자 매물',
              description: heroCard?.capRateBase
                ? `매각 희망가 ${priceBand || ''} · Cap Rate ${heroCard.capRateBase}% · 크리딜 프리미엄 투자설명서`
                : `${priceBand || ''} · ${areaSignal || ''} · 크리딜 프리미엄 투자설명서`,
              imageUrl: canonicalImageUrl,
              link: { mobileWebUrl: canonicalShareUrl, webUrl: canonicalShareUrl },
            },
            buttons: [
              { title: "투자설명서 즉시 열람", link: { mobileWebUrl: canonicalShareUrl, webUrl: canonicalShareUrl } },
            ],
          });
          return;
        } catch {
          // Kakao SDK 실패 시 폴백
        }
      }
    }
    // Kakao SDK 미로드 시 Web Share API → 클립보드 폴백
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // Fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLine = () => {
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(title);
    window.open(`https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (docId) {
      window.open(`/api/public/im-lite/${buildingId}/export?doc_id=${docId}`, "_blank", "noopener");
    }
  };

  return (
    <>
      <Script 
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (typeof window !== "undefined" && (window as any).Kakao && !(window as any).Kakao.isInitialized()) {
            const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
            if (appKey) (window as any).Kakao.init(appKey);
          }
        }}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 px-4 py-3 safe-area-bottom">
        <div className="max-w-2xl mx-auto">
        <p className="text-[10px] text-neutral-600 text-center mb-2">공유 또는 저장</p>
        <div className="flex gap-2">
          {/* KakaoTalk */}
          <button
            id="share-kakao-btn"
            onClick={handleKakao}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#FEE500] hover:bg-[#ffd900] text-[#3C1E1E] text-xs font-bold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.477 3 2 6.582 2 11c0 2.756 1.591 5.187 4.018 6.702L4.985 21l3.705-2.137A11.7 11.7 0 0 0 12 19c5.523 0 10-3.582 10-8S17.523 3 12 3Z"/>
            </svg>
            카카오톡
          </button>
          {/* LINE */}
          <button
            id="share-line-btn"
            onClick={handleLine}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#06C755] hover:bg-[#05b34d] text-white text-xs font-bold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.494.255l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            LINE
          </button>
          {/* Copy link */}
          <button
            id="share-copy-btn"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">복사됨</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                링크복사
              </>
            )}
          </button>
          {/* PDF export (only when docId available) */}
          {docId && (
            <button
              id="export-pdf-btn"
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF 저장
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────

function CompletenessBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-bold text-neutral-400 tabular-nums">{score}점</span>
    </div>
  );
}

// ─── Main Viewer ───────────────────────────────────────────────────────────

export function MobileIMViewer({ document: doc, buildingId, ssotData, docId }: Props) {
  const vibeTemplate = useMemo(() => {
    return doc?.broker.vibeTemplateId ? getTemplateById(doc.broker.vibeTemplateId) : null;
  }, [doc?.broker.vibeTemplateId]);
  const vibeCss = vibeTemplate?.css;
  const accentColor = vibeCss?.accentColor || '#60a5fa';

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["01_overview"]), // First section open by default
  );
  // [D1] 현재 화면에 보이는 섹션 인덱스
  const [activeSection, setActiveSection] = useState(0);
  // [D4] 언어 전환 (영문 1-Pager)
  const [language, setLanguage] = useState<'ko' | 'en'>('ko');
  const [isTranslating, setIsTranslating] = useState(false);
  const [enSections, setEnSections] = useState<MobileIMSection[] | null>(null);

  const viewedSectionsRef = useRef<Set<string>>(new Set());
  const sectionRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // [D2] PWA Service Worker 등록
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-im.js").catch(() => {});
    }
  }, []);

  // ── Dwell time and unload tracking ──
  useEffect(() => {
    if (!doc) return;
    const start = Date.now();
    const handleUnload = () => {
      const dwellSeconds = Math.round((Date.now() - start) / 1000);
      const blob = new Blob([JSON.stringify({
        dwell_seconds: dwellSeconds,
        blind_name: doc.blindName || doc.fullName,
        referrer: document.referrer,
      })], { type: 'application/json' });
      navigator.sendBeacon(`/api/public/im-lite/${buildingId}/view`, blob);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [buildingId, doc]);

  // ── View tracking on mount ──────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/im-lite/${buildingId}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_viewed: null }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [buildingId]);

  // ── Section intersection observer — 조회 추적 + [D1] activeSection 갱신
  const setRef = useCallback((sectionId: string) => (el: HTMLDivElement | null) => {
    if (el) sectionRefsMap.current.set(sectionId, el);
    else sectionRefsMap.current.delete(sectionId);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = (entry.target as HTMLElement).dataset.sectionId;
            if (sectionId && !viewedSectionsRef.current.has(sectionId)) {
              viewedSectionsRef.current.add(sectionId);
              fetch(`/api/public/im-lite/${buildingId}/view`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ section_viewed: sectionId }),
              }).catch(() => {});
            }
            // [D1] 현재 화면 상 섹션 인덱스 계산
            const idx = doc?.sections.findIndex((s) => s.sectionId === sectionId) ?? -1;
            if (idx >= 0) setActiveSection(idx);
          }
        });
      },
      { threshold: 0.4 }
    );
    sectionRefsMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [buildingId, doc?.sections]);

  // Coming-soon state for real buildings
  if (!doc) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📄</div>
          <h1 className="text-xl font-black text-white mb-2">IM Lite 준비 중</h1>
          <p className="text-sm text-neutral-400 leading-relaxed mb-6">
            {ssotData?.notice as string ?? "이 매물의 AI 섹션 생성 기능은 v0.4에서 제공됩니다."}
          </p>
          <Link
            href="/hub"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            데모 보러가기
          </Link>
        </div>
      </div>
    );
  }

  const unlockedCount = doc.sections.filter((s) => !s.locked).length;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Draft Warning Banner */}
      {doc.status !== "published" && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-400 px-4 py-2 text-center text-xs font-bold">
          ⚠️ 현재 검토 중인 초안 문서입니다. (외부 공개 전)
        </div>
      )}

      {/* ── Sticky Top Bar ── */}
      <div className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/broker/buildings?tab=im"
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            IM 보관함
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">
              📄 IM Lite
            </span>
            <span className="text-xs text-neutral-500 truncate hidden sm:block">
              {doc.areaSignal}
            </span>
          </div>

          <ShareButton title={`${doc.blindName} — 모바일 IM Lite`} />
        </div>

        {/* [D1] 섹션 Progress Dots */}
        <div
          className="flex items-center justify-center gap-1.5 py-1.5 overflow-x-auto"
          role="navigation"
          aria-label="IM 섹션 탐색"
        >
          {doc.sections.map((section, i) => (
            <button
              key={section.sectionId}
              onClick={() => {
                const el = sectionRefsMap.current.get(section.sectionId);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`transition-all duration-300 rounded-full ${
                i === activeSection
                  ? "w-5 h-1.5 bg-primary"
                  : i < activeSection
                  ? "w-1.5 h-1.5 bg-primary/40"
                  : "w-1.5 h-1.5 bg-neutral-700"
              }`}
              aria-label={`섹션 ${i + 1}`}
              aria-current={i === activeSection ? "step" : undefined}
            />
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24">

        {/* ── Hero Header ── */}
        <div className="pt-8 pb-6">
          {/* Asset type badge */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              {doc.assetType}
            </span>
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              📍 {doc.areaSignal}
            </span>
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              📏 {doc.sizeSignal}
            </span>
          </div>

          {/* Building blind name */}
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight mb-2">
            {doc.blindName}
          </h1>

          {/* Verification & Quality Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {doc.status === "published" && (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  전문 중개인 검증 완료
                </span>
                {doc.approvedAt && (
                  <span className="text-[10px] text-neutral-500 font-medium">
                    {new Date(doc.approvedAt).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </>
            )}
            {doc.dataQualityBadge && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                doc.dataQualityBadge.tier === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                doc.dataQualityBadge.tier === 'partial' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                doc.dataQualityBadge.tier === 'reference' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {doc.dataQualityBadge.emoji} {doc.dataQualityBadge.label} ({doc.dataQualityBadge.score}점)
              </span>
            )}
          </div>

          {/* Price band */}
          <p className="text-3xl font-black text-primary mb-4">
            {doc.priceBand}
          </p>

          {/* Completeness bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-neutral-500 font-medium">SSoT 완성도</span>
              <span className="text-xs text-neutral-500">
                {unlockedCount}/{doc.sections.length} 섹션 공개
              </span>
            </div>
            <CompletenessBar score={doc.completenessScore} />
          </div>

          {/* Generation timestamp */}
          <p className="text-[10px] text-neutral-600">
            AI 생성: {new Date(doc.generatedAt).toLocaleDateString("ko-KR")} · 크리딜 모바일 IM Lite
          </p>
        </div>

        {/* ── Voice Briefing Player ── */}
        <VoiceBriefingPlayer buildingId={buildingId} />

        {/* [C1] Hero Card — 핵심 투자 지표 요약 */}
        {doc.heroCard && <HeroCard data={doc.heroCard} />}

        {/* ── Photo Gallery / Map ── */}
        <PhotoGallery
          photos={doc.photos}
          coordinates={doc.coordinates}
          blindName={doc.blindName}
        />

        {/* [D4] 언어 전환 탭 */}
        <div className="flex gap-2 mb-4 p-1 bg-neutral-900 rounded-xl">
          <button
            id="tab-lang-ko"
            onClick={() => setLanguage('ko')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              language === 'ko' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
            }`}
          >
            한국어
          </button>
          <button
            id="tab-lang-en"
            onClick={async () => {
              if (!enSections) {
                setIsTranslating(true);
                try {
                  const res = await fetch(`/api/public/im-lite/${buildingId}/translate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ language: "en" }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setEnSections(data.sections ?? null);
                  }
                } catch {}
                setIsTranslating(false);
              }
              setLanguage('en');
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              language === 'en' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'
            }`}
          >
            {isTranslating ? '번역 중…' : 'English'}
          </button>
        </div>

        {/* ── Section Cards ── */}
        <div className="space-y-3 mb-8">
          {(language === 'en' && enSections ? enSections : doc.sections).map((section: MobileIMSection, index: number) => (
            <div
              key={section.sectionId}
              data-section-id={section.sectionId}
              ref={setRef(section.sectionId)}
            >
              <SectionCard
                section={section}
                index={index}
                isOpen={openSections.has(section.sectionId)}
                onToggle={() => toggleSection(section.sectionId)}
              />
              {/* [C2][C4] 수익 분석 섹션 다음에 DCF 히트맵 + 레버리지 차트 삽입 */}
              {section.sectionId?.includes('income') && (
                <>
                  {doc.dcf10Year && doc.financials?.waccPct != null && (
                    <div className="mt-3">
                      <DCFHeatmap dcfOutputs={doc.dcf10Year} waccBase={doc.financials.waccPct / 100} />
                    </div>
                  )}
                  {doc.financials && (doc.financials.equityRequiredBil != null || doc.financials.totalDepositBil != null || doc.financials.loanAmountBil != null) && (
                    <div className="mt-3">
                      <LeverageChart
                        equityBil={doc.financials.equityRequiredBil ?? 0}
                        depositBil={doc.financials.totalDepositBil ?? 0}
                        loanBil={doc.financials.loanAmountBil ?? 0}
                        leveragedYieldPct={doc.financials.leveragedYieldPct}
                      />
                    </div>
                  )}
                </>
              )}
              {/* [B4] 더블 트랙 CTA — 마지막 섹션 하단에 삽입 */}
              {index === doc.sections.length - 1 && (
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <button
                    id="cta-private-im-download"
                    onClick={() => {
                      const brokerSlug = doc.broker.slug;
                      if (brokerSlug && brokerSlug !== "cre-dealcard-default") {
                        window.location.href = `/vibe-card/${brokerSlug}?ref=im-cta&buildingId=${buildingId}`;
                      } else {
                        alert("담당 중개인에게 문의하시면 프라이빗 투자설명서(IM)를 제공해 드립니다.");
                      }
                    }}
                    className="w-full py-3.5 bg-primary text-black text-sm font-black rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    📄 프라이빗 투자설명서(IM) 신청
                  </button>
                  {doc.broker.phone && (
                    <a
                      id="cta-phone-consult"
                      href={`tel:${doc.broker.phone}`}
                      className="w-full py-3 text-center bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-bold rounded-2xl border border-neutral-700 transition-colors block"
                    >
                      📞 {doc.broker.displayName} 즉시 상담
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Full IM Upgrade CTA ── */}
        {doc.fullImUpgradeCta.enabled && (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-violet-500/5 p-5 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">
                📊
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-white mb-1">
                  {doc.fullImUpgradeCta.label}
                </h2>
                <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                  {doc.fullImUpgradeCta.description}
                </p>
                {doc.broker.slug !== "cre-dealcard-default" ? (
                  <Link
                    href={`/vibe-card/${doc.broker.slug}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-black text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    중개인에게 문의하기
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <button
                    onClick={() => alert("담당 중개인이 아직 프로필을 개통하지 않았습니다.")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-800 text-neutral-400 text-xs font-bold rounded-lg transition-colors cursor-not-allowed"
                  >
                    중개인 프로필 미등록
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Weekly Magazine Subscribe CTA ── */}
        {doc.broker.slug && doc.broker.slug !== "cre-dealcard-default" && (
          <div className="mb-8">
            <SubscribeCard brokerId={doc.broker.slug} source="im" accentColor={accentColor} />
          </div>
        )}

        {/* ── Broker Profile Card ── */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">
            담당 중개인
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="relative w-14 h-14 rounded-full overflow-hidden border-2 shrink-0"
              style={{ borderColor: accentColor, boxShadow: vibeCss?.ringGlow }}
            >
              {doc.broker.photoUrl && doc.broker.photoUrl !== "/default-avatar.png" ? (
                <Image
                  src={doc.broker.photoUrl}
                  alt={doc.broker.displayName}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              ) : (
                <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-2xl">
                  👤
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base">{doc.broker.displayName}</p>
              <p className="text-sm text-neutral-400 truncate">{doc.broker.company}</p>
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2 leading-snug">
                {doc.broker.tagline}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${doc.broker.phone}`}
              className="flex items-center justify-center gap-2 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              전화
            </a>
            {doc.broker.slug !== "cre-dealcard-default" ? (
              <Link
                href={`/vibe-card/${doc.broker.slug}`}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl border transition-colors"
                style={{
                  background: `${accentColor}10`,
                  color: accentColor,
                  borderColor: `${accentColor}20`,
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                프로필 보기
              </Link>
            ) : (
              <button
                onClick={() => alert("담당 중개인이 아직 프로필을 개통하지 않았습니다.")}
                className="flex items-center justify-center gap-2 py-2.5 bg-neutral-800 text-neutral-500 text-sm font-medium rounded-xl transition-colors cursor-not-allowed"
              >
                프로필 미등록
              </button>
            )}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/50 p-4 mb-4">
          <p className="text-[10px] text-neutral-600 leading-relaxed">
            <span className="font-bold text-neutral-500">⚠️ 면책 조항 </span>
            {doc.disclaimer}
          </p>
          <p className="text-[10px] text-neutral-700 mt-2">
            {doc.protectedFieldsRemoved.length > 0 && `보호된 필드: ${doc.protectedFieldsRemoved.join(", ")}`}
          </p>
        </div>
      </div>

      {/* ── Bottom Share Bar ── */}
      <BottomShareBar
        title={`${doc.blindName} — 모바일 IM Lite`}
        buildingId={buildingId}
        docId={docId}
        areaSignal={doc.areaSignal}
        blindName={doc.blindName}
        priceBand={doc.priceBand}
        heroCard={doc.heroCard ? { capRateBase: doc.heroCard.capRateBase ?? undefined } : undefined}
      />
    </div>
  );
}
