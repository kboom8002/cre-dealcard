'use client';

import React, { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const TABS = [
  { key: 'overview', label: '개요', icon: '📊', emoji: '📊' },
  { key: 'data', label: '데이터', icon: '📁', emoji: '📁' },
  { key: 'financials', label: '재무', icon: '💰', emoji: '💰' },
  { key: 'documents', label: '문서', icon: '📄', emoji: '📄' },
  { key: 'parties', label: '관계자', icon: '👥', emoji: '👥' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function DealWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [studioData, setStudioData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/broker/buildings/${id}/studio`, {
      headers: { Authorization: `Bearer ${document.cookie.match(/sb-access-token=([^;]+)/)?.[1] || ''}` },
    })
      .then(r => r.json())
      .then(data => { setStudioData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const activeIndex = TABS.findIndex(t => t.key === activeTab);

  // Touch swipe handlers
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 50) {
      const nextIndex = diff > 0 ? Math.max(0, activeIndex - 1) : Math.min(TABS.length - 1, activeIndex + 1);
      setActiveTab(TABS[nextIndex].key);
    }
    setTouchStart(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/90 backdrop-blur-xl border-t border-neutral-800/50 md:hidden">
        <div className="flex justify-around items-center h-14">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                activeTab === tab.key ? 'text-primary' : 'text-neutral-500'
              }`}
            >
              <span className="text-lg">{tab.emoji}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Desktop Tab Bar */}
      <div className="hidden md:flex items-center gap-1 bg-neutral-900/50 rounded-xl p-1 border border-neutral-800/50 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-neutral-800 text-white shadow-lg'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
          >
            <span>{tab.emoji}</span>
            <span>{tab.label}</span>
            {activeTab === tab.key && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-neutral-800 rounded-lg -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="min-h-[60vh]"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' && <OverviewTab data={studioData} buildingId={id} />}
            {activeTab === 'data' && <DataTab data={studioData} buildingId={id} />}
            {activeTab === 'financials' && <FinancialsTab data={studioData} buildingId={id} />}
            {activeTab === 'documents' && <DocumentsTab data={studioData} buildingId={id} />}
            {activeTab === 'parties' && <PartiesTab data={studioData} buildingId={id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================
// Tab 1: Overview
// ============================================================
function OverviewTab({ data, buildingId }: { data: any; buildingId: string }) {
  const grade = data?.dataGrade || 'D';
  const gradeColors: Record<string, string> = {
    A: 'from-emerald-500 to-emerald-700', B: 'from-blue-500 to-blue-700',
    C: 'from-amber-500 to-amber-700', D: 'from-red-500 to-red-700',
  };

  const checklist = data?.checklist || {};
  const checklistItems = [
    { key: 'buildingRegister', label: '건축물대장', weight: 20 },
    { key: 'registry', label: '등기부등본', weight: 15 },
    { key: 'landUsePlan', label: '토지이용계획', weight: 10 },
    { key: 'rentRoll', label: '임대차 현황', weight: 25 },
    { key: 'photos', label: '사진', weight: 10 },
    { key: 'floorPlan', label: '평면도', weight: 5 },
    { key: 'repairHistory', label: '수선 이력', weight: 3 },
    { key: 'vacancyStatus', label: '공실 현황', weight: 5 },
    { key: 'askingPrice', label: '호가', weight: 5 },
    { key: 'disclosurePolicy', label: '공개 정책', weight: 2 },
  ];

  const financials = data?.financialSummary;
  const constraints = data?.constraints;

  return (
    <div className="space-y-6">
      {/* Constraint Violations Warning */}
      {constraints?.violations?.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-2">
            <span>⚠️</span> 데이터 무결성 경고 ({constraints.violations.length}건)
          </h3>
          <ul className="space-y-1">
            {constraints.violations.map((v: any, i: number) => (
              <li key={i} className="text-xs text-red-300">
                [{v.code}] {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grade & Financials Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Grade Gauge */}
        <div className={`rounded-xl p-4 bg-gradient-to-br ${gradeColors[grade]} relative overflow-hidden`}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">데이터 등급</span>
            <div className="text-3xl font-black text-white mt-1">{grade}</div>
            <span className="text-[10px] text-white/60">
              {grade === 'A' ? 'DCF 가능' : grade === 'B' ? '주요 항목 확보' : grade === 'C' ? '기본 항목만' : '입력 필요'}
            </span>
          </div>
        </div>

        {/* NOI */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">NOI</span>
          <div className="text-lg font-bold text-white mt-1">
            {financials?.noi?.value ? `${(financials.noi.value / 100_000_000).toFixed(1)}억` : '-'}
          </div>
        </div>

        {/* Cap Rate */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Cap Rate</span>
          <div className="text-lg font-bold text-white mt-1">
            {grade === 'C' ? <span className="text-amber-400">검증 중</span>
              : financials?.capRate?.value ? `${financials.capRate.value.toFixed(1)}%` : '-'}
          </div>
        </div>

        {/* Completeness */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">완성도</span>
          <div className="text-lg font-bold text-primary mt-1">{data?.completenessScore ?? 0}<span className="text-xs text-neutral-400">점</span></div>
        </div>
      </div>

      {/* Evidence Checklist */}
      <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span>📋</span> 10항목 증빙 체크리스트
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {checklistItems.map(item => (
            <div key={item.key}
              className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                checklist[item.key]
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500'
              }`}
            >
              <span>{checklist[item.key] ? '✅' : '⬜'}</span>
              <span className="truncate">{item.label}</span>
              <span className="ml-auto text-[10px] font-mono text-neutral-600">+{item.weight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Eligible Outputs */}
      <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <span>🎯</span> 생성 가능 문서
        </h3>
        <div className="flex flex-wrap gap-2">
          {(data?.eligibleOutputs || []).map((output: string) => (
            <span key={output} className="px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary text-xs rounded-full font-medium">
              {output.replace(/_/g, ' ')}
            </span>
          ))}
          {(!data?.eligibleOutputs || data.eligibleOutputs.length === 0) && (
            <span className="text-xs text-neutral-500">데이터를 더 입력하면 문서를 생성할 수 있습니다</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tab 2: Data Room
// ============================================================
function DataTab({ data, buildingId }: { data: any; buildingId: string }) {
  const [uploading, setUploading] = useState(false);
  const categories = [
    { key: 'building_register', label: '건축물대장', icon: '🏛️', weight: 20 },
    { key: 'registry_docs', label: '등기부등본', icon: '📜', weight: 15 },
    { key: 'land_use_plan', label: '토지이용계획', icon: '🗺️', weight: 10 },
    { key: 'photos', label: '사진', icon: '📷', weight: 10 },
    { key: 'floor_plan', label: '평면도', icon: '📐', weight: 5 },
    { key: 'repair_history', label: '수선 이력', icon: '🔧', weight: 3 },
    { key: 'vacancy_docs', label: '공실 증빙', icon: '🏢', weight: 5 },
  ];
  const checklist = data?.checklist || {};
  const checklistKeyMap: Record<string, string> = {
    building_register: 'buildingRegister', registry_docs: 'registry',
    land_use_plan: 'landUsePlan', photos: 'photos', floor_plan: 'floorPlan',
    repair_history: 'repairHistory', vacancy_docs: 'vacancyStatus',
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span>📁</span> 증빙 데이터 업로드
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map(cat => {
            const done = checklist[checklistKeyMap[cat.key]];
            return (
              <div key={cat.key}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer hover:border-primary/50 ${
                  done ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-neutral-900 border-neutral-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <span className="text-sm font-medium text-white">{cat.label}</span>
                    <span className="block text-[10px] text-neutral-400">+{cat.weight}점</span>
                  </div>
                </div>
                <span className={`text-xs font-bold ${done ? 'text-emerald-400' : 'text-neutral-600'}`}>
                  {done ? '✓ 확인됨' : '미제출'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drop Zone */}
      <div className="border-2 border-dashed border-neutral-700 hover:border-primary/50 rounded-xl p-8 text-center transition-colors cursor-pointer">
        <span className="text-3xl">📎</span>
        <p className="text-sm text-neutral-400 mt-2">파일을 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-neutral-600 mt-1">PDF, PNG, JPG, ZIP · 최대 50MB</p>
      </div>
    </div>
  );
}

// ============================================================
// Tab 3: Financials
// ============================================================
function FinancialsTab({ data, buildingId }: { data: any; buildingId: string }) {
  const lease = data?.leaseSummary || {};
  const tenants = lease.tenants || [];
  const financials = data?.financialSummary;

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="NOI" value={financials?.noi?.value ? `${(financials.noi.value / 1e8).toFixed(1)}억` : '-'} />
        <MetricCard label="Cap Rate" value={financials?.capRate?.value ? `${financials.capRate.value.toFixed(1)}%` : '-'}
          alert={financials?.capRate?.value && (financials.capRate.value < 2 || financials.capRate.value > 15)} />
        <MetricCard label="Equity" value={financials?.equityRequired?.value ? `${(financials.equityRequired.value / 1e8).toFixed(1)}억` : '-'} />
        <MetricCard label="DCF" value={financials?.isDcfEligible ? '분석 가능' : '등급 부족'}
          valueColor={financials?.isDcfEligible ? 'text-emerald-400' : 'text-neutral-500'} />
      </div>

      {/* Rent Roll Table */}
      <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>📊</span> 임대차 현황 ({tenants.length}건)
          </h3>
          <a href={`/broker/buildings/${buildingId}/studio/lease`}
            className="text-xs text-primary hover:text-primary/80 transition-colors">
            편집 →
          </a>
        </div>
        {tenants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">층</th>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">업종</th>
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">면적(평)</th>
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">보증금</th>
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">월세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {tenants.map((t: any, i: number) => (
                  <tr key={i} className="hover:bg-neutral-800/30">
                    <td className="px-3 py-2 text-neutral-200">{t.floor || '-'}</td>
                    <td className="px-3 py-2 text-neutral-200">{t.tenant_type || t.tenantType || '-'}</td>
                    <td className="px-3 py-2 text-right text-neutral-200">{t.area_sqm || t.areaSqm || '-'}</td>
                    <td className="px-3 py-2 text-right text-neutral-200">{t.deposit ? `${(t.deposit / 10000).toLocaleString()}만` : '-'}</td>
                    <td className="px-3 py-2 text-right text-primary font-medium">{t.monthly_rent ? `${(t.monthly_rent / 10000).toLocaleString()}만` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-neutral-500 text-sm">
            임대차 정보를 입력하면 재무 분석이 활성화됩니다
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, alert, valueColor }: { label: string; value: string; alert?: boolean; valueColor?: string }) {
  return (
    <div className={`bg-neutral-900/60 border rounded-xl p-4 ${alert ? 'border-red-500/30' : 'border-neutral-800'}`}>
      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</span>
      <div className={`text-lg font-bold mt-1 ${valueColor || (alert ? 'text-red-400' : 'text-white')}`}>{value}</div>
    </div>
  );
}

// ============================================================
// Tab 4: Documents
// ============================================================
function DocumentsTab({ data, buildingId }: { data: any; buildingId: string }) {
  const grade = data?.dataGrade || 'D';
  const docs = [
    { key: 'teaser', label: 'Blind Teaser', icon: '🎭', minGrade: 'C', href: `/dc/${buildingId}` },
    { key: 'snapshot', label: 'AI Snapshot', icon: '📸', minGrade: 'C', href: `/broker/buildings/${buildingId}/snapshot` },
    { key: 'im', label: '투자설명서 (IM)', icon: '📄', minGrade: 'C', href: `/broker/buildings/${buildingId}/im-lite` },
  ];
  const gradeOrder = ['D', 'C', 'B', 'A'];
  const canGenerate = (minGrade: string) => gradeOrder.indexOf(grade) >= gradeOrder.indexOf(minGrade);

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span>📄</span> 문서 생성 & 발행
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {docs.map(doc => {
            const enabled = canGenerate(doc.minGrade);
            return (
              <a key={doc.key} href={enabled ? doc.href : undefined}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  enabled
                    ? 'bg-neutral-900 border-neutral-700 hover:border-primary/50 hover:bg-neutral-800/50 cursor-pointer'
                    : 'bg-neutral-900/30 border-neutral-800/50 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="text-2xl">{doc.icon}</span>
                <div>
                  <span className="text-sm font-bold text-white">{doc.label}</span>
                  <span className="block text-[10px] text-neutral-400">
                    {enabled ? '생성 가능' : `Grade ${doc.minGrade} 이상 필요`}
                  </span>
                </div>
                {enabled && <span className="ml-auto text-primary">→</span>}
              </a>
            );
          })}
        </div>
      </div>

      {/* Disclosure Settings Link */}
      <a href={`/broker/buildings/${buildingId}/studio/disclosure`}
        className="block bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4 hover:border-primary/30 transition-colors">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🔒</span> 정보 공개 설정
          <span className="ml-auto text-neutral-400 text-xs">→</span>
        </h3>
        <p className="text-xs text-neutral-400 mt-1">Blind Teaser 마스킹 및 시그널 공개 범위 설정</p>
      </a>
    </div>
  );
}

// ============================================================
// Tab 5: Parties & Activity
// ============================================================
function PartiesTab({ data, buildingId }: { data: any; buildingId: string }) {
  return (
    <div className="space-y-6">
      {/* Quick Links to existing pages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <a href={`/broker/deal-card/${buildingId}`}
          className="flex items-center gap-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-primary/30 transition-colors">
          <span className="text-2xl">🎯</span>
          <div>
            <span className="text-sm font-bold text-white">매칭 & 바이어</span>
            <span className="block text-[10px] text-neutral-400">매칭된 매수인 확인 · Gate 요청 처리</span>
          </div>
          <span className="ml-auto text-neutral-400">→</span>
        </a>
        <a href="/broker/pipeline"
          className="flex items-center gap-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-primary/30 transition-colors">
          <span className="text-2xl">📈</span>
          <div>
            <span className="text-sm font-bold text-white">파이프라인</span>
            <span className="block text-[10px] text-neutral-400">딜 스테이지 관리 · 전환 이력</span>
          </div>
          <span className="ml-auto text-neutral-400">→</span>
        </a>
        <a href="/broker/inbox"
          className="flex items-center gap-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-primary/30 transition-colors">
          <span className="text-2xl">📬</span>
          <div>
            <span className="text-sm font-bold text-white">인박스</span>
            <span className="block text-[10px] text-neutral-400">Gate 승인 · 열람 요청 · 알림</span>
          </div>
          <span className="ml-auto text-neutral-400">→</span>
        </a>
        <a href={`/broker/buildings/${buildingId}/owner-report`}
          className="flex items-center gap-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-primary/30 transition-colors">
          <span className="text-2xl">📊</span>
          <div>
            <span className="text-sm font-bold text-white">매도인 리포트</span>
            <span className="block text-[10px] text-neutral-400">소유자용 투자 분석 리포트</span>
          </div>
          <span className="ml-auto text-neutral-400">→</span>
        </a>
      </div>
    </div>
  );
}
