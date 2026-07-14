import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import GateRequestForm from "./GateRequestForm";

interface PageProps { params: Promise<{ id: string }> }

// ── Status 한국어 라벨 ──
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "매각 진행중", color: "text-green-400" },
  public_signal_ready: { label: "검토 가능", color: "text-blue-400" },
  draft: { label: "준비중", color: "text-amber-400" },
  archived: { label: "종료", color: "text-slate-500" },
};

function getStatusDisplay(status: string | null) {
  return STATUS_LABELS[status || ""] || { label: status || "검토중", color: "text-slate-400" };
}

// ── 데이터 조회 ──
async function getDealCardData(id: string) {
  const supabase = createServiceClient();

  const [buildingRes, signalCardRes] = await Promise.all([
    supabase
      .from("building_ssot_lite")
      .select("id, owner_id, area_signal, asset_type, price_band, size_signal, current_use_signal, vacancy_signal, status, layers, fit_summary")
      .eq("id", id)
      .single(),
    supabase
      .from("building_signal_cards")
      .select("id, title, area_signal, asset_type, price_band, deal_points, body, status")
      .eq("building_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let brokerSlug = "cre-dealcard-default";
  let brokerName: string | null = null;
  if (buildingRes.data?.owner_id) {
    const brokerRes = await supabase
      .from("broker_profiles")
      .select("slug")
      .eq("user_id", buildingRes.data.owner_id)
      .maybeSingle();
    if (brokerRes.data?.slug) brokerSlug = brokerRes.data.slug;

    const profileRes = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", buildingRes.data.owner_id)
      .maybeSingle();
    brokerName = profileRes.data?.display_name || null;
  }

  return {
    building: buildingRes.data,
    signalCard: signalCardRes.data,
    brokerSlug,
    brokerName,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { building, signalCard } = await getDealCardData(id);

  // signal card에서 AI 생성 제목/설명 우선 사용
  const body = (signalCard?.body || {}) as Record<string, unknown>;
  const title = (signalCard?.title as string)
    || `${building?.area_signal || "상업용 부동산"} ${building?.asset_type || ""} 매각`;
  const description = (body.shortSummary as string)
    || `${building?.area_signal || ""} 권역 블라인드 매각 매물`;

  // OG 이미지: 건물 사진이 있으면 그것 사용, 없으면 동적 OG
  const photos = ((building?.layers as Record<string, unknown>)?.photos as Array<{ url: string }>) || [];
  const ogImage = photos.length > 0 ? photos[0].url : `/api/og/deal/${id}`;

  return {
    title: `${title} | 크리딜 DealCard`,
    description,
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params }: PageProps) {
  const { id } = await params;
  const { building, signalCard, brokerSlug, brokerName } = await getDealCardData(id);

  if (!building) return notFound();

  // ── 데이터 추출 ──
  const body = (signalCard?.body || {}) as Record<string, unknown>;
  const layers = (building.layers || {}) as Record<string, unknown>;
  const photos = (layers.photos as Array<{ url: string; label: string }>) || [];
  const coordinates = layers.coordinates as { lat: number; lng: number } | undefined;

  const title = (signalCard?.title as string)
    || `${building.area_signal || "비공개 권역"} ${building.asset_type || "빌딩"} 매각`;
  const shortSummary = body.shortSummary as string || body.short_summary as string || "";
  const dealPoints = (body.dealPoints || body.deal_points || signalCard?.deal_points || []) as string[];
  const hiddenInfoNotice = (body.hiddenInfoNotice || body.hidden_info_notice || []) as string[];
  const gateMessage = (body.gateMessage || body.gate_message || "연락처를 남겨주시면 담당 중개사가 NDA 체결 후 상세 자료를 전달합니다.") as string;
  const boundaryNote = (body.boundaryNote || body.boundary_note || "") as string;

  const statusDisplay = getStatusDisplay(building.status);
  const sizeSignal = building.size_signal || "";

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {brokerSlug && brokerSlug !== 'cre-dealcard-default' ? (
            <Link href={`/vibe-card/${brokerSlug}`} className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1">
              <span>✨</span> {brokerName || '중개사'} 명함 보기
            </Link>
          ) : (
            <span className="text-xs text-slate-500">DealCard</span>
          )}
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-bold tracking-wide">
            Blind DealCard
          </span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── 1. 사진 갤러리 또는 지도 ── */}
        {photos.length > 0 ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800">
            <div className="relative w-full aspect-[16/9] bg-neutral-900">
              <Image
                src={photos[0].url}
                alt={photos[0].label || "건물 외관"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 520px"
                priority
              />
              {/* 블라인드 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 flex gap-1.5">
                <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg border border-white/10">
                  📍 {building.area_signal || "비공개"}
                </span>
                <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg border border-white/10">
                  🏢 {building.asset_type || "상업용"}
                </span>
              </div>
            </div>
            {photos.length > 1 && (
              <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg">
                  +{photos.length - 1}
                </span>
              </div>
            )}
          </div>
        ) : coordinates ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-neutral-900">
            <div className="w-full aspect-[16/9] relative">
              <a 
                href={`https://map.kakao.com/link/map/${encodeURIComponent(building.area_signal || "위치")},${coordinates.lat},${coordinates.lng}`}
                target="_blank" 
                rel="noopener noreferrer" 
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                <span className="text-3xl mb-2">🗺️</span>
                <span className="text-sm font-medium">카카오맵에서 위치 보기</span>
              </a>
            </div>
          </div>
        ) : null}

        {/* ── 2. 메인 카드: 제목 + 가격 ── */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-5 space-y-3">
            {/* 태그 */}
            {!photos.length && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-0.5 rounded-full font-medium">
                  📍 {building.area_signal || "비공개"}
                </span>
                <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-0.5 rounded-full font-medium">
                  🏢 {building.asset_type || "상업용"}
                </span>
              </div>
            )}

            {/* 제목 */}
            <h1 className="text-lg font-bold text-white leading-snug">
              {title}
            </h1>

            {/* 가격 + 상태 */}
            <div className="flex items-center gap-3">
              {building.price_band && (
                <span className="text-base font-bold text-primary">{building.price_band}</span>
              )}
              <span className={`text-xs font-semibold ${statusDisplay.color}`}>
                {statusDisplay.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. 딜 개요 ── */}
        {shortSummary && (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📋 딜 개요</h2>
            <p className="text-sm text-slate-200 leading-relaxed">{shortSummary}</p>
          </div>
        )}

        {/* ── 4. 핵심 딜 포인트 ── */}
        {dealPoints.length > 0 && (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🔑 핵심 딜 포인트</h2>
            <ul className="space-y-2.5">
              {dealPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-200">
                  <span className="mt-0.5 w-5 h-5 flex items-center justify-center bg-primary/15 text-primary text-[10px] font-bold rounded-full shrink-0">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── 5. 매물 규모 ── */}
        {sizeSignal && (
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📐 매물 규모</h2>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{sizeSignal}</p>
          </div>
        )}

        {/* ── 6. 블라인드 처리 안내 ── */}
        <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-white flex items-center gap-1">🔒 블라인드 처리 안내</p>
          {hiddenInfoNotice.length > 0 ? (
            <ul className="space-y-1">
              {hiddenInfoNotice.map((notice, i) => (
                <li key={i} className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                  <span className="text-slate-600 mt-0.5">•</span>
                  {notice}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              매도자 보호를 위해 정확한 건물 주소, 호실, 소유자 정보는 비공개 처리되어 있습니다.
              하단 연락처 제출 후 NDA 기반으로 상세 정보를 제공합니다.
            </p>
          )}
        </div>

        {/* ── 7. Gate CTA ── */}
        <div className="bg-[#131b2e] border border-primary/20 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">📞 상세 정보 요청</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed">{gateMessage}</p>
          <GateRequestForm buildingId={id} />
        </div>

        {/* ── 8. 면책문구 ── */}
        {boundaryNote && (
          <div className="text-center px-4 py-3">
            <p className="text-[9px] text-slate-600 leading-relaxed">{boundaryNote}</p>
          </div>
        )}

        {/* ── 9. 하단 CTA ── */}
        <div className="text-center pb-4">
          <Link
            href={brokerSlug !== "cre-dealcard-default" ? `/vibe-card/${brokerSlug}` : "/hub"}
            className="text-xs text-primary hover:underline"
          >
            🔍 다른 매물도 살펴보기 →
          </Link>
        </div>
      </div>
    </main>
  );
}
