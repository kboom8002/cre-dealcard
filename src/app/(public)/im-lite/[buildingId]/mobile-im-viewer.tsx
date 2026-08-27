"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import type { MobileIMDocument, MobileIMSection } from "@/lib/demo/mobile-im-demo-data";
import { FlatProfileCard } from "@/components/broker/flat-profile-card";
import { HeroCard } from "./hero-card";
import { DCFHeatmap } from "./dcf-heatmap";
import { LeverageChart } from "./leverage-chart";
import { toast } from 'sonner';

// 카카오 SDK 초기화 헬퍼 함수
const initKakao = () => {
  if (typeof window !== "undefined" && (window as any).kakao) {
    // Kakao Map SDK는 별도의 초기화 없이 객체 사용 가능
  }
};

// ─── Voice Briefing Player — 제거됨 (TTS 안정화 전까지 비활성) ─────────────

// ─── IM Inquiry Bottom Sheet ───────────────────────────────────────────────
function IMInquiryBottomSheet({
  buildingId, docId, brokerUserId, brokerName, blindName, onClose,
}: {
  buildingId: string;
  docId?: string;
  brokerUserId: string;
  brokerName: string;
  blindName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(`${blindName} 건물에 관심이 있습니다. 프라이빗 IM을 요청합니다.`);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setError("이름과 연락처 또는 이메일 중 하나는 필수입니다.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/public/im-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: buildingId,
          doc_id: docId,
          broker_user_id: brokerUserId,
          requester_name: name.trim(),
          requester_phone: phone.trim() || undefined,
          requester_email: email.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "접수에 실패했습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="프라이빗 IM 신청"
        className="bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-bold text-white">📄 프라이빗 IM 신청</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:text-white">✕</button>
        </div>

        {submitted ? (
          /* 성공 화면 */
          <div className="px-5 pb-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-3xl">✅</div>
            <h3 className="text-lg font-bold text-white mb-2">신청이 접수되었습니다</h3>
            <p className="text-sm text-neutral-400 mb-6">
              {brokerName} 중개인이 곧 연락드리겠습니다.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 bg-primary text-black text-sm font-bold rounded-xl">
              확인
            </button>
          </div>
        ) : (
          /* 입력 폼 */
          <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
            <p className="text-xs text-neutral-500">
              아래 정보를 입력하시면 <span className="text-primary font-semibold">{brokerName}</span> 중개인에게 전달됩니다.
            </p>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">이름 <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">연락처 <span className="text-neutral-600 text-xs">(전화 또는 이메일 필수)</span></label>
              <input
                type="tel"
                placeholder="010-XXXX-XXXX (선택)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div>
              <input
                type="email"
                placeholder="이메일 (선택)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-primary text-black text-sm font-black rounded-xl hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "접수 중..." : "📨 신청서 보내기"}
            </button>

            <p className="text-xs text-neutral-600 text-center">
              입력하신 정보는 담당 중개인에게만 전달되며, 투자 상담 목적으로만 사용됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kakao & Precise Static Map Component ────────────────────────────────────────────
function KakaoStaticMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const kakaoMapLink = `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
  const naverMapLink = `https://map.naver.com/p/search/${lat},${lng}`;
  
  // OpenStreetMap 정적 타일 — zoom 16으로 역 출구 및 도로 상세 식별
  const zoom = 16;
  const exactX = ((lng + 180) / 360) * Math.pow(2, zoom);
  const exactY = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom);

  const tileX = Math.floor(exactX);
  const tileY = Math.floor(exactY);

  // 타일 내 서브픽셀 오프셋 계산 (정밀도 1px 이내 보정)
  const offsetX = (exactX - tileX) * 256;
  const offsetY = (exactY - tileY) * 256;
  const shiftX = 128 - offsetX;
  const shiftY = 128 - offsetY;
  
  // 3x3 타일 그리드로 충분한 맵 영역 커버
  const tileUrl = (x: number, y: number) =>
    `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  return (
    <div className="relative w-full h-full bg-neutral-800 overflow-hidden group">
      {/* 3x3 타일 그리드 — 정확한 좌표가 정중앙(50%, 50%)에 오도록 서브픽셀 이동 */}
      <div
        className="absolute grid grid-cols-3 grid-rows-3 pointer-events-none"
        style={{
          width: '768px',
          height: '768px',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${shiftX}px), calc(-50% + ${shiftY}px))`
        }}
      >
        {[-1, 0, 1].map(dy =>
          [-1, 0, 1].map(dx => (
            <img
              key={`${dx}_${dy}`}
              src={tileUrl(tileX + dx, tileY + dy)}
              alt=""
              className="w-[256px] h-[256px] block select-none"
              style={{ imageRendering: 'auto' }}
              loading="eager"
            />
          ))
        )}
      </div>

      {/* 중앙 마커 핀 — 정중앙 좌표 바로 위에 정확히 위치 */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="relative -mt-7 filter drop-shadow-md">
          <svg width="34" height="42" viewBox="0 0 32 40" fill="none">
            <path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z" fill="#3b82f6"/>
            <circle cx="16" cy="16" r="6.5" fill="white"/>
            <circle cx="16" cy="16" r="3.5" fill="#1d4ed8"/>
          </svg>
        </div>
      </div>

      {/* 지도 바로가기 오버레이 (카카오맵 / 네이버 지도) */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex gap-2">
        <a
          href={kakaoMapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-[11px] font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.95 1.95 5.55 4.88 7.04-.15.57-.78 2.96-.81 3.13 0 0-.02.12.06.17.08.04.17.01.17.01.22-.03 2.58-1.71 3.66-2.43.64.09 1.33.14 2.04.14 5.52 0 10-3.82 10-8.56C22 5.82 17.52 2 12 2z"/>
          </svg>
          카카오맵 길찾기
        </a>
        <a
          href={naverMapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#03C75A] hover:bg-[#02B351] text-white text-[11px] font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <span className="font-extrabold text-[10px]">N</span>
          네이버 지도
        </a>
      </div>
      
      {/* OSM 저작자 표시 */}
      <div className="absolute top-2 right-2 z-20">
        <span className="text-[8px] text-neutral-300 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">© OpenStreetMap</span>
      </div>
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
              className={`relative shrink-0 ${sortedItems.length === 1 ? 'w-full' : 'w-[88%] sm:w-[78%]'} snap-center rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer shadow-lg`}
              onClick={() => item.type !== 'map' && openLightbox(i)}
            >
              {/* Map embed or photo */}
              {item.type === 'map' && coordinates ? (
                <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-neutral-800">
                  <KakaoStaticMap lat={coordinates.lat} lng={coordinates.lng} name={blindName} />
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
  isBroker?: boolean;
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
                <span key={source} className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
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
              className={`hidden sm:inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${aiRoleBadge.color}`}
            >
              {aiRoleBadge.label}
            </span>
          )}
          {!section.locked && section.confidence === 'confirmed' && !/(?:확인\s*필요|미확정|확보되지\s*않|대지지분\s*확인|산출\s*불가|미정|0\s*㎡)/.test((section as any).markdown || section.content || '') && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
        <h3 key={key++} className="text-sm sm:text-base font-bold tracking-tight text-primary mt-5 mb-2.5">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flush();
      elements.push(
        <h2 key={key++} className="text-base sm:text-lg font-bold text-white mt-5 mb-3">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("**") && line.endsWith("**") && !line.includes(" ")) {
      flush();
      elements.push(
        <p key={key++} className="font-bold text-white text-base leading-relaxed">
          {line.slice(2, -2)}
        </p>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      flush();
      const bulletText = line.replace(/^[-*•]\s+/, "");
      elements.push(
        <li key={key++} className="text-neutral-200 text-base leading-relaxed ml-4 list-disc my-1">
          <InlineMarkdown text={bulletText} />
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      flush();
      const text = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li key={key++} className="text-neutral-200 text-base leading-relaxed ml-4 list-decimal my-1">
          <InlineMarkdown text={text} />
        </li>,
      );
    } else if (line.startsWith("> ")) {
      flush();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-3 border-primary/60 bg-primary/10 rounded-r-xl py-2 px-4 my-3"
        >
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed font-medium">
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
        <p key={key++} className="text-neutral-200 text-base leading-relaxed my-1">
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }

  flush();
  return <div className="space-y-1.5">{elements}</div>;
}

function sanitizeHtml(html: string): string {
  if (!html) return html;
  
  let safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  safe = safe.replace(/(\s)on[a-z]+\s*=\s*(['"])(?:(?!\2).)*\2/gi, '$1');
  safe = safe.replace(/(\s)on[a-z]+\s*=\s*[^>\s]+/gi, '$1');
  safe = safe.replace(/href\s*=\s*(['"])javascript:[^'"]*\1/gi, 'href="#"');
  safe = safe.replace(/src\s*=\s*(['"])javascript:[^'"]*\1/gi, 'src=""');
  
  safe = safe.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    const allowed = ['a', 'strong', 'em', 'img', 'br'];
    if (allowed.includes(tag.toLowerCase())) {
      return match;
    }
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
  
  return safe;
}

function InlineMarkdown({ text }: { text: string }) {
  // Convert ![alt](url) to <img src="url" alt="alt" />
  let processed = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // [text](url) → clickable link
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline font-medium">$1</a>');

  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
  processed = processed.replace(/\*([^*]+)\*/g, '<em class="italic text-neutral-200">$1</em>');

  processed = sanitizeHtml(processed);

  if (processed !== text) {
    return <span dangerouslySetInnerHTML={{ __html: processed }} />;
  }

  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
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
    <div className="overflow-x-auto my-4 rounded-xl border border-neutral-700/60 shadow-sm">
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="border-b border-neutral-700 bg-neutral-950/80">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-neutral-300 font-bold px-3.5 py-3 text-xs sm:text-sm">
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/30 transition-colors">
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3.5 py-2.5 text-neutral-200 leading-relaxed font-normal">
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

const PPTX_PRESETS = [
  { id: "golden_institutional", label: "🏛️ 기관투자형 골드", desc: "신뢰감 있는 기관 투자용" },
  { id: "credeal_signature", label: "💎 시그니처 모던", desc: "모던 & 트렌디 스타일" },
  { id: "executive_gold", label: "👑 이그제큐티브 골드", desc: "프리미엄 네이비 & 골드" },
  { id: "corporate_clean", label: "🏢 코퍼레이트 클린", desc: "깔끔하고 세련된 네이비" },
  { id: "pro_dark_obsidian", label: "🌑 다크 옵시디언", desc: "고급스러운 다크 테마" },
  { id: "minimal_white", label: "📄 미니멀 화이트", desc: "심플하고 단정한 화이트" },
];

function FloatingActionBar({
  title,
  buildingId,
  docId,
  tier = 'basic',
  brokerPhone,
  onInquire,
  isBroker = false,
  doc,
}: {
  title: string;
  buildingId: string;
  docId?: string;
  tier?: 'basic' | 'pro';
  brokerPhone?: string;
  onInquire?: () => void;
  isBroker?: boolean;
  doc?: MobileIMDocument | null;
}) {
  const [copied, setCopied] = useState(false);
  const [requestingPro, setRequestingPro] = useState(false);
  const [isBrokerMode, setIsBrokerMode] = useState(isBroker);
  const [selectedPreset, setSelectedPreset] = useState("golden_institutional");
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsPresetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Kakao SDK init
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.Kakao) {
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      script.async = true;
      script.onload = () => {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (window.Kakao && !window.Kakao.isInitialized() && appKey) {
          window.Kakao.init(appKey);
        }
      };
      document.head.appendChild(script);
    } else if (!window.Kakao.isInitialized()) {
      const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
      if (appKey) window.Kakao.init(appKey);
    }
  }, []);

  const handleKakaoShare = () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : `https://credeal.net/im-lite/${buildingId}${docId ? `?doc=${docId}` : ''}`;
    const ogImageUrl = `https://credeal.net/api/og/deal/${buildingId}?type=im&t=${Date.now()}`;
    const shareTitle = doc?.ogTitle || doc?.blindName || title || "모바일 투자설명서";
    const shareDesc = doc?.ogDescription || doc?.heroSubtitle || `${doc?.areaSignal || '핵심권역'} ${doc?.assetType || '상업용부동산'} ${doc?.priceBand || ''} 핵심 투자 검토 자료`;

    if (typeof window !== "undefined" && (window as any).Kakao?.Share) {
      try {
        const kakao = (window as any).Kakao;
        if (!kakao.isInitialized()) {
          const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
          if (appKey) kakao.init(appKey);
        }
        kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: shareTitle,
            description: shareDesc.slice(0, 100),
            imageUrl: ogImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
            link: {
              webUrl: currentUrl,
              mobileWebUrl: currentUrl,
            },
          },
          buttons: [
            {
              title: "투자설명서 보기",
              link: {
                webUrl: currentUrl,
                mobileWebUrl: currentUrl,
              },
            },
          ],
        });
        toast.success("카카오톡 공유 창이 열렸습니다.");
        return;
      } catch (err) {
        console.warn("Kakao share failed:", err);
      }
    }

    // Fallback: Copy link
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    toast.success("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall through
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("링크가 클립보드에 복사되었습니다.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePdf = () => {
    window.open(`/api/public/im-lite/${buildingId}/export${docId ? `?doc_id=${docId}&tier=${tier}` : `?tier=${tier}`}`, "_blank", "noopener");
  };

  const handlePptxDownload = (presetKey?: string) => {
    const preset = presetKey || selectedPreset;
    const targetUrl = `/api/public/im-lite/${buildingId}/pptx?preset=${preset}${docId ? `&doc_id=${docId}&tier=${tier}` : `&tier=${tier}`}`;
    window.open(targetUrl, "_blank", "noopener");
    setIsPresetMenuOpen(false);
  };

  const handleProRequest = async () => {
    if (requestingPro) return;
    setRequestingPro(true);
    try {
      const res = await fetch('/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'intent.pro_request',
          buildingId,
          docId
        })
      });
      if (res.ok) {
        toast.success('Pro 버전 요청이 접수되었습니다.');
      } else {
        toast.error('요청 중 오류가 발생했습니다.');
      }
    } catch {
      toast.error('요청 중 오류가 발생했습니다.');
    } finally {
      setRequestingPro(false);
    }
  };

  const currentPresetInfo = PPTX_PRESETS.find(p => p.id === selectedPreset) || PPTX_PRESETS[0];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900/95 backdrop-blur border-t border-neutral-800 safe-area-bottom shadow-2xl">
      {/* Broker mode switcher bar */}
      {isBroker && (
        <div className="bg-neutral-950/90 border-b border-neutral-800 px-4 py-1.5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isBrokerMode ? 'bg-amber-400' : 'bg-blue-400'} animate-pulse`}></span>
            <span className="font-bold text-neutral-300">
              {isBrokerMode ? "💼 중개인 전용 모드" : "👁️ 매수자 시점 화면"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsBrokerMode(!isBrokerMode)}
              className="text-neutral-400 hover:text-white underline underline-offset-2 transition-colors font-medium"
            >
              {isBrokerMode ? "👁️ 매수자 시점 보기" : "💼 중개인 모드로 전환"}
            </button>
            {docId && (
              <Link
                href={`/broker/im-approval/${docId}`}
                className="text-primary hover:underline transition-colors font-semibold"
              >
                ✏️ IM 승인·편집
              </Link>
            )}
          </div>
        </div>
      )}



      {/* Main Buttons */}
      <div className="px-4 py-2.5 flex items-center gap-2 max-w-2xl mx-auto">
        {isBrokerMode ? (
          /* ───────── 중개인 뷰 (Broker View) ───────── */
          <>
            {/* 카카오톡 공유 버튼 */}
            <button
              onClick={handleKakaoShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-xs sm:text-sm font-black rounded-xl transition-all shadow-md active:scale-95"
              title="카카오톡으로 모바일 IM 공유"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.95 1.95 5.55 4.88 7.04-.15.57-.78 2.96-.81 3.13 0 0-.02.12.06.17.08.04.17.01.17.01.22-.03 2.58-1.71 3.66-2.43.64.09 1.33.14 2.04.14 5.52 0 10-3.82 10-8.56C22 5.82 17.52 2 12 2z"/>
              </svg>
              <span>카카오톡 공유</span>
            </button>

            {/* PPTX 프리셋 드롭다운 & 다운로드 버튼 */}
            <div className="relative flex-1" ref={dropdownRef}>
              <div className="flex rounded-xl overflow-hidden shadow-sm border border-neutral-700 bg-neutral-800">
                <button
                  onClick={() => handlePptxDownload()}
                  className="flex-1 py-3 px-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1 truncate"
                  title="선택된 프리셋으로 PPTX 다운로드"
                >
                  <span className="truncate">📊 PPTX ({currentPresetInfo.label.split(' ')[1] || '다운로드'})</span>
                </button>
                <button
                  onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                  className="px-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white border-l border-neutral-600 transition-colors flex items-center justify-center"
                  title="PPTX 템플릿 프리셋 선택"
                >
                  <span className={`transform transition-transform text-xs ${isPresetMenuOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
              </div>

              {/* 프리셋 선택 팝오버 메뉴 */}
              {isPresetMenuOpen && (
                <div className="absolute bottom-full mb-2 right-0 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="px-2 py-1.5 border-b border-neutral-800 mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-neutral-400">🎨 PPTX 템플릿 프리셋</span>
                    <span className="text-[9px] text-primary">6개 스타일</span>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {PPTX_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          handlePptxDownload(preset.id);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                          selectedPreset === preset.id
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'hover:bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{preset.label}</span>
                          {selectedPreset === preset.id && <span className="text-xs">✓</span>}
                        </div>
                        <span className="text-xs text-neutral-500">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PDF 다운로드 버튼 */}
            <button
              onClick={handlePdf}
              title="PDF 다운로드"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              📄 PDF
            </button>

            {/* 링크 복사 버튼 */}
            <button
              onClick={handleShare}
              title="링크 복사"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              {copied ? "✅" : "🔗"}
            </button>
          </>
        ) : (
          /* ───────── 일반 매수자 뷰 (Buyer View) ───────── */
          <>
            {brokerPhone && (
              <a
                href={`tel:${brokerPhone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                📞 직통 전화
              </a>
            )}
            {onInquire && (
              <button
                onClick={onInquire}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-primary hover:bg-primary/90 text-black text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                💬 비밀 상담
              </button>
            )}
            <button onClick={handlePdf} title="PDF 다운로드" className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors">
              📄 PDF
            </button>
            <button onClick={() => handlePptxDownload()} title="PPTX 다운로드" className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors">
              📊 PPTX
            </button>
            <button onClick={handleShare} title="공유하기" className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors">
              {copied ? "✅" : "🔗"}
            </button>
          </>
        )}
      </div>
    </div>
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

export function MobileIMViewer({ document: doc, buildingId, ssotData, docId, isBroker = false }: Props) {
  const accentColor = '#60a5fa';

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["01_overview"]), // First section open by default
  );
  // [D1] 현재 화면에 보이는 섹션 인덱스
  const [activeSection, setActiveSection] = useState(0);
  // [D4] 언어 전환 (영문 1-Pager)
  const [showInquiry, setShowInquiry] = useState(false);

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
      navigator.serviceWorker.register("/sw-im.js").catch((err) => { console.warn('[mobile-im-viewer]', err); });
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
    }).catch((err) => { console.warn('[mobile-im-viewer]', err); });
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
              }).catch((err) => { console.warn('[mobile-im-viewer]', err); });
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
      {/* Draft / Blocked Warning Banner */}
      {doc.status === 'draft' && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-center">
          <p className="text-xs font-bold text-amber-400">
            ⚠️ 초안 상태 — 중개인 검수 전 자료이며, 최종 확인이 필요합니다.
          </p>
        </div>
      )}

      {/* Grade-based Suppression Banners */}
      {doc.dataQualityBadge?.tier === 'draft' && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2">
          <p className="text-[11px] text-red-400 text-center">
            🔴 D등급 데이터 — 발행 차단 상태입니다. 핵심 데이터를 보강해 주세요.
          </p>
        </div>
      )}
      {doc.dataQualityBadge?.tier === 'reference' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
          <p className="text-[11px] text-amber-400 text-center">
            ⚠️ C등급 데이터 — 총수익률 분석이 제한됩니다. 데이터를 보강하면 더 상세한 분석이 가능합니다.
          </p>
        </div>
      )}
      {doc.dataQualityBadge?.tier === 'partial' && !doc.dcf10Year && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2">
          <p className="text-[11px] text-blue-400 text-center">
            ℹ️ B등급 데이터 — DCF 분석은 A등급 이상에서 제공됩니다. 데이터를 보강해 주세요.
          </p>
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider shrink-0">
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
                  <span className="text-xs text-neutral-500 font-medium">
                    {new Date(doc.approvedAt).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </>
            )}

            {/* Data Quality Badge */}
            {doc.dataQualityBadge && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                doc.dataQualityBadge.tier === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                doc.dataQualityBadge.tier === 'partial' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                doc.dataQualityBadge.tier === 'reference' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {doc.dataQualityBadge.emoji} {doc.dataQualityBadge.label}
              </span>
            )}
          </div>

          {/* Price band */}
          <p className="text-3xl font-black text-primary mb-2">
            {doc.priceBand}
          </p>

          {/* Subtitle — 핵심 투자 하이라이트 헤드카피 */}
          {(doc as any).heroSubtitle && (
            <p className="text-sm font-bold text-emerald-400/90 mb-4 leading-snug">
              {(doc as any).heroSubtitle}
            </p>
          )}

          {/* Generation timestamp */}
          <p className="text-xs text-neutral-600">
            AI 생성: {new Date(doc.generatedAt).toLocaleDateString("ko-KR")} · 크리딜 모바일 IM Lite
          </p>
        </div>

        {/* ── Voice Briefing removed (TTS 안정화 전까지 비활성) ── */}

        {/* [C1] Hero Card — 핵심 투자 지표 요약 */}
        {doc.heroCard && <HeroCard data={doc.heroCard} />}

        {/* ── Photo Gallery / Map ── */}
        <PhotoGallery
          photos={doc.photos}
          coordinates={doc.coordinates}
          blindName={doc.blindName}
        />

        {/* ── Section Cards ── */}
        <div className="space-y-3 mb-8">
          {doc.sections.filter((s: MobileIMSection) => !(doc as any).hiddenSections?.includes(s.sectionId)).map((section: MobileIMSection, index: number) => (
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
                  {doc.tier !== 'basic' && doc.dcf10Year && doc.financials?.waccPct != null && (
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

              {/* [P2] 중간 CTA — 3번째 섹션 다음에 삽입 */}
              {index === 2 && (
                <div className="mt-3 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 p-4">
                  <p className="text-xs font-bold text-primary mb-3">💬 이 매물에 관심이 있으시나요?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await fetch('/api/public/teaser/event', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ eventType: 'intent.interest_tap', buildingId, docId })
                          });
                        } catch (err) { console.warn('[mobile-im-viewer]', err); }
                        const btn = document.activeElement as HTMLButtonElement;
                        if (btn) { btn.textContent = '✅ 관심 표시 완료'; btn.disabled = true; }
                      }}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors border border-neutral-700"
                    >
                      👍 1-tap 관심
                    </button>
                    <button
                      onClick={() => setShowInquiry(true)}
                      className="flex-1 py-2.5 bg-primary text-black text-xs font-black rounded-xl hover:bg-primary/90 transition-colors"
                    >
                      📄 상세 자료 요청
                    </button>
                  </div>
                </div>
              )}

              {/* [B4] 프라이빗 IM 신청 CTA — 마지막 섹션 다음 */}
              {index === doc.sections.length - 1 && (
                <div className="mt-4 space-y-3">
                  <button
                    id="cta-private-im-request"
                    onClick={() => setShowInquiry(true)}
                    className="w-full py-3.5 bg-primary text-black text-sm font-black rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    📄 프라이빗 투자설명서(IM) 신청
                  </button>

                  {doc.broker.phone && (
                    <a
                      href={`tel:${doc.broker.phone}`}
                      aria-label={`담당 중개인 ${doc.broker.displayName || '브로커'}에게 직통 전화 문의`}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-neutral-900 border border-neutral-700 hover:border-emerald-500/50 text-emerald-400 text-xs font-bold rounded-2xl transition-all"
                    >
                      📞 담당 브로커 직통 전화 문의
                    </a>
                  )}


                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── 담당 중개인 프로필 카드 ── */}
        {doc.broker.slug !== "cre-dealcard-default" ? (
          <div className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4 px-1">
              담당 중개인
            </h2>
            <FlatProfileCard
              name={doc.broker.displayName}
              company={doc.broker.company}
              specialty={[...(doc.broker.specialtyRegions ?? []), ...(doc.broker.specialtyAssets ?? [])].join(' · ')}
              photoUrl={doc.broker.photoUrl}
              phone={doc.broker.phone}
              email={(doc.broker as any).contactEmail}
              slug={doc.broker.slug}
              dealCount={(doc.broker as any).dealCount ?? 0}
              listingCount={(doc.broker as any).activeCount ?? 0}
              variant="compact"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">
              담당 중개인
            </h2>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-2xl">
                👤
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">{doc.broker.displayName}</p>
                <p className="text-sm text-neutral-400 truncate">{doc.broker.company}</p>
              </div>
            </div>
            <a
              href={`tel:${doc.broker.phone}`}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              📞 전화 상담
            </a>
          </div>
        )}

        {/* ── Inquiry Bottom Sheet ── */}
        {showInquiry && (
          <IMInquiryBottomSheet
            buildingId={buildingId}
            docId={docId}
            brokerUserId={doc.broker.userId}
            brokerName={doc.broker.displayName}
            blindName={doc.blindName}
            onClose={() => setShowInquiry(false)}
          />
        )}

        {/* ── Disclaimer ── */}
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/50 p-4 mb-4">
          <p className="text-xs text-neutral-600 leading-relaxed">
            <span className="font-bold text-neutral-500">⚠️ 면책 조항 </span>
            {doc.disclaimer}
          </p>
          <p className="text-xs text-neutral-700 mt-2">
            {doc.protectedFieldsRemoved.length > 0 && `보호된 필드: ${doc.protectedFieldsRemoved.join(", ")}`}
          </p>
        </div>
      </div>

      {/* ── Bottom Share Bar ── */}
      <FloatingActionBar
        title={`${doc.blindName} — 모바일 IM Lite`}
        buildingId={buildingId}
        docId={docId}
        tier={doc.tier}
        brokerPhone={doc.broker.phone}
        onInquire={() => setShowInquiry(true)}
        isBroker={isBroker}
        doc={doc}
      />
    </div>
  );
}
