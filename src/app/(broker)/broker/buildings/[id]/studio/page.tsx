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

// WP-7.3D P1-5: daylight palette (white/slate-50 surfaces, slate-900/700 text), ≥14px, 48px targets.
const DONE_BADGE = 'text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md';
const TODO_BADGE = 'text-sm font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md';
const CHECK_LINK =
  'group flex min-h-[48px] items-center justify-between gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 hover:border-slate-300';
const OUTPUT_CHIP = 'px-3 py-1.5 rounded-full text-sm font-semibold border';

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

  if (loading) return <div className="text-slate-700 text-base py-10 text-center animate-pulse">스튜디오 정보를 불러오는 중입니다...</div>;
  if (!status) return <div role="alert" className="text-red-700 text-base py-10 text-center">스튜디오 정보를 가져오지 못했습니다.</div>;

  const { completenessScore, layerScores, checklist, eligibleOutputs } = status;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Overview Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <span className="text-blue-700">✦</span> SSoT 완결성 및 자산 신뢰도 가이드
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2">필수 데이터 입력 (입력 시 완성도 상향)</h3>
            <div className="flex flex-col gap-3">
              <Link href={`/broker/buildings/${id}/studio/lease`} className={CHECK_LINK}>
                <span className="text-sm text-slate-900 font-medium">🏢 임대차 롤 (Rent Roll) 상세 입력</span>
                {checklist.rentRoll ? <span className={DONE_BADGE}>완료</span> : <span className={TODO_BADGE}>미입력</span>}
              </Link>
              <Link href={`/broker/buildings/${id}/studio/files`} className={CHECK_LINK}>
                <span className="text-sm text-slate-900 font-medium">📁 증빙 서류 업로드 (등기부, 평면도 등)</span>
                {checklist.buildingRegister || checklist.photos || checklist.floorPlan ? <span className={DONE_BADGE}>일부 완료</span> : <span className={TODO_BADGE}>필요</span>}
              </Link>
              <Link href={`/broker/buildings/${id}/studio/disclosure`} className={CHECK_LINK}>
                <span className="text-sm text-slate-900 font-medium">🔒 민감 정보 공개 범위 설정</span>
                {checklist.disclosurePolicy ? <span className={DONE_BADGE}>완료</span> : <span className={TODO_BADGE}>미설정</span>}
              </Link>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2">생성 가능한 산출물 (자동 생성)</h3>
            {eligibleOutputs.length === 0 ? (
              <div className="text-sm text-slate-700 p-4 bg-slate-50 rounded-lg border border-slate-200">데이터가 부족하여 자동 산출물을 생성할 수 없습니다. SSoT 완성도 20점 이상이 필요합니다.</div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {eligibleOutputs.includes('deal_curiosity_report') && <span className={`${OUTPUT_CHIP} bg-blue-50 text-blue-800 border-blue-200`}>Deal Curiosity Report</span>}
                {eligibleOutputs.includes('blind_teaser') && <span className={`${OUTPUT_CHIP} bg-green-50 text-green-800 border-green-200`}>Blind Teaser</span>}
                {eligibleOutputs.includes('building_snapshot_draft') && <span className={`${OUTPUT_CHIP} bg-purple-50 text-purple-800 border-purple-200`}>Snapshot Draft (v0.3)</span>}
                {eligibleOutputs.includes('im_lite') && <span className={`${OUTPUT_CHIP} bg-orange-50 text-orange-800 border-orange-200`}>IM Lite Draft (v0.3)</span>}
                {eligibleOutputs.includes('full_im_candidate') && <span className={`${OUTPUT_CHIP} bg-red-50 text-red-800 border-red-200`}>Full IM Candidate</span>}
              </div>
            )}
            <div className="flex gap-3 mt-4 pt-2">
               {eligibleOutputs.includes('building_snapshot_draft') && (
                 <Link href={`/broker/buildings/${id}/snapshot`} className="flex-1 inline-flex min-h-[48px] items-center justify-center text-center py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-sm font-bold transition-colors border border-blue-200">
                   스냅샷 뷰어 열기
                 </Link>
               )}
               {eligibleOutputs.includes('im_lite') && (
                 <Link href={`/broker/w/im?buildingId=${encodeURIComponent(id)}`} className="flex-1 inline-flex min-h-[48px] items-center justify-center text-center py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-800 rounded-lg text-sm font-bold transition-colors border border-orange-200">
                   IM 작업실 열기
                 </Link>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Layer Scores Accordion / Details */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
         <h3 className="text-sm font-semibold text-slate-700 mb-5 flex items-center gap-2">
            📊 레이어별 세부 완성도 내역 <span className="text-sm font-normal text-slate-700 ml-auto">총점: {completenessScore}/100</span>
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
                 <div key={item.key} className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-3 px-4 bg-slate-50 rounded-lg border border-slate-200">
                   <div className="flex items-center gap-2 mb-2 sm:mb-0">
                     <span className={`w-2 h-2 rounded-full ${score > 0 ? (ratio === 1 ? 'bg-blue-700' : 'bg-amber-500') : 'bg-slate-300'}`}></span>
                     <span className="text-sm font-medium text-slate-900">{item.label}</span>
                   </div>
                   <div className="flex items-center gap-4 w-full sm:w-auto pl-4 sm:pl-0">
                     <div className="flex-1 sm:w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                       <div 
                          className={`h-full transition-all duration-1000 ${ratio === 1 ? 'bg-blue-700' : 'bg-amber-500'}`} 
                          style={{ width: `${ratio * 100}%` }}
                       />
                     </div>
                     <span className="text-sm font-mono font-bold text-slate-900 w-12 text-right">
                        {score}<span className="text-slate-700 font-normal">/{item.max}</span>
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
