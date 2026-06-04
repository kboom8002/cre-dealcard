"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function InteractiveCurationToolsPage() {
  // C5: Tax Simulator State
  const [purchasePrice, setPurchasePrice] = useState<number>(100); // 100억
  const [holdingPeriod, setHoldingPeriod] = useState<number>(3); // 3년
  const [annualRentIncome, setAnnualRentIncome] = useState<number>(4.5); // 4.5% 수익률

  // Calculators
  const acquisitionTax = purchasePrice * 0.046; // 4.6% standard CRE acquisition tax
  const capitalGainsTax = purchasePrice * 0.15; // Rough estimate of tax on 3-year standard gains
  const annualYield = (purchasePrice * (annualRentIncome / 100));

  // C4: Due Diligence Checklist State
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    "register": true,
    "building_book": true,
    "zoning": false,
    "lease_contract": false,
    "occupancy": false,
    "energy": false,
    "soil": false
  });

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const ddProgress = Math.round(
    (Object.values(checkedItems).filter(Boolean).length / Object.keys(checkedItems).length) * 100
  );

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-2">
              🛠️ CRE 빌딩 투자 도구 & 큐레이션
            </h1>
            <p className="text-[10px] text-slate-400">
              세금 시뮬레이터 · 실사 DD 체크리스트 · Agora 세무 팁
            </p>
          </div>
          <Link href="/insight" className="text-xs text-slate-400 hover:text-white">← Insight</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* C5: 취득세/양도세 시뮬레이터 */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <h2 className="text-sm font-bold text-white">취득세 및 매수 수지 분석 시뮬레이터 (C5)</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>예상 매입 가격</span>
                <span className="text-indigo-400 font-bold">{purchasePrice} 억원</span>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>연 임대수익률</span>
                  <span className="text-emerald-400 font-bold">{annualRentIncome} %</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={annualRentIncome}
                  onChange={(e) => setAnnualRentIncome(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>보유 기간</span>
                  <span className="text-amber-400 font-bold">{holdingPeriod} 년</span>
                </label>
                <input
                  type="number"
                  value={holdingPeriod}
                  onChange={(e) => setHoldingPeriod(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">취득세 (지방교육세/농특세 포함 4.6%)</span>
              <span className="font-bold text-white">{acquisitionTax.toFixed(2)} 억원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">보유기 기간 총 임대수익 (세전)</span>
              <span className="font-bold text-emerald-400">{(annualYield * holdingPeriod).toFixed(2)} 억원</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">매각 시 예상 법인세/양도세 (추정)</span>
              <span className="font-bold text-amber-400">{capitalGainsTax.toFixed(2)} 억원</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-bold">
              <span className="text-white">실제 소요 자기자본 (세금포함 에쿼티)</span>
              <span className="text-indigo-400">{(purchasePrice * 0.4 + acquisitionTax).toFixed(2)} 억원 (LTV 60% 가정)</span>
            </div>
          </div>
        </section>

        {/* C4: 매수 실사 Due Diligence 체크리스트 */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-sm font-bold text-white">건물 매수 실사 DD 체크리스트 (C4)</h2>
            </div>
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
              진행률 {ddProgress}%
            </span>
          </div>

          <div className="space-y-2.5">
            {[
              { id: "register", label: "등기부등본 권리 분석 (근저당, 가압류 여부 확인)", category: "법률" },
              { id: "building_book", label: "건축물대장 상 위반건축물 및 무단 용도변경 여부", category: "공학" },
              { id: "zoning", label: "토지이용계획 상 신축/증축 용적률 및 제한구역 확인", category: "행정" },
              { id: "lease_contract", label: "기존 임차인 임대차계약서 및 제소전화해 조서 검토", category: "임대" },
              { id: "occupancy", label: "실제 유동인구 및 실질 공실률 현장 실사", category: "시장" },
              { id: "energy", label: "연간 에너지 사용량 및 보일러/엘리베이터 노후도 진단", category: "시설" },
            ].map((item) => (
              <div
                key={item.id}
                onClick={() => toggleCheck(item.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  checkedItems[item.id]
                    ? "bg-indigo-950/20 border-indigo-500/30"
                    : "bg-slate-950 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center text-[10px] ${
                  checkedItems[item.id] ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-600"
                }`}>
                  {checkedItems[item.id] && "✓"}
                </div>
                <div className="flex-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{item.category}</span>
                  <p className="text-xs text-slate-300 mt-0.5">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* C2: Agora 인기 세무 팁 큐레이션 */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">💡</span>
            <h2 className="text-sm font-bold text-white">아고라 인기 세무 팁 & 가이드 (C2)</h2>
          </div>

          <div className="space-y-3">
            {[
              { title: "개인 vs 법인 꼬마빌딩 매수 시 세금 혜택 총정리", views: 1250, likes: 98, date: "3일 전" },
              { title: "상가건물 임대보증금 간주임대료 부가세 계산법", views: 840, likes: 45, date: "1주 전" },
              { title: "밸류애드(리모델링) 공사비 취득세 과세표준 포함 기준", views: 1560, likes: 112, date: "2주 전" },
            ].map((tip, idx) => (
              <div key={idx} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 hover:border-indigo-500/20 transition-all cursor-pointer">
                <p className="text-xs font-semibold text-white">{tip.title}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2">
                  <span>👁️ {tip.views}</span>
                  <span>❤️ {tip.likes}</span>
                  <span>{tip.date}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* C1: AI 추천 뜨는 권역 분석 */}
        <section className="bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <h2 className="text-sm font-bold text-white">AI 추천 밸류애드 유망 권역 분석 (C1)</h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            최근 3개월간 지자체 인허가 대장 및 국토부 용도변경 이력 데이터 수집 결과, <strong>성수동 2가 지식산업센터 인근</strong>과 <strong>용산 한강로 권역</strong>의 2종일반주거지역 필지의 근린생활시설 용도변경 건수가 전년 대비 180% 폭증했습니다. 이 지역의 단독주택을 인수한 후 근생으로 신축/리모델링 시 가장 높은 Cap Rate 마진 확보가 가능할 것으로 분석됩니다.
          </p>
        </section>

      </div>
    </main>
  );
}
