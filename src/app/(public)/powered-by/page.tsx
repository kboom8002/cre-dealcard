import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { toPublicDealCard } from "@/domain/public-projection/deal-card";
import { evaluateDealCardPublicVisibility } from "@/domain/public-projection/visibility";
import { getPublicWorkspaceProjection } from "@/lib/workspace/workspace-repository";
import { isDemoSeedDisabledForProd } from "@/lib/og/deal-public-guard";
import {
  isBuildingShareLinkRevoked,
  isBuildingShareLinkRevokedAsync,
} from "@/lib/security/share-link-tokens";
import { suggestFallbackRegion, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  ShieldCheck,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Briefcase,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "CREDEAL — 60초 만에 기관급 딜카드 & 매거진 생성",
  description:
    "대한민국 CRE 공인중개사를 위한 AI 딜 인텔리전스 플랫폼. 메모 1줄로 검증된 딜카드와 모바일 매거진을 자동 발행하세요.",
};

interface PoweredByPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface PoweredByBuildingContext {
  title: string;
  areaSignal: string;
  priceBand: string;
  assetType: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_BROKER_SLUG_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

function sanitizeBlindHeadline(raw: string | null | undefined): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed.includes("●●●")) return "블라인드 검증 매물";
  return validateBlindPoints([trimmed]).isValid ? trimmed : "블라인드 검증 매물";
}

function sanitizeBlindAreaSignal(raw: string | null | undefined): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed.includes("●●●")) return "핵심 상권";
  if (validateBlindPoints([trimmed]).isValid) return trimmed;
  const fallback = suggestFallbackRegion(trimmed);
  return fallback && validateBlindPoints([fallback]).isValid ? fallback : "핵심 상권";
}

function sanitizeBlindChip(raw: string | null | undefined, fallback: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed.includes("●●●")) return fallback;
  return validateBlindPoints([trimmed]).isValid ? trimmed : fallback;
}

async function resolvePoweredByBlindContext(
  rawRefId: string | undefined,
): Promise<PoweredByBuildingContext | null> {
  const refId = typeof rawRefId === "string" ? rawRefId.trim() : "";
  if (!refId || isDemoSeedDisabledForProd(refId)) return null;

  try {
    if (await isBuildingShareLinkRevoked(refId)) {
      return null;
    }

    const supabase = createServiceClient();
    if (await isBuildingShareLinkRevokedAsync(refId, supabase)) {
      return null;
    }

    const wsProjection = await getPublicWorkspaceProjection(supabase, refId, "dealcard").catch(
      () => null,
    );
    if (wsProjection?.revoked || wsProjection?.deleted) {
      return null;
    }

    if (wsProjection?.found) {
      if (!wsProjection.projection) {
        return null;
      }
      const wsVisibility = evaluateDealCardPublicVisibility({
        workspaceItemStatus: wsProjection.projection.status,
      });
      if (!wsVisibility.isPublic) {
        return null;
      }

      const snap = (wsProjection.projection.snapshot ?? {}) as Record<string, unknown>;
      const snapCard4 =
        snap.card4 && typeof snap.card4 === "object" && !Array.isArray(snap.card4)
          ? (snap.card4 as Record<string, unknown>)
          : {};
      const region =
        (typeof snapCard4.region === "string" && snapCard4.region) ||
        (typeof snap.area_signal === "string" && snap.area_signal) ||
        "";
      const assetType =
        (typeof snapCard4.use === "string" && snapCard4.use) ||
        (typeof snap.asset_type === "string" && snap.asset_type) ||
        "";
      const priceBand =
        (typeof snapCard4.priceBand === "string" && snapCard4.priceBand) ||
        (typeof snap.price_band === "string" && snap.price_band) ||
        wsProjection.projection.priceBand ||
        "";
      const headline =
        (typeof snapCard4.headline === "string" && snapCard4.headline) ||
        (typeof snap.headline === "string" && snap.headline) ||
        wsProjection.projection.title;

      const dto = toPublicDealCard({
        id: refId,
        building: {
          id: wsProjection.projection.buildingId || refId,
          area_signal: region,
          asset_type: assetType,
          price_band: priceBand,
        },
        signalCard: {
          title: headline,
          area_signal: region,
          asset_type: assetType,
          price_band: priceBand,
          body: {},
        },
        teaserDoc: {
          body: {
            card4: { ...snapCard4, region, use: assetType, priceBand, headline },
            ogTitle: headline,
          },
        },
        brokerProfile: null,
        hasImDoc: false,
        isPptxApproved: false,
        pptxDownloadUrl: "",
      });

      return {
        title: sanitizeBlindHeadline(dto.og.title || dto.hero.title),
        areaSignal: sanitizeBlindAreaSignal(dto.hero.regionLabel || region),
        priceBand: sanitizeBlindChip(dto.hero.bandedPrice || priceBand, "가격 협의"),
        assetType: sanitizeBlindChip(dto.postureWidget.assetType || assetType, "상업용 부동산"),
      };
    }

    if (!UUID_REGEX.test(refId) || isDemoSeedDisabledForProd(refId)) {
      return null;
    }

    const [ssotRes, signalCardRes, teaserDocRes] = await Promise.all([
      supabase
        .from("building_ssot_lite")
        .select("id, status, area_signal, asset_type, price_band")
        .eq("id", refId)
        .maybeSingle(),
      supabase
        .from("building_signal_cards")
        .select("id, title, area_signal, asset_type, price_band, status, visibility, body")
        .eq("building_id", refId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("document_objects")
        .select("body, status")
        .eq("building_id", refId)
        .eq("document_type", "blind_teaser")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const ssotRow = ssotRes?.data as {
      id?: string;
      status?: string | null;
      area_signal?: string | null;
      asset_type?: string | null;
      price_band?: string | null;
    } | null;

    // Require active public_signal_ready status on building_ssot_lite; drafts/archived/missing fail closed.
    if (!ssotRow || ssotRow.status !== "public_signal_ready") {
      return null;
    }

    const signalCard = signalCardRes?.data as {
      title?: string | null;
      area_signal?: string | null;
      asset_type?: string | null;
      price_band?: string | null;
      status?: string | null;
      visibility?: string | null;
      body?: unknown;
    } | null;

    const teaserBody =
      teaserDocRes?.data?.body && typeof teaserDocRes.data.body === "object"
        ? (teaserDocRes.data.body as Record<string, unknown>)
        : null;
    if (teaserBody?.is_revoked === true) {
      return null;
    }

    const visibility = evaluateDealCardPublicVisibility({
      buildingStatus: ssotRow.status,
      signalCardVisibility: signalCard?.visibility,
      signalCardStatus: signalCard?.status,
    });
    if (!visibility.isPublic) {
      return null;
    }

    const rawBuilding = await readBuilding(refId, { client: supabase }).catch(() => null);
    const dto = toPublicDealCard({
      id: refId,
      building: rawBuilding ?? {
        id: refId,
        area_signal: ssotRow.area_signal,
        asset_type: ssotRow.asset_type,
        price_band: ssotRow.price_band,
      },
      signalCard,
      teaserDoc: teaserDocRes?.data ?? null,
      brokerProfile: null,
      hasImDoc: false,
      isPptxApproved: false,
      pptxDownloadUrl: "",
    });

    return {
      title: sanitizeBlindHeadline(dto.og.title || dto.hero.title),
      areaSignal: sanitizeBlindAreaSignal(dto.hero.regionLabel || ssotRow.area_signal),
      priceBand: sanitizeBlindChip(dto.hero.bandedPrice || ssotRow.price_band, "가격 협의"),
      assetType: sanitizeBlindChip(dto.postureWidget.assetType || ssotRow.asset_type, "상업용 부동산"),
    };
  } catch {
    return null;
  }
}

export default async function PoweredByPage({ searchParams }: PoweredByPageProps) {
  const resolvedParams = await searchParams;
  const ctx = typeof resolvedParams.ctx === "string" ? resolvedParams.ctx : "dealcard";
  const refId = typeof resolvedParams.ref === "string" ? resolvedParams.ref : undefined;
  const rawBroker = typeof resolvedParams.broker === "string" ? resolvedParams.broker.trim() : "";
  const safeBrokerSlug = SAFE_BROKER_SLUG_REGEX.test(rawBroker)
    ? encodeURIComponent(rawBroker)
    : null;

  const buildingData = await resolvePoweredByBlindContext(refId);

  const contextLabelMap: Record<string, string> = {
    dealcard: "블라인드 딜카드",
    magazine: "모바일 위클리 매거진",
    im: "기관급 투자제안서(IM)",
  };

  const contextName = contextLabelMap[ctx] || "딜 인텔리전스 리포트";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-blue-100">
      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-[44px] items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="font-extrabold tracking-tight text-slate-900 text-base">CREDEAL</span>
            <span className="text-sm font-semibold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              Intelligence
            </span>
          </Link>

          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            로그인
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 max-w-xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Context Hook Card (If referred by a specific deal card or magazine) */}
        {buildingData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-bold mb-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>방금 확인하신 {contextName}의 검증 원천</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-2">
              {buildingData.title}
            </h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {buildingData.areaSignal}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {buildingData.assetType}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                {buildingData.priceBand}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-200 leading-relaxed">
              본 자료는 공적장부 교차 검증과 AI 밸류에이션 엔진으로 위조 방지 및 블라인드 보호 처리된 산출물입니다.
            </p>
          </div>
        ) : (
          <div className="text-center space-y-2 py-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Institutional Grade Real Estate AI</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              전문 공인중개사를 위한 차세대 딜 엔진
            </h1>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              카카오톡 메모 1줄로 공적장부를 자동 조회하고, 60초 만에 기관급 딜카드와 모바일 매거진을 생성합니다.
            </p>
          </div>
        )}

        {/* Persona Split Selection */}
        <div className="space-y-3 pt-2">
          <div className="text-center">
            <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              어떤 목적으로 방문하셨나요?
            </span>
          </div>

          {/* Option A: For Brokers */}
          <div className="bg-white border border-blue-200 hover:border-blue-400 rounded-2xl p-5 transition-all shadow-sm group">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-700 group-hover:scale-105 transition-transform">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-base font-bold text-slate-900">공인중개사 / 중개법인 담당자</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    추천
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  방금 보신 것과 동일한 수준의 딜카드, IM, 주간 매거진을 무료로 60초 만에 직접 생성해보세요.
                </p>
                <div className="space-y-1.5 text-sm text-slate-600 mb-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>카톡 메모 복붙 시 공적장부·시세 자동 파싱</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>고객에게 바로 발송 가능한 원클릭 카톡 카드</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>포스처 맞춤형 기관급 PPTX 제안서 즉시 다운로드</span>
                  </div>
                </div>

                <Link
                  href={`/signup?ref=powered-by&ctx=${encodeURIComponent(ctx)}${buildingData && refId ? `&buildingId=${encodeURIComponent(refId)}` : ""}`}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>공인중개사 무료 시작하기 (1분 소요)</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            </div>
          </div>

          {/* Option B: For Investors / Property Owners */}
          <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition-all shadow-sm group">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700 group-hover:scale-105 transition-transform">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold text-slate-900 block mb-1">
                  투자자 / 건물주 / 사옥 검토 법인
                </span>
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  비공개 매물 정보와 서울 핵심 상권의 실거래 분석 위클리 리포트를 정기 구독하세요.
                </p>

                {safeBrokerSlug ? (
                  <Link
                    href={`/magazine/${safeBrokerSlug}/subscribe?ref=powered-by`}
                    className="w-full min-h-[44px] py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>담당 공인중개사의 주간 매거진 구독하기</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link
                    href="/hub"
                    className="w-full min-h-[44px] py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>서울 권역별 시장 동향 & 매물 탐색하기</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Social Proof Stats */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-2.5 text-center">
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <div className="text-base font-extrabold text-slate-900">60초</div>
            <div className="text-sm text-slate-600 mt-0.5">딜카드 생성 시간</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <div className="text-base font-extrabold text-emerald-700">100%</div>
            <div className="text-sm text-slate-600 mt-0.5">공적장부 검증</div>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <div className="text-base font-extrabold text-blue-700">97%</div>
            <div className="text-sm text-slate-600 mt-0.5">자료작성 시간 절약</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-600">
        <p>© {new Date().getFullYear()} CREDEAL Inc. All rights reserved. Data verified via Public Real Estate Ledger.</p>
      </footer>
    </div>
  );
}
