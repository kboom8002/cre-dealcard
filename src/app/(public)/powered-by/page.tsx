import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration, buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import {
  ShieldCheck,
  Building2,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Briefcase,
  UserCheck,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "CREDEAL — 60초 만에 기관급 딜카드 & 매거진 생성",
  description:
    "대한민국 CRE 중개인을 위한 AI 딜 인텔리전스 플랫폼. 메모 1줄로 검증된 딜카드와 모바일 매거진을 자동 발행하세요.",
};

interface PoweredByPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PoweredByPage({ searchParams }: PoweredByPageProps) {
  const resolvedParams = await searchParams;
  const ctx = typeof resolvedParams.ctx === "string" ? resolvedParams.ctx : "dealcard";
  const refId = typeof resolvedParams.ref === "string" ? resolvedParams.ref : undefined;
  const brokerSlug = typeof resolvedParams.broker === "string" ? resolvedParams.broker : undefined;

  let buildingData: {
    title: string;
    areaSignal?: string;
    priceBand?: string;
    assetType?: string;
  } | null = null;

  if (refId) {
    try {
      const { data: bData } = await readWithMigration(refId);
      if (bData) {
        const attrs = buildAttrsFromSsotLite(bData as Record<string, any>);
        buildingData = {
          title: (bData as any).address || (bData as any).title || "서울 핵심권역 상업용 빌딩",
          areaSignal: (bData as any).area_signal || (attrs.region as string) || "핵심 상권",
          priceBand: (bData as any).price_band || (attrs.priceBand as string) || "가격 협의",
          assetType: (bData as any).asset_type || (attrs.assetType as string) || "상업용 부동산",
        };
      }
    } catch {
      // Fallback if building cannot be fetched
    }
  }

  const contextLabelMap: Record<string, string> = {
    dealcard: "블라인드 딜카드",
    magazine: "모바일 위클리 매거진",
    im: "기관급 투자제안서(IM)",
  };

  const contextName = contextLabelMap[ctx] || "딜 인텔리전스 리포트";

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-b from-indigo-600/15 via-emerald-600/10 to-transparent rounded-full blur-3xl opacity-60" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold tracking-tight text-white text-base">CREDEAL</span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Intelligence
            </span>
          </Link>

          <Link
            href="/login"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            로그인
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 max-w-xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Context Hook Card (If referred by a specific deal card or magazine) */}
        {buildingData ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold mb-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>방금 확인하신 {contextName}의 검증 원천</span>
            </div>
            <h2 className="text-base font-bold text-white mb-2">
              {buildingData.title}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/5">
                {buildingData.areaSignal}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/5">
                {buildingData.assetType}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">
                {buildingData.priceBand}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-800/80 leading-relaxed">
              본 자료는 공적장부 교차 검증과 AI 밸류에이션 엔진으로 위조 방지 및 블라인드 보호 처리된 산출물입니다.
            </p>
          </div>
        ) : (
          <div className="text-center space-y-2 py-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Institutional Grade Real Estate AI</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              전문 중개인을 위한 차세대 딜 엔진
            </h1>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              카카오톡 메모 1줄로 공적장부를 자동 조회하고, 60초 만에 기관급 딜카드와 모바일 매거진을 생성합니다.
            </p>
          </div>
        )}

        {/* Persona Split Selection */}
        <div className="space-y-3 pt-2">
          <div className="text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              어떤 목적으로 방문하셨나요?
            </span>
          </div>

          {/* Option A: For Brokers */}
          <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 hover:border-indigo-500/60 rounded-2xl p-4.5 transition-all shadow-lg hover:shadow-indigo-500/10 group">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400 group-hover:scale-105 transition-transform">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">공인중개사 / 중개법인 담당자</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    추천
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  방금 보신 것과 동일한 수준의 딜카드, IM, 주간 매거진을 무료로 60초 만에 직접 생성해보세요.
                </p>
                <div className="space-y-1.5 text-[11px] text-slate-400 mb-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>카톡 메모 복붙 시 공적장부·시세 자동 파싱</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>고객에게 바로 발송 가능한 원클릭 카톡 카드</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>30페이지 기관급 PPTX 제안서 즉시 다운로드</span>
                  </div>
                </div>

                <Link
                  href={`/signup?ref=powered-by&ctx=${ctx}${refId ? `&buildingId=${refId}` : ""}`}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>중개사 무료 시작하기 (1분 소요)</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </div>
            </div>
          </div>

          {/* Option B: For Investors / Property Owners */}
          <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4.5 transition-all shadow-md group">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400 group-hover:scale-105 transition-transform">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-white block mb-1">
                  투자자 / 건물주 / 사옥 검토 법인
                </span>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  비공개 매물 정보와 서울 핵심 상권의 실거래 분석 위클리 리포트를 정기 구독하세요.
                </p>

                {brokerSlug ? (
                  <Link
                    href={`/magazine/${brokerSlug}/subscribe?ref=powered-by`}
                    className="w-full py-2.5 rounded-xl border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>담당 중개사의 주간 매거진 구독하기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <Link
                    href="/explore"
                    className="w-full py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>서울 권역별 시장 동향 & 매물 탐색하기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Social Proof Stats */}
        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-white/5">
            <div className="text-base font-extrabold text-white">60초</div>
            <div className="text-[10px] text-slate-400 mt-0.5">딜카드 생성 시간</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-white/5">
            <div className="text-base font-extrabold text-emerald-400">100%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">공적장부 검증</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-white/5">
            <div className="text-base font-extrabold text-indigo-400">97%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">자료작성 시간 절약</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 px-4 py-4 text-center text-[10px] text-slate-600">
        <p>© {new Date().getFullYear()} CREDEAL Inc. All rights reserved. Data verified via Public Real Estate Ledger.</p>
      </footer>
    </div>
  );
}
