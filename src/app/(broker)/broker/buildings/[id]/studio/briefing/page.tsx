'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudioTabs } from '@/components/studio/StudioTabs';

interface StudioStatus {
  ok: boolean;
  buildingId: string;
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
  checklist: {
    buildingRegister: boolean;
    registry: boolean;
    landUsePlan: boolean;
    rentRoll: boolean;
    photos: boolean;
    floorPlan: boolean;
    repairHistory: boolean;
    vacancyStatus: boolean;
    askingPrice: boolean;
    disclosurePolicy: boolean;
  };
  eligibleOutputs: string[];
  disclosurePrefs: any;
  leaseSummary: any;
}

export default function StudioBriefingPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const token = localStorage.getItem('sb-access-token') || 'dummy-token';
        const res = await fetch(`/api/broker/buildings/${id}/studio`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error('스튜디오 상태 정보를 불러올 수 없습니다.');
        }
        const data = await res.json();
        setStatus(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900 border border-neutral-800 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
        <p className="text-xs text-neutral-400 mt-4">스튜디오 대시보드를 구성하는 중...</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-8 bg-neutral-900 border border-red-900/30 rounded-2xl text-center space-y-4">
        <p className="text-2xl">⚠️</p>
        <p className="text-sm font-bold text-red-400">{error || '데이터 로드 실패'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs hover:bg-neutral-750 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const { completenessScore, layerScores, checklist, eligibleOutputs } = status;

  const scoreLevel =
    completenessScore >= 80 ? { label: 'S등급 (거래 최적화)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' } :
    completenessScore >= 60 ? { label: 'A등급 (투자 홍보 가능)', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' } :
    completenessScore >= 40 ? { label: 'B등급 (정보 보완 필요)', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' } :
    { label: 'C등급 (정리 미흡)', color: 'text-neutral-400', bg: 'bg-neutral-800/50', border: 'border-neutral-700/30' };

  // Checklist labels and target categories for navigation
  const checklistItems = [
    { key: 'buildingRegister', label: '🏢 건축물대장 증빙', score: layerScores.building_register, max: 20, path: 'files' },
    { key: 'registry', label: '📜 등기부등본 증빙', score: layerScores.registry_docs, max: 15, path: 'files' },
    { key: 'landUsePlan', label: '📐 토지이용계획 증빙', score: layerScores.land_use_plan, max: 10, path: 'files' },
    { key: 'rentRoll', label: '📊 임대차 현황 (Rent Roll)', score: layerScores.rent_roll, max: 25, path: 'lease' },
    { key: 'photos', label: '📸 건물 실사 사진', score: layerScores.photos, max: 10, path: 'files' },
    { key: 'floorPlan', label: '🗺️ 층별 도면 자료', score: layerScores.floor_plan, max: 10, path: 'files' },
    { key: 'repairHistory', label: '🔧 대수선/하자 보수 이력', score: layerScores.repair_history, max: 5, path: 'files' },
    { key: 'vacancyStatus', label: '🏢 공실 현황 증빙 서류', score: layerScores.vacancy_docs, max: 5, path: 'files' },
    { key: 'askingPrice', label: '💰 희망 매각가 밴드 설정', score: layerScores.asking_price, max: 5, path: 'disclosure' },
    { key: 'disclosurePolicy', label: '🔒 Blind 공개 정책 동의', score: layerScores.disclosure_policy, max: 5, path: 'disclosure' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* SSoT Workspace Header Tabs */}
      <StudioTabs buildingId={id} activeTab="briefing" />

      {/* Main Grid: Checklist & Eligible Outputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Checklist Progress */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Trust Score Header Summary */}
          <div className={`p-5 rounded-2xl border ${scoreLevel.border} ${scoreLevel.bg} flex flex-col md:flex-row md:items-center justify-between gap-4`}>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                SSoT 신뢰도 지표 현황
              </span>
              <h3 className={`text-lg font-black ${scoreLevel.color}`}>
                현재 {scoreLevel.label}
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                매도인의 투명성을 증명하고 매수자의 의사결정 시간을 80% 이상 단축합니다.
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end justify-center">
              <span className="text-xs text-neutral-400">종합 진척률</span>
              <span className="text-3xl font-black text-white">{completenessScore}%</span>
            </div>
          </div>

          {/* Detailed Score Checklist */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white tracking-tight">
              🔍 10대 에비던스 검증 체크리스트
            </h3>
            
            <div className="grid grid-cols-1 gap-2.5">
              {checklistItems.map((item) => {
                const isChecked = checklist[item.key as keyof typeof checklist];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 hover:border-neutral-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isChecked ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs border border-emerald-500/25 font-bold">
                          ✓
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-500 flex items-center justify-center text-xs border border-neutral-750 font-bold">
                          !
                        </span>
                      )}
                      <div>
                        <span className="block text-xs font-bold text-neutral-200">
                          {item.label}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          가중치 {item.max}점 중 {item.score}점 반영됨
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Score Indicator */}
                      <span className="text-xs font-mono font-bold text-neutral-400">
                        {item.score} / {item.max}
                      </span>
                      
                      {/* Action Button */}
                      {!isChecked && (
                        <button
                          onClick={() => router.push(`/broker/buildings/${id}/studio/${item.path}`)}
                          className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-black hover:bg-primary/20 active:scale-[0.98] transition-all cursor-pointer"
                        >
                          자료 보완
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Col: Eligible Document Outputs & Actions */}
        <div className="space-y-6">
          
          {/* Output Level Card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                📄 생성 가능한 딜 에셋 목록
              </h3>
              <p className="text-[10px] text-neutral-400 mt-1">
                완성도 점수에 따라 활성화되는 대외 공개용 보고서 및 마케팅 문서 게이트 정책
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Teaser */}
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-200">1분 블라인드 티저</span>
                  <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold font-mono">
                    즉시 가능
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500">
                  주요 핵심 신호(Asset Signal)만을 노출하는 요약 보고서
                </p>
              </div>

              {/* Missing Checklist & Buyer Fit */}
              <div className={`p-3 border rounded-xl space-y-1 transition-all ${
                completenessScore >= 40 
                  ? 'bg-neutral-950 border-neutral-800' 
                  : 'bg-neutral-900/35 border-neutral-850 opacity-55'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-200">매수자 분석 메모 & 미비자료지</span>
                  {completenessScore >= 40 ? (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold font-mono">
                      활성화됨
                    </span>
                  ) : (
                    <span className="text-[9px] bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded font-bold font-mono">
                      40점 제한
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500">
                  매칭 성능과 보완이 필요한 체크리스트를 투명하게 공개
                </p>
              </div>

              {/* Full IM / IM Lite */}
              <div className={`p-3 border rounded-xl space-y-1 transition-all ${
                completenessScore >= 85 
                  ? 'bg-neutral-950 border-neutral-800' 
                  : 'bg-neutral-900/35 border-neutral-850 opacity-55'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-200">AI Snapshot Draft (IM Lite)</span>
                  {completenessScore >= 85 ? (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold font-mono">
                      활성화됨
                    </span>
                  ) : (
                    <span className="text-[9px] bg-neutral-850 text-neutral-500 px-1.5 py-0.5 rounded font-bold font-mono">
                      85점 제한 (v0.3)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500">
                  민감정보 공개 차단 정책이 탑재된 8~12페이지 초간편 IM 자동 빌더
                </p>
              </div>
            </div>

            {/* CTA action */}
            {completenessScore >= 85 ? (
              <button
                onClick={() => router.push(`/broker/buildings/${id}/studio/snapshot`)}
                className="w-full py-2.5 bg-primary text-white text-xs font-black rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                ✨ AI Snapshot Draft 생성하기
              </button>
            ) : (
              <div className="text-center p-3.5 bg-neutral-950 rounded-xl border border-neutral-850">
                <span className="block text-[11px] font-bold text-neutral-300">
                  완성도 {85 - completenessScore}점이 부족합니다!
                </span>
                <span className="block text-[10px] text-neutral-500 mt-1">
                  체크리스트의 미비 서류를 보완하거나 Rent Roll 상세 내역을 입력하여 점수를 확보하세요.
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions Guide */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              🚀 빠른 정보 보완 방법
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 text-xs text-neutral-300">
                <span className="text-primary font-bold">1.</span>
                <span>건축물대장/등본 PDF 파일을 업로드하면 즉시 <strong className="text-white">+35점</strong>이 가산됩니다.</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-neutral-300">
                <span className="text-primary font-bold">2.</span>
                <span>임대 현황표를 멀티로우 동적 입력폼에 입력하면 <strong className="text-white">+25점</strong>이 가산됩니다.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
