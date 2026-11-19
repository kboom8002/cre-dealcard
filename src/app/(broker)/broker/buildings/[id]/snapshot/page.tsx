'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface SnapshotBody {
  headline?: string;
  area_signal?: string;
  asset_type?: string;
  size_signal?: string;
  price_band?: string;
  current_use_summary?: string;
  deal_thesis?: string;
  risk_summary?: string;
  financial_snapshot?: {
    vacancy_rate_note?: string;
    walt_note?: string;
    income_note?: string;
  };
  buyer_fit_types?: string[];
  missing_data_note?: string;
  boundary_disclaimer?: string;
}

interface SnapshotDocument {
  id: string;
  status: string;
  created_at: string | null;
  body: SnapshotBody;
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
      const res = await fetch(`/api/public/buildings/${encodeURIComponent(id)}/snapshot`);
      if (res.status === 404) {
        setSnapshot(null);
      } else if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || '스냅샷을 불러오지 못했습니다.');
      } else {
        const data = await res.json();
        const normalized: SnapshotDocument =
          data?.body && typeof data.body === 'object' && !Array.isArray(data.body)
            ? {
                id: String(data.id ?? id),
                status: String(data.status ?? 'draft'),
                created_at: data.created_at ?? null,
                body: data.body as SnapshotBody,
              }
            : {
                id: String(data?.id ?? id),
                status: String(data?.status ?? 'draft'),
                created_at: data?.created_at ?? null,
                body: (data && typeof data === 'object' ? data : {}) as SnapshotBody,
              };
        setSnapshot(normalized);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
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
      const res = await fetch(`/api/broker/buildings/${encodeURIComponent(id)}/snapshot/generate`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || '생성 실패');
      }
      await fetchSnapshot();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-slate-600 py-16 text-center text-sm font-medium animate-pulse">
        스냅샷을 불러오는 중입니다...
      </div>
    );
  }

  const body = snapshot?.body ?? {};
  const financial = body.financial_snapshot ?? {};
  const buyerFitTypes = Array.isArray(body.buyer_fit_types) ? body.buyer_fit_types : [];
  const createdDateLabel =
    snapshot?.created_at && !Number.isNaN(Date.parse(snapshot.created_at))
      ? new Date(snapshot.created_at).toLocaleDateString('ko-KR')
      : '최근 생성';

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-slate-900 px-4 py-6">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <style
          dangerouslySetInnerHTML={{
            __html: `
        @media print {
          body * { visibility: hidden; }
          #printable-snapshot, #printable-snapshot * { visibility: visible; }
          #printable-snapshot { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `,
          }}
        />

        {/* Header Actions */}
        <div className="flex flex-wrap justify-between items-center gap-3 no-print">
          <Link
            href={`/broker/buildings/${encodeURIComponent(id)}/studio`}
            className="min-h-[44px] inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            ← 스튜디오로 돌아가기
          </Link>
          <div className="flex flex-wrap gap-3">
            {snapshot && (
              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 rounded-lg text-sm font-semibold transition-colors border border-slate-200 cursor-pointer"
              >
                🖨️ PDF 인쇄
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="min-h-[44px] px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {generating ? '생성 중...' : snapshot ? '새로 갱신하기' : '스냅샷 생성하기'}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium no-print"
          >
            {error}
          </div>
        )}

        {!snapshot && !loading && !error && (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-xs no-print px-4">
            <span className="text-4xl block mb-4">📄</span>
            <h3 className="text-lg font-bold text-slate-900 mb-2">아직 생성된 스냅샷이 없습니다.</h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6">
              스냅샷은 SSoT 완성도 60점 이상일 때 AI를 통해 안전하게 자동 생성되는 요약본입니다.
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="min-h-[44px] px-6 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 hover:bg-slate-800 cursor-pointer"
            >
              {generating ? '생성 중...' : '스냅샷 지금 생성하기'}
            </button>
          </div>
        )}

        {/* Printable Area */}
        {snapshot && (
          <div
            id="printable-snapshot"
            className="bg-white text-slate-900 p-8 md:p-12 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden"
          >
            <div className="border-b-4 border-slate-900 pb-6 mb-8 relative z-10">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div>
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-sm font-bold uppercase tracking-widest mb-3 rounded">
                    Building Snapshot
                  </span>
                  <h1 className="text-2xl md:text-4xl font-black text-slate-900 leading-tight tracking-tight">
                    {body.headline || '매물 요약 스냅샷'}
                  </h1>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-2xl font-black text-blue-700">
                    {body.price_band || '가격 협의'}
                  </span>
                  <span className="text-sm text-slate-600 font-medium">
                    생성일: {createdDateLabel}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-700">
                <span className="flex items-center gap-1">📍 {body.area_signal || '-'}</span>
                <span className="flex items-center gap-1">🏢 {body.asset_type || '-'}</span>
                <span className="flex items-center gap-1">📏 {body.size_signal || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 relative z-10">
              <div className="space-y-8">
                <section>
                  <h2 className="text-lg font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-3">
                    핵심 투자 포인트
                  </h2>
                  <p className="text-slate-800 leading-relaxed text-base whitespace-pre-wrap">
                    {body.deal_thesis || '-'}
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-3">
                    현재 용도 및 구성
                  </h2>
                  <p className="text-slate-800 leading-relaxed text-base">
                    {body.current_use_summary || '-'}
                  </p>
                </section>

                <section>
                  <h2 className="text-lg font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-3">
                    권장 매수자 (Buyer Fit)
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {buyerFitTypes.length > 0 ? (
                      buyerFitTypes.map((fit, idx) => (
                        <span
                          key={idx}
                          className="bg-[#FAF9F5] text-slate-800 px-3 py-1 rounded-full text-sm font-medium border border-slate-200"
                        >
                          {fit}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-600">등록된 권장 매수자 유형이 없습니다.</span>
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <section className="bg-[#FAF9F5] p-6 rounded-xl border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    💰 재무 및 운영 현황 참고
                  </h2>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="text-blue-700 mt-0.5">▪</span>
                      <div>
                        <span className="block font-bold text-sm text-slate-900 mb-0.5">공실 현황</span>
                        <span className="text-sm text-slate-700">
                          {financial.vacancy_rate_note || '-'}
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-blue-700 mt-0.5">▪</span>
                      <div>
                        <span className="block font-bold text-sm text-slate-900 mb-0.5">
                          잔여 임대차 기간 (WALT)
                        </span>
                        <span className="text-sm text-slate-700">{financial.walt_note || '-'}</span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-blue-700 mt-0.5">▪</span>
                      <div>
                        <span className="block font-bold text-sm text-slate-900 mb-0.5">임대 소득</span>
                        <span className="text-sm text-slate-700">{financial.income_note || '-'}</span>
                      </div>
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-lg font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-3">
                    리스크 및 검토 필요 사항
                  </h2>
                  <p className="text-slate-800 leading-relaxed text-base">
                    {body.risk_summary || '-'}
                  </p>
                </section>

                {body.missing_data_note && (
                  <section>
                    <h2 className="text-sm font-bold text-slate-600 mb-2">미확보 데이터 (주의)</h2>
                    <p className="text-slate-700 text-sm bg-amber-50 p-3 rounded-lg border border-amber-200">
                      {body.missing_data_note}
                    </p>
                  </section>
                )}
              </div>
            </div>

            {/* Disclaimer Footer */}
            <div className="mt-16 pt-6 border-t border-slate-200">
              <div className="bg-[#FAF9F5] border border-slate-200 p-4 rounded-lg text-sm text-slate-600 leading-relaxed font-medium">
                <span className="font-bold text-slate-800 mr-2">면책 조항 (Disclaimer)</span>
                {body.boundary_disclaimer ||
                  '본 자료는 개업공인중개사가 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
