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

  const [loading, setLoading] = useState(true);
  const [intelData, setIntelData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchIntel() {
      try {
        const res = await fetch(`/api/broker/morning-intelligence?region=${region}`);
        if (!res.ok) throw new Error("Failed to fetch intel");
        const json = await res.json();
        setIntelData(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchIntel();
  }, [region]);

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
                  {section === "rentals" && "한국부동산원 임대동향조사 및 실시간 매물 데이터를 기반으로 집계되었습니다."}
                  {section === "auctions" && "대법원 경매정보 시스템에서 수집된 실시간 경매 신건 내역입니다."}
                  {section === "permits" && "건축행정시스템(세움터) 오픈 API에서 수집된 인허가 정보입니다."}
                  {section === "briefing" && "다양한 뉴스 소스와 공공 데이터를 취합하여 AI가 생성한 요약본입니다."}
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
                {section === "transactions" && intelData?.yesterdayTransactions && (
                  <div className="space-y-4">
                    {intelData.yesterdayTransactions.map((tx: any, idx: number) => (
                      <div key={idx} className="p-4 bg-white/3 rounded-xl border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-xs font-bold text-rose-300">{tx.buildingName || tx.assetType} | {tx.price}억 원</span>
                           <span className="text-[10px] text-slate-500">{tx.date} 체결</span>
                        </div>
                        <p className="text-xs text-slate-300 mb-2">{tx.address}</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                           <div className="bg-black/20 p-2 rounded-lg">대지면적: {tx.landArea}㎡</div>
                           <div className="bg-black/20 p-2 rounded-lg">연면적: {tx.floorArea}㎡</div>
                           <div className="bg-black/20 p-2 rounded-lg">평당가: {tx.pricePerPyeong}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {section === "rentals" && (
                  <div className="space-y-4">
                    {/* 한국부동산원 공식 임대동향 */}
                    {intelData?.rentalTrend && (
                      <div className="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/15">
                        <h4 className="text-xs font-bold text-indigo-300 mb-3 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5" /> 한국부동산원 공식 임대동향
                          <span className="text-[9px] text-slate-500 ml-auto">{intelData.rentalTrend.quarter}</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-black/20 p-3 rounded-lg text-center">
                            <div className="text-[10px] text-slate-400 mb-1">공실률</div>
                            <div className="text-lg font-bold text-rose-400">{intelData.rentalTrend.vacancyRate}%</div>
                          </div>
                          <div className="bg-black/20 p-3 rounded-lg text-center">
                            <div className="text-[10px] text-slate-400 mb-1">임대가격지수</div>
                            <div className="text-lg font-bold text-emerald-400">{intelData.rentalTrend.rentalIndex}</div>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-2">출처: {intelData.rentalTrend.source}</p>
                      </div>
                    )}
                    {/* 네이버뉴스 기반 임대시세 */}
                    {intelData?.rentalMarket && intelData.rentalMarket.length > 0 ? (
                      intelData.rentalMarket.map((r: any, idx: number) => (
                        <div key={idx} className="p-4 bg-white/3 rounded-xl border border-white/5">
                          <h4 className="text-xs font-bold text-white mb-2">{r.type}</h4>
                          <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div className="bg-black/20 p-2 rounded-lg">보증금: {r.deposit}</div>
                            <div className="bg-black/20 p-2 rounded-lg">월세: {r.rent}</div>
                            <div className="bg-black/20 p-2 rounded-lg">공실률: {r.vacancy}</div>
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2">출처: {r.source}</p>
                        </div>
                      ))
                    ) : !intelData?.rentalTrend && (
                      <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/15 text-center">
                        <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">임대시장 데이터를 수집 중입니다.</p>
                        <p className="text-[10px] text-slate-500 mt-1">Cron 작업이 실행되면 자동으로 채워집니다.</p>
                      </div>
                    )}
                  </div>
                )}

                {section === "auctions" && intelData?.auctions && (
                  <div className="space-y-4">
                    {intelData.auctions.map((auc: any, idx: number) => (
                      <div key={idx} className="p-4 bg-white/3 rounded-xl border border-white/5">
                        <h4 className="text-xs font-bold text-white mb-2">사건번호: {auc.caseNo}</h4>
                        <ul className="text-xs text-slate-300 space-y-2">
                          <li><strong>법원:</strong> {auc.court}</li>
                          <li><strong>감정가:</strong> {auc.appraisalValue} 원</li>
                          <li><strong>최저가:</strong> {auc.minimumValue} 원 ({auc.status})</li>
                          <li><strong>매각기일:</strong> {auc.auctionDate}</li>
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {section === "permits" && intelData?.constructionPermits && (
                  <div className="space-y-4">
                    {intelData.constructionPermits.map((permit: any, idx: number) => (
                      <div key={idx} className="p-4 bg-white/3 rounded-xl border border-white/5">
                        <h4 className="text-xs font-bold text-white mb-2">{permit.text}</h4>
                        <p className="text-xs text-slate-300">{permit.detail}</p>
                      </div>
                    ))}
                  </div>
                )}

                {section === "briefing" && intelData?.briefing && (
                  <div className="p-4 bg-white/3 rounded-xl border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {intelData.briefing}
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
