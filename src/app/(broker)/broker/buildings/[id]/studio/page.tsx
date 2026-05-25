'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface StudioStatus {
  completenessScore: number;
  layerScores: {
    building_register: number;
    registry_docs: number;
    land_use_plan: number;
    rent_roll: number;
    photos: number;
    floor_plan: number;
    repair_history: number;
    vacancy_docs: number;
    asking_price: number;
    disclosure_policy: number;
    total: number;
  };
  checklist: Record<string, boolean>;
  eligibleOutputs: string[];
}

export default function StudioDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/broker/buildings/${id}/studio`);
        if (!res.ok) throw new Error('Failed to fetch studio status');
        const data = await res.json();
        setStatus(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [id]);

  if (loading) return <div className="text-neutral-400 py-10 text-center animate-pulse">스튜디오 정보를 불러오는 중입니다...</div>;
  if (!status) return <div className="text-red-400 py-10 text-center">스튜디오 정보를 가져오지 못했습니다.</div>;

  const { completenessScore, layerScores, checklist, eligibleOutputs } = status;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Overview Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <span className="text-primary">✦</span> SSoT 완결성 및 자산 신뢰도 가이드
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-300 border-b border-neutral-800 pb-2">필수 데이터 입력 (입력 시 완성도 상향)</h3>
            <div className="flex flex-col gap-3">
              <Link href={`/broker/buildings/${id}/studio/lease`} className="group flex items-center justify-between p-4 bg-neutral-950 hover:bg-neutral-800 rounded-lg transition-all border border-neutral-800 hover:border-neutral-700">
                <span className="text-sm text-neutral-200 font-medium group-hover:text-white transition-colors">🏢 임대차 롤 (Rent Roll) 상세 입력</span>
                {checklist.rentRoll ? <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">완료</span> : <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-md">미입력</span>}
              </Link>
              <Link href={`/broker/buildings/${id}/studio/files`} className="group flex items-center justify-between p-4 bg-neutral-950 hover:bg-neutral-800 rounded-lg transition-all border border-neutral-800 hover:border-neutral-700">
                <span className="text-sm text-neutral-200 font-medium group-hover:text-white transition-colors">📁 증빙 서류 업로드 (등기부, 평면도 등)</span>
                {checklist.buildingRegister || checklist.photos || checklist.floorPlan ? <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">일부 완료</span> : <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-md">필요</span>}
              </Link>
              <Link href={`/broker/buildings/${id}/studio/disclosure`} className="group flex items-center justify-between p-4 bg-neutral-950 hover:bg-neutral-800 rounded-lg transition-all border border-neutral-800 hover:border-neutral-700">
                <span className="text-sm text-neutral-200 font-medium group-hover:text-white transition-colors">🔒 민감 정보 공개 범위 설정</span>
                {checklist.disclosurePolicy ? <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md">완료</span> : <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-md">미설정</span>}
              </Link>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-300 border-b border-neutral-800 pb-2">생성 가능한 산출물 (자동 생성)</h3>
            {eligibleOutputs.length === 0 ? (
              <div className="text-sm text-neutral-500 p-4 bg-neutral-950 rounded-lg border border-neutral-800/50">데이터가 부족하여 자동 산출물을 생성할 수 없습니다. SSoT 완성도 20점 이상이 필요합니다.</div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {eligibleOutputs.includes('deal_curiosity_report') && <span className="px-3 py-1.5 bg-blue-900/30 text-blue-300 border border-blue-800/50 rounded-full text-xs font-semibold shadow-sm">Deal Curiosity Report</span>}
                {eligibleOutputs.includes('blind_teaser') && <span className="px-3 py-1.5 bg-green-900/30 text-green-300 border border-green-800/50 rounded-full text-xs font-semibold shadow-sm">Blind Teaser</span>}
                {eligibleOutputs.includes('building_snapshot_draft') && <span className="px-3 py-1.5 bg-purple-900/30 text-purple-300 border border-purple-800/50 rounded-full text-xs font-semibold shadow-sm">Snapshot Draft (v0.3)</span>}
                {eligibleOutputs.includes('im_lite') && <span className="px-3 py-1.5 bg-orange-900/30 text-orange-300 border border-orange-800/50 rounded-full text-xs font-semibold shadow-sm">IM Lite Draft (v0.3)</span>}
                {eligibleOutputs.includes('full_im_candidate') && <span className="px-3 py-1.5 bg-red-900/30 text-red-300 border border-red-800/50 rounded-full text-xs font-semibold shadow-sm">Full IM Candidate</span>}
              </div>
            )}
            <div className="flex gap-3 mt-4 pt-2">
               {eligibleOutputs.includes('building_snapshot_draft') && (
                 <Link href={`/broker/buildings/${id}/snapshot`} className="flex-1 text-center py-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-bold transition-colors border border-primary/20">
                   스냅샷 뷰어 열기
                 </Link>
               )}
               {eligibleOutputs.includes('im_lite') && (
                 <Link href={`/broker/buildings/${id}/im-lite`} className="flex-1 text-center py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-sm font-bold transition-colors border border-orange-500/20">
                   IM Lite 뷰어 열기
                 </Link>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Layer Scores Accordion / Details */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl">
         <h3 className="text-sm font-semibold text-neutral-300 mb-5 flex items-center gap-2">
            📊 레이어별 세부 완성도 내역 <span className="text-xs font-normal text-neutral-500 ml-auto">총점: {completenessScore}/100</span>
         </h3>
         <div className="space-y-3">
            {[
              { key: 'building_register', label: '건물 등기부등본', max: 20 },
              { key: 'rent_roll', label: '임대차 현황 (Rent Roll)', max: 25 },
              { key: 'registry_docs', label: '건축물대장', max: 15 },
              { key: 'land_use_plan', label: '토지이용계획', max: 10 },
              { key: 'photos', label: '현장 사진', max: 10 },
              { key: 'floor_plan', label: '층별 평면도', max: 10 },
              { key: 'repair_history', label: '수선/유지보수 이력', max: 5 },
              { key: 'vacancy_docs', label: '공실 현황 증명', max: 5 },
            ].map((item) => {
               const score = layerScores[item.key as keyof typeof layerScores] || 0;
               const ratio = score / item.max;
               return (
                 <div key={item.key} className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-3 px-4 bg-neutral-950 rounded-lg border border-neutral-800">
                   <div className="flex items-center gap-2 mb-2 sm:mb-0">
                     <span className={`w-2 h-2 rounded-full ${score > 0 ? (ratio === 1 ? 'bg-primary' : 'bg-yellow-500') : 'bg-neutral-700'}`}></span>
                     <span className="text-sm font-medium text-neutral-300">{item.label}</span>
                   </div>
                   <div className="flex items-center gap-4 w-full sm:w-auto pl-4 sm:pl-0">
                     <div className="flex-1 sm:w-32 h-2 bg-neutral-800 rounded-full overflow-hidden">
                       <div 
                          className={`h-full transition-all duration-1000 ${ratio === 1 ? 'bg-primary' : 'bg-yellow-500'}`} 
                          style={{ width: `${ratio * 100}%` }}
                       />
                     </div>
                     <span className="text-sm font-mono font-bold text-neutral-200 w-10 text-right">
                        {score}<span className="text-neutral-500 font-normal">/{item.max}</span>
                     </span>
                   </div>
                 </div>
               );
            })}
         </div>
      </div>
    </div>
  );
}
