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
        const token = localStorage.getItem('sb-access-token') ?? '' /* SEC-6: 더미 토큰 금지 — 비어 있으면 서버가 세션 쿠키로 인증 */;
        const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/studio`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
      <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-2xl min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-700"></div>
        <p className="text-sm text-slate-600 mt-4">스튜디오 대시보드를 구성하는 중...</p>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-8 bg-white border border-red-200 rounded-2xl text-center space-y-4">
        <p className="text-2xl">⚠️</p>
        <p className="text-sm font-bold text-red-700">{error || '데이터 로드 실패'}</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 rounded-xl text-sm font-bold transition-colors cursor-pointer"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const { completenessScore, layerScores, checklist } = status;

  const scoreLevel =
    completenessScore >= 80 ? { label: 'S등급 (거래 최적화)', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' } :
    completenessScore >= 60 ? { label: 'A등급 (투자 홍보 가능)', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' } :
    completenessScore >= 40 ? { label: 'B등급 (정보 보완 필요)', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' } :
    { label: 'C등급 (정리 미흡)', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200' };

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
              <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                SSoT 신뢰도 지표 현황
              </span>
              <h3 className={`text-lg font-black ${scoreLevel.color}`}>
                현재 {scoreLevel.label}
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                매도인의 투명성을 증명하고 매수자의 의사결정 시간을 80% 이상 단축합니다.
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end justify-center">
              <span className="text-sm text-slate-600 font-semibold">종합 진척률</span>
              <span className="text-3xl font-black text-slate-900">{completenessScore}%</span>
            </div>
          </div>

          {/* Detailed Score Checklist */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              🔍 10대 에비던스 검증 체크리스트
            </h3>
            
            <div className="grid grid-cols-1 gap-2.5">
              {checklistItems.map((item) => {
                const isChecked = checklist[item.key as keyof typeof checklist];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-slate-300 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isChecked ? (
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm border border-emerald-200 font-bold shrink-0">
                          ✓
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm border border-slate-300 font-bold shrink-0">
                          !
                        </span>
                      )}
                      <div className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">
                          {item.label}
                        </span>
                        <span className="text-sm text-slate-600">
                          가중치 {item.max}점 중 {item.score}점 반영됨
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Score Indicator */}
                      <span className="text-sm font-mono font-bold text-slate-700">
                        {item.score} / {item.max}
                      </span>
                      
                      {/* Action Button */}
                      {!isChecked && (
                        <button
                          type="button"
                          onClick={() => router.push(`/broker/buildings/${id}/studio/${item.path}`)}
                          className="min-h-[44px] px-3.5 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-extrabold hover:bg-blue-100 active:scale-[0.98] transition-all cursor-pointer"
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                📄 생성 가능한 딜 에셋 목록
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                완성도 점수에 따라 활성화되는 대외 공개용 보고서 및 마케팅 문서 게이트 정책
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Teaser */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">1분 블라인드 티저</span>
                  <span className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold font-mono shrink-0">
                    즉시 가능
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  주요 핵심 신호(Asset Signal)만을 노출하는 요약 보고서
                </p>
              </div>

              {/* Missing Checklist & Buyer Fit */}
              <div className={`p-3 border rounded-xl space-y-1 transition-all ${
                completenessScore >= 40 
                  ? 'bg-slate-50 border-slate-200' 
                  : 'bg-slate-100/70 border-slate-200 opacity-65'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">매수자 분석 메모 & 미비자료지</span>
                  {completenessScore >= 40 ? (
                    <span className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold font-mono shrink-0">
                      활성화됨
                    </span>
                  ) : (
                    <span className="text-sm bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold font-mono shrink-0">
                      40점 제한
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  매칭 성능과 보완이 필요한 체크리스트를 투명하게 공개
                </p>
              </div>

              {/* Full IM / IM Lite */}
              <div className={`p-3 border rounded-xl space-y-1 transition-all ${
                completenessScore >= 85 
                  ? 'bg-slate-50 border-slate-200' 
                  : 'bg-slate-100/70 border-slate-200 opacity-65'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">AI Snapshot Draft (IM Lite)</span>
                  {completenessScore >= 85 ? (
                    <span className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold font-mono shrink-0">
                      활성화됨
                    </span>
                  ) : (
                    <span className="text-sm bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold font-mono shrink-0">
                      85점 제한 (v0.3)
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  민감정보 공개 차단 정책이 탑재된 8~12페이지 초간편 IM 자동 빌더
                </p>
              </div>
            </div>

            {/* CTA action */}
            {completenessScore >= 85 ? (
              <button
                type="button"
                onClick={() => router.push(`/broker/buildings/${id}/snapshot`)}
                className="w-full min-h-[44px] py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-black rounded-xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                ✨ AI Snapshot Draft 생성하기
              </button>
            ) : (
              <div className="text-center p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-sm font-bold text-slate-800">
                  완성도 {85 - completenessScore}점이 부족합니다!
                </span>
                <span className="block text-sm text-slate-600 mt-1">
                  체크리스트의 미비 서류를 보완하거나 Rent Roll 상세 내역을 입력하여 점수를 확보하세요.
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions Guide */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              🚀 빠른 정보 보완 방법
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="text-blue-700 font-bold">1.</span>
                <span>건축물대장/등본 PDF 파일을 업로드하면 즉시 <strong className="text-slate-900">+35점</strong>이 가산됩니다.</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="text-blue-700 font-bold">2.</span>
                <span>임대 현황표를 멀티로우 동적 입력폼에 입력하면 <strong className="text-slate-900">+25점</strong>이 가산됩니다.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
