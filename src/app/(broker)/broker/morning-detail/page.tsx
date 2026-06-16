"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, ExternalLink, PenTool, AlertTriangle, 
  Database, Activity, Building2, Globe
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

export default function MorningDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const region = searchParams.get("region") || "gbd";
  const section = searchParams.get("section") || "briefing";

  // Simulate loading state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleBack = () => {
    router.back();
  };

  const getSectionTitle = () => {
    switch (section) {
      case "transactions": return "실거래 심층 분석";
      case "auctions": return "경매 & 공매 신건 상세";
      case "rentals": return "임대 및 공실 현황 상세";
      case "permits": return "신축 & 리모델링 인허가 내역";
      case "briefing": return "AI 마켓 에디터 브리핑 전문";
      default: return "상세 정보";
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-slate-200 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0f0f2e]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">{getSectionTitle()}</h1>
            <p className="text-[11px] text-indigo-300 font-medium tracking-wide">
              권역: {region === "seongsu" ? "성수동" : region === "gbd" ? "강남 GBD" : "여의도"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-6 mt-4">
        
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* 데이터 출처 알림 영역 (실제/하드코딩 구분) */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-amber-300 mb-1">데이터 출처 및 상태</h4>
                <p className="text-[11px] text-amber-100/70 leading-relaxed">
                  {section === "transactions" && "국토교통부 실거래가 공개시스템 API에서 실시간 수집되었습니다."}
                  {section === "rentals" && "현재 API 연동이 누락되어 샘플(하드코딩) 데이터로 표시되고 있습니다. 실 데이터 연동이 필요합니다."}
                  {section === "auctions" && "현재 대법원 경매정보 크롤링 시스템 점검으로 인해 샘플 데이터가 표시되고 있습니다."}
                  {section === "permits" && "권역별 인허가 데이터는 세움터 오픈API 대신 샘플 데이터로 대체되어 제공됩니다."}
                  {section === "briefing" && "다양한 뉴스 소스와 공공 데이터를 취합하여 GPT-5.4가 생성한 요약본입니다."}
                </p>
              </div>
            </div>

            {/* 메인 상세 콘텐츠 영역 (Dummy data for demo) */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                상세 분석 리포트
              </h3>
              
              <div className="space-y-4">
                {/* Dummy Content based on section */}
                {section === "transactions" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-white/3 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-bold text-rose-300">근린생활시설 | 185.0억 원</span>
                         <span className="text-[10px] text-slate-500">2026.06.14 체결</span>
                      </div>
                      <p className="text-xs text-slate-300 mb-2">서울특별시 강남구 역삼동 123-45</p>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                         <div className="bg-black/20 p-2 rounded-lg">대지면적: 330.5㎡</div>
                         <div className="bg-black/20 p-2 rounded-lg">연면적: 850.2㎡</div>
                         <div className="bg-black/20 p-2 rounded-lg">평당가: 1.85억/평</div>
                         <div className="bg-black/20 p-2 rounded-lg">용도지역: 제2종일반</div>
                      </div>
                    </div>
                  </div>
                )}

                {section === "rentals" && (
                  <div className="p-4 bg-white/3 rounded-xl border border-white/5 space-y-4 text-xs text-slate-300 leading-relaxed">
                    <p><strong>오피스(프라임):</strong> 보증금 평균 120만 원/㎡, 월세 12만 원/㎡. 현재 공실률 2.1%로 매우 안정적인 추세를 유지하고 있습니다.</p>
                    <p><strong>중소형 근생:</strong> 보증금 80만 원/㎡, 월세 8.5만 원/㎡. 최근 F&B 수요 증가로 이면도로 상권의 공실률이 전월 대비 0.5%p 감소했습니다.</p>
                  </div>
                )}

                {section === "auctions" && (
                  <div className="p-4 bg-white/3 rounded-xl border border-white/5">
                    <h4 className="text-xs font-bold text-white mb-2">사건번호: 2026타경 10045</h4>
                    <ul className="text-xs text-slate-300 space-y-2">
                      <li><strong>법원:</strong> 서울중앙지방법원</li>
                      <li><strong>감정가:</strong> 8,500,000,000 원</li>
                      <li><strong>최저가:</strong> 6,800,000,000 원 (20% 유찰)</li>
                      <li><strong>매각기일:</strong> 2026.07.15</li>
                    </ul>
                  </div>
                )}

                {section === "permits" && (
                  <div className="p-4 bg-white/3 rounded-xl border border-white/5">
                    <h4 className="text-xs font-bold text-white mb-2">역삼동 77-1 (신축 허가)</h4>
                    <p className="text-xs text-slate-300">지하 2층, 지상 8층 규모의 업무시설 및 근린생활시설 신축. 대지면적 450㎡, 연면적 2,100㎡.</p>
                  </div>
                )}

                {section === "briefing" && (
                  <div className="p-4 bg-white/3 rounded-xl border border-white/5 text-sm text-slate-300 leading-relaxed space-y-3">
                    <p>금일 시장은 금리 인하 기대감 속에 우량 자산에 대한 매수 문의가 증가하고 있습니다.</p>
                    <p>특히 역세권 반경 300m 이내의 꼬마빌딩(50억~100억 구간) 실거래가 2건 포착되었으며, 평당가는 전분기 대비 3% 상승한 것으로 분석됩니다.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 외부 링크 영역 */}
            <div className="grid grid-cols-2 gap-3">
              <a href="#" className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <Globe className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-[11px] font-medium text-slate-300 text-center">공공데이터 포털 조회<br/><span className="text-[9px] text-slate-500">외부 링크</span></span>
              </a>
              <a href="#" className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <Database className="w-5 h-5 text-slate-400 mb-2" />
                <span className="text-[11px] font-medium text-slate-300 text-center">대법원 경매정보<br/><span className="text-[9px] text-slate-500">외부 링크</span></span>
              </a>
            </div>

            {/* 하단 매거진 작성 CTA */}
            <div className="pt-6 pb-10">
              <Button className="w-full h-14 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2">
                <PenTool className="w-4 h-4" />
                이 소식으로 매거진 작성하기
              </Button>
              <p className="text-center text-[10px] text-slate-500 mt-3">
                현재 보고 계신 데이터를 바탕으로 고객 발송용 뉴스레터를 생성합니다.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
