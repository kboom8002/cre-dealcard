'use client';

import React, { useState, useEffect, use } from 'react';
import { checkConsentGate, getRequiredConsentTier } from '@/domain/building/consent-chain';

interface ProIMData {
  ok: boolean;
  grant: { id: string; requesterName: string; expiresAt: string };
  renderPolicy: any;
  building: any;
  imDocument: any;
  watermarkSeed: string;
  error?: string;
  requiresNDA?: boolean;
}

export default function ProIMViewerPage({ params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = use(params);
  const [data, setData] = useState<ProIMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNDAGate, setShowNDAGate] = useState(false);
  const [ndaForm, setNdaForm] = useState({ name: '', phone: '', agreed: false });
  const [signing, setSigning] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/public/im-pro/${grantId}`)
      .then(r => r.json())
      .then(d => {
        if (d.requiresNDA) setShowNDAGate(true);
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [grantId]);

  const signNDA = async () => {
    if (!ndaForm.agreed || !ndaForm.name) return;
    setSigning(true);
    const res = await fetch(`/api/gate-requests/${grantId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agreedToTerms: ndaForm.agreed,
        signerName: ndaForm.name,
        signerPhone: ndaForm.phone,
      }),
    });
    if (res.ok) {
      setShowNDAGate(false);
      fetchData();
    }
    setSigning(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // NDA Gate
  const requiredTier = getRequiredConsentTier('pro');
  const isConsentCleared = data ? checkConsentGate(data.requiresNDA ? 'anonymous' : 'nda_signed', requiredTier).allowed : true;

  if (showNDAGate || data?.requiresNDA || !isConsentCleared) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <span className="text-4xl">🔐</span>
            <h1 className="text-xl font-bold mt-3">Pro IM 열람 동의</h1>
            <p className="text-sm text-neutral-400 mt-2">
              이 문서는 기밀유지동의(NDA)에 동의한 후 열람할 수 있습니다.
            </p>
          </div>

          <div className="bg-neutral-800/50 rounded-xl p-4 text-xs text-neutral-300 space-y-2">
            <p className="font-bold text-white">⚠️ 주요 조항</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>본 문서의 내용을 제3자에게 공유할 수 없습니다</li>
              <li>열람 후 24시간 동안 접근 가능합니다</li>
              <li>모든 열람 행위는 동적 워터마크로 추적됩니다</li>
              <li>AI 생성 정보로 투자 조언이 아닙니다</li>
            </ul>
          </div>

          <div className="space-y-3">
            <input
              type="text" placeholder="성명"
              value={ndaForm.name} onChange={e => setNdaForm(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
            />
            <input
              type="tel" placeholder="연락처 (선택)"
              value={ndaForm.phone} onChange={e => setNdaForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
            />
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox" checked={ndaForm.agreed}
                onChange={e => setNdaForm(p => ({ ...p, agreed: e.target.checked }))}
                className="mt-1 accent-primary"
              />
              <span className="text-xs text-neutral-300">위 조항에 동의하며, 기밀유지 의무를 준수합니다.</span>
            </label>
          </div>

          <button
            onClick={signNDA}
            disabled={!ndaForm.agreed || !ndaForm.name || signing}
            className="w-full py-3 bg-primary text-black font-bold rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {signing ? '처리 중...' : '동의 및 열람'}
          </button>
        </div>
      </div>
    );
  }

  if (!data?.ok || !data.imDocument) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <p>문서를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const sections = data.imDocument.sections || [];
  const building = data.building;
  const expiresAt = data.grant.expiresAt ? new Date(data.grant.expiresAt) : null;
  const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000)) : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative">
      {/* Dynamic Watermark Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" style={{ opacity: 0.04 }}>
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 200px, currentColor 200px, currentColor 201px)`,
        }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="absolute text-xs font-mono text-white whitespace-nowrap"
              style={{ top: `${i * 120}px`, left: `${(i % 3) * 200 - 100}px`, transform: 'rotate(-35deg)' }}>
              {data.watermarkSeed}
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800/50 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Pro IM</span>
            <h1 className="text-lg font-bold text-white">
              {building?.areaSignal || ''} {building?.assetType || '매물'}
            </h1>
          </div>
          {hoursLeft !== null && (
            <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded-full">
              ⏳ {hoursLeft}h 남음
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Requester Info */}
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 text-xs text-purple-300">
          🔐 {data.grant.requesterName}님 전용 문서 · 전송 금지 · 워터마크 추적 중
        </div>

        {/* Financial Summary (unmasked) */}
        {building?.leaseSummary && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">💰 재무 상세</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-neutral-400">월 임대료</span><br/><span className="font-bold text-white">{building.leaseSummary.monthly_rent_total_krw ? `${(building.leaseSummary.monthly_rent_total_krw / 10000).toLocaleString()}만원` : '-'}</span></div>
              <div><span className="text-neutral-400">공실률</span><br/><span className="font-bold text-white">{building.leaseSummary.vacancy_rate ?? '-'}%</span></div>
              <div><span className="text-neutral-400">WALT</span><br/><span className="font-bold text-white">{building.leaseSummary.walt_months ?? '-'}개월</span></div>
              <div><span className="text-neutral-400">임차인 수</span><br/><span className="font-bold text-white">{building.leaseSummary.tenants?.length ?? 0}건</span></div>
            </div>
          </div>
        )}

        {/* IM Sections */}
        {sections.map((section: any, i: number) => (
          <div key={i} className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-2">{section.title}</h2>
            <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {section.markdown}
            </div>
          </div>
        ))}

        {/* Disclaimer */}
        <div className="bg-neutral-800/30 rounded-xl p-4 text-[10px] text-neutral-500 space-y-1">
          <p>⚠️ 본 문서는 AI가 생성한 정보를 포함하며, 투자 조언이 아닙니다.</p>
          <p>실제 투자 시 독립적인 전문가 검토를 반드시 받으시기 바랍니다.</p>
        </div>
      </main>
    </div>
  );
}
