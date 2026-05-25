'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface ImLiteSection {
  sectionId: string;
  title: string;
  locked: boolean;
  required: boolean;
}

interface ImLitePlanResult {
  eligible: boolean;
  reason?: string;
  sections: ImLiteSection[];
}

export default function ImLiteViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<ImLitePlanResult | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch(`/api/broker/buildings/${id}/studio`);
        if (!res.ok) throw new Error('Failed to fetch building data');
        const data = await res.json();
        
        setScore(data.completenessScore);
        
        // Map checklist back to available layers for the engine
        const availableLayers: string[] = [];
        if (data.checklist.rentRoll) availableLayers.push('rent_roll');
        if (data.checklist.buildingRegister) availableLayers.push('building_register');
        if (data.checklist.floorPlan) availableLayers.push('floor_plan');
        
        // Simulating the engine logic on the frontend to show the UI
        const isEligible = data.completenessScore >= 80;
        const sections: ImLiteSection[] = [
          { sectionId: '01_summary', title: 'Executive Summary', locked: false, required: true },
          { sectionId: '02_property_overview', title: 'Property Overview', locked: false, required: true },
          { sectionId: '03_location_analysis', title: 'Location Analysis', locked: false, required: true },
          { sectionId: '04_building_specs', title: 'Building Specs', locked: false, required: true },
          { sectionId: '05_tenant_mix', title: 'Tenant Mix', locked: !availableLayers.includes('rent_roll'), required: true },
          { sectionId: '06_cash_flow', title: 'Cash Flow Ref', locked: !availableLayers.includes('rent_roll'), required: true },
          { sectionId: '07_risk_factors', title: 'Risk Factors', locked: false, required: true },
          { sectionId: '08_next_steps', title: 'Next Steps', locked: false, required: true },
          { sectionId: '09_missing_data', title: 'Missing Data', locked: false, required: true },
          { sectionId: '10_disclaimer', title: 'Disclaimer', locked: false, required: true },
        ];

        setPlan({
          eligible: isEligible,
          reason: isEligible ? undefined : 'completeness_insufficient',
          sections: isEligible ? sections : []
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlan();
  }, [id]);

  if (loading) return <div className="text-neutral-400 py-10 text-center animate-pulse">IM Lite 구성을 불러오는 중입니다...</div>;
  if (!plan) return <div className="text-red-400 py-10 text-center">데이터를 가져오지 못했습니다.</div>;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center no-print">
        <Link href={`/broker/buildings/${id}/studio`} className="text-sm text-neutral-400 hover:text-white transition-colors">
          ← 스튜디오로 돌아가기
        </Link>
        <div className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full font-mono uppercase font-bold">
           v0.3 IM Lite Draft
        </div>
      </div>

      <div className="text-center space-y-4">
         <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">IM Lite 뷰어 (초안 생성기)</h1>
         <p className="text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            IM Lite는 자산의 핵심 정보를 10페이지 내외로 압축한 티저 형태의 투자설명서입니다.<br/>
            SSoT 완성도 80점 이상일 때 전체 구조가 해제되며, 임대차 정보 유무에 따라 일부 섹션이 제한될 수 있습니다.
         </p>
      </div>

      {!plan.eligible ? (
        <div className="bg-neutral-900 border border-red-900/50 rounded-xl p-8 text-center shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50"></div>
           <span className="text-5xl block mb-4">🔒</span>
           <h2 className="text-xl font-bold text-white mb-2">IM Lite 생성 불가 (완성도 부족)</h2>
           <p className="text-neutral-400 mb-6 max-w-md mx-auto">
             현재 완성도 점수는 <strong className="text-red-400">{score}점</strong>입니다. IM Lite를 구성하려면 최소 <strong>80점</strong> 이상의 완성도가 필요합니다.
           </p>
           <Link href={`/broker/buildings/${id}/studio`} className="inline-block px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-bold transition-colors border border-neutral-700">
             데이터 보강하러 가기
           </Link>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
           <div className="bg-neutral-950 p-6 border-b border-neutral-800 flex justify-between items-center">
              <div>
                 <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="text-orange-500">📑</span> IM Lite 문서 목차 구성
                 </h2>
                 <p className="text-sm text-neutral-500 mt-1">AI가 생성할 10개의 핵심 섹션입니다.</p>
              </div>
              <button 
                disabled={true}
                className="px-5 py-2.5 bg-orange-500/50 text-white opacity-50 cursor-not-allowed rounded-lg text-sm font-bold border border-orange-500/50"
                title="v0.4에서 본문 자동 생성 기능이 오픈됩니다."
              >
                본문 생성하기 (v0.4 예정)
              </button>
           </div>
           
           <div className="divide-y divide-neutral-800/50">
              {plan.sections.map((sec, idx) => (
                <div key={sec.sectionId} className={`p-5 flex items-center justify-between transition-colors hover:bg-neutral-800/30 ${sec.locked ? 'bg-neutral-950/50' : ''}`}>
                   <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold ${sec.locked ? 'bg-neutral-800 text-neutral-600' : 'bg-orange-500/20 text-orange-400'}`}>
                         {idx + 1}
                      </div>
                      <div>
                         <h3 className={`text-base font-semibold ${sec.locked ? 'text-neutral-600' : 'text-neutral-200'}`}>
                           {sec.title}
                         </h3>
                         <p className="text-xs text-neutral-500 mt-0.5">
                           {sec.locked ? '해당 데이터(Rent Roll 등)가 입력되지 않아 잠금 처리됨' : '섹션 생성 가능 상태 (데이터 충분)'}
                         </p>
                      </div>
                   </div>
                   <div>
                      {sec.locked ? (
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-red-900/20 text-red-400 border border-red-900/30 rounded-md text-xs font-medium">
                          <span className="text-sm">🔒</span> 데이터 잠금
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-green-900/20 text-green-400 border border-green-900/30 rounded-md text-xs font-medium">
                          <span className="text-sm">✅</span> 생성 준비완료
                        </span>
                      )}
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
