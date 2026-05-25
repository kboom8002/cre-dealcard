'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface SnapshotDocument {
  id: string;
  status: string;
  created_at: string;
  body: {
    headline: string;
    area_signal: string;
    asset_type: string;
    size_signal: string;
    price_band: string;
    current_use_summary: string;
    deal_thesis: string;
    risk_summary: string;
    financial_snapshot: {
      vacancy_rate_note: string;
      walt_note: string;
      income_note: string;
    };
    buyer_fit_types: string[];
    missing_data_note: string;
    boundary_disclaimer: string;
  };
}

export default function SnapshotViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [snapshot, setSnapshot] = useState<SnapshotDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/buildings/${id}/snapshot`);
      if (res.status === 404) {
        setSnapshot(null);
      } else if (!res.ok) {
        throw new Error('Failed to fetch snapshot');
      } else {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, [id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/broker/buildings/${id}/snapshot/generate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || '생성 실패');
      }
      await fetchSnapshot();
    } catch (err: any) {
      setError(err.message || '생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="text-neutral-400 py-10 text-center animate-pulse">스냅샷을 불러오는 중입니다...</div>;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #printable-snapshot, #printable-snapshot * { visibility: visible; }
          #printable-snapshot { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}} />

      {/* Header Actions */}
      <div className="flex justify-between items-center no-print">
        <Link href={`/broker/buildings/${id}/studio`} className="text-sm text-neutral-400 hover:text-white">
          ← 스튜디오로 돌아가기
        </Link>
        <div className="flex gap-3">
          {snapshot && (
            <button onClick={handlePrint} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm transition-colors border border-neutral-700">
              🖨️ PDF 인쇄
            </button>
          )}
          <button 
            onClick={handleGenerate} 
            disabled={generating}
            className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          >
            {generating ? '생성 중...' : (snapshot ? '새로 갱신하기' : '스냅샷 생성하기')}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/40 border border-red-800/50 rounded-xl text-red-300 text-sm no-print">
          {error}
        </div>
      )}

      {!snapshot && !loading && !error && (
        <div className="text-center py-20 bg-neutral-900/50 rounded-xl border border-neutral-800 no-print">
          <span className="text-4xl block mb-4">📄</span>
          <h3 className="text-lg font-bold text-neutral-200 mb-2">아직 생성된 스냅샷이 없습니다.</h3>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto mb-6">스냅샷은 SSoT 완성도 60점 이상일 때 AI를 통해 안전하게 자동 생성되는 요약본입니다.</p>
          <button 
            onClick={handleGenerate} 
            disabled={generating}
            className="px-6 py-2.5 bg-primary text-black rounded-lg text-sm font-black transition-colors disabled:opacity-50 hover:bg-primary/90"
          >
            {generating ? '생성 중...' : '스냅샷 지금 생성하기'}
          </button>
        </div>
      )}

      {/* Printable Area */}
      {snapshot && (
        <div id="printable-snapshot" className="bg-white text-black p-8 md:p-12 rounded-xl shadow-2xl relative overflow-hidden">
           {/* Watermark / Decor */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
           
           <div className="border-b-4 border-black pb-6 mb-8 relative z-10">
              <div className="flex justify-between items-start mb-4">
                 <div>
                    <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-widest mb-3">
                      Building Snapshot
                    </span>
                    <h1 className="text-3xl md:text-4xl font-black text-black leading-tight tracking-tight">
                       {snapshot.body.headline}
                    </h1>
                 </div>
                 <div className="text-right shrink-0">
                    <span className="block text-2xl font-black text-primary">{snapshot.body.price_band}</span>
                    <span className="text-sm text-gray-500 font-medium">생성일: {new Date(snapshot.created_at).toLocaleDateString()}</span>
                 </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-gray-700">
                 <span className="flex items-center gap-1">📍 {snapshot.body.area_signal}</span>
                 <span className="flex items-center gap-1">🏢 {snapshot.body.asset_type}</span>
                 <span className="flex items-center gap-1">📏 {snapshot.body.size_signal}</span>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 relative z-10">
              <div className="space-y-8">
                 <section>
                    <h2 className="text-lg font-bold text-black border-b-2 border-gray-200 pb-2 mb-3">핵심 투자 포인트</h2>
                    <p className="text-gray-800 leading-relaxed text-[15px] whitespace-pre-wrap">{snapshot.body.deal_thesis}</p>
                 </section>

                 <section>
                    <h2 className="text-lg font-bold text-black border-b-2 border-gray-200 pb-2 mb-3">현재 용도 및 구성</h2>
                    <p className="text-gray-800 leading-relaxed text-[15px]">{snapshot.body.current_use_summary}</p>
                 </section>

                 <section>
                    <h2 className="text-lg font-bold text-black border-b-2 border-gray-200 pb-2 mb-3">권장 매수자 (Buyer Fit)</h2>
                    <div className="flex flex-wrap gap-2">
                       {snapshot.body.buyer_fit_types.map((fit, idx) => (
                         <span key={idx} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium border border-gray-200">{fit}</span>
                       ))}
                    </div>
                 </section>
              </div>

              <div className="space-y-8">
                 <section className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <h2 className="text-lg font-bold text-black mb-4 flex items-center gap-2">💰 재무 및 운영 현황 참고</h2>
                    <ul className="space-y-4">
                       <li className="flex items-start gap-3">
                          <span className="text-primary mt-0.5">▪</span>
                          <div>
                            <span className="block font-bold text-sm text-gray-900 mb-0.5">공실 현황</span>
                            <span className="text-sm text-gray-700">{snapshot.body.financial_snapshot.vacancy_rate_note}</span>
                          </div>
                       </li>
                       <li className="flex items-start gap-3">
                          <span className="text-primary mt-0.5">▪</span>
                          <div>
                            <span className="block font-bold text-sm text-gray-900 mb-0.5">잔여 임대차 기간 (WALT)</span>
                            <span className="text-sm text-gray-700">{snapshot.body.financial_snapshot.walt_note}</span>
                          </div>
                       </li>
                       <li className="flex items-start gap-3">
                          <span className="text-primary mt-0.5">▪</span>
                          <div>
                            <span className="block font-bold text-sm text-gray-900 mb-0.5">임대 소득</span>
                            <span className="text-sm text-gray-700">{snapshot.body.financial_snapshot.income_note}</span>
                          </div>
                       </li>
                    </ul>
                 </section>

                 <section>
                    <h2 className="text-lg font-bold text-black border-b-2 border-gray-200 pb-2 mb-3">리스크 및 검토 필요 사항</h2>
                    <p className="text-gray-800 leading-relaxed text-[15px]">{snapshot.body.risk_summary}</p>
                 </section>
                 
                 {snapshot.body.missing_data_note && (
                   <section>
                      <h2 className="text-sm font-bold text-gray-500 mb-2">미확보 데이터 (주의)</h2>
                      <p className="text-gray-600 text-sm bg-yellow-50/50 p-3 rounded-lg border border-yellow-100">{snapshot.body.missing_data_note}</p>
                   </section>
                 )}
              </div>
           </div>

           {/* Disclaimer Footer */}
           <div className="mt-16 pt-6 border-t border-gray-200">
              <div className="bg-gray-100 p-4 rounded-lg text-xs text-gray-500 leading-relaxed font-medium">
                <span className="font-bold text-gray-700 mr-2">면책 조항 (Disclaimer)</span>
                {snapshot.body.boundary_disclaimer}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
