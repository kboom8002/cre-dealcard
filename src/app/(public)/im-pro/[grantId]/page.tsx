'use client';

import React, { useState, useEffect, use } from 'react';
import { checkConsentGate, getRequiredConsentTier } from '@/domain/building/consent-chain';
import { formatKrPhoneInput } from '@/lib/magazine/phone-input';
import { ReaderFontScaleToggle } from '@/components/ui/ReaderFontScaleToggle';
import { MarkdownRenderer } from '@/app/(public)/im-lite/[buildingId]/components/section-card';

interface ProIMData {
  ok: boolean;
  grant?: { id: string; requesterName: string; expiresAt: string; pdfExportAllowed?: boolean };
  renderPolicy: any;
  building: any;
  imDocument: any;
  watermarkSeed: string;
  error?: string;
  requiresNDA?: boolean;
  expiresAt?: string | null;
}

const STRUCTURED_FIELD_LABELS: Record<string, string> = {
  scenario: '시나리오',
  name: '시나리오명',
  label: '항목',
  title: '구분',
  entityType: '취득 주체',
  buyerType: '매수 주체',
  acquisitionTaxRate: '취득세율',
  acquisitionTax: '취득세',
  acquisitionTaxManwon: '취득세 (만원)',
  propertyTax: '보유세/재산세',
  capitalGainsTax: '양도소득세',
  estimatedTax: '예상 세액',
  effectiveTaxRate: '실효세율',
  netYieldAfterTax: '세후 수익률',
  annualAfterTaxCashFlow: '연 세후 현금흐름',
  ltv: '담보인정비율·LTV (%)',
  ltvPct: '담보인정비율·LTV (%)',
  loanAmount: '대출금액',
  loanAmountManwon: '대출금액 (만원)',
  equityAmount: '자기자본',
  equityManwon: '실투자금 (만원)',
  interestRate: '대출 금리 (%)',
  interestRatePct: '대출 금리 (%)',
  annualInterest: '연 이자비용',
  annualInterestManwon: '연 이자비용 (만원)',
  annualNoiManwon: '연 순영업소득·NOI (만원)',
  leveredCashFlowManwon: '레버리지 세전 현금흐름 (만원)',
  cashOnCashPct: '자기자본수익률·CoC (%)',
  dscr: '부채상환비율·DSCR (배)',
  note: '비고',
  summary: '요약',
};

function formatStructuredLabel(key: string): string {
  return STRUCTURED_FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

function formatStructuredValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'number') return Number.isFinite(val) ? val.toLocaleString() : '-';
  if (typeof val === 'boolean') return val ? '예' : '아니오';
  if (Array.isArray(val)) return val.map((v) => formatStructuredValue(v)).join(', ');
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${formatStructuredLabel(k)}: ${formatStructuredValue(v)}`)
      .join(' · ');
  }
  return String(val);
}

function StructuredDataBlock({ data }: { data: unknown }) {
  if (typeof data === 'string') {
    return <p className="text-sm text-[#334155] leading-relaxed whitespace-pre-wrap">{data}</p>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-sm text-[#64748B]">등록된 시나리오 항목이 없습니다.</p>;
    }
    const firstObj = data.find((r) => r && typeof r === 'object' && !Array.isArray(r)) as
      | Record<string, unknown>
      | undefined;
    if (!firstObj) {
      return (
        <ul className="space-y-2 text-sm text-[#334155]">
          {data.map((item, idx) => (
            <li key={idx} className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E2E8F0]">
              {formatStructuredValue(item)}
            </li>
          ))}
        </ul>
      );
    }
    const cols = Object.keys(firstObj);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-[#CBD5E1] text-[#475569] bg-[#FAF9F5]">
              {cols.map((col) => (
                <th key={col} className="text-left py-2.5 px-3 font-bold whitespace-nowrap">
                  {formatStructuredLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => {
              const rec = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
              return (
                <tr key={rIdx} className="border-b border-[#E2E8F0]">
                  {cols.map((col) => (
                    <td key={col} className="py-2.5 px-3 text-[#0F172A] tabular-nums">
                      {formatStructuredValue(rec[col])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <p className="text-sm text-[#64748B]">표시할 분석 데이터가 없습니다.</p>;
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="p-3.5 rounded-lg bg-[#FAF9F5] border border-[#E2E8F0] space-y-1"
          >
            <span className="block text-sm font-semibold text-[#64748B]">
              {formatStructuredLabel(key)}
            </span>
            <span className="block text-sm font-bold text-[#0F172A] tabular-nums break-words">
              {formatStructuredValue(value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function ProIMViewerPage({ params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = use(params);
  const [data, setData] = useState<ProIMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNDAGate, setShowNDAGate] = useState(false);
  const [ndaForm, setNdaForm] = useState({ name: '', phone: '', agreed: false });
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [grantToken, setGrantToken] = useState<string>('');
  const [loadedAtMs, setLoadedAtMs] = useState<number | null>(null);

  const readTokenFromUrl = () => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('token')?.trim() || '';
  };

  const fetchData = (tokenOverride?: string) => {
    setLoading(true);
    const activeToken = (tokenOverride ?? (grantToken || readTokenFromUrl())).trim();
    if (activeToken && activeToken !== grantToken) {
      setGrantToken(activeToken);
    }
    const tokenQuery = activeToken ? `?token=${encodeURIComponent(activeToken)}` : '';
    fetch(`/api/public/im-pro/${encodeURIComponent(grantId)}${tokenQuery}`, {
      headers: activeToken ? { 'x-grant-token': activeToken } : undefined,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.requiresNDA) setShowNDAGate(true);
        setData(d);
        setLoadedAtMs(Date.now());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [grantId]);

  const signNDA = async () => {
    if (!ndaForm.agreed || !ndaForm.name.trim()) return;
    setSigning(true);
    setSignError(null);
    const activeToken = grantToken || readTokenFromUrl();
    try {
      const res = await fetch(`/api/gate-requests/${encodeURIComponent(grantId)}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'x-grant-token': activeToken } : {}),
        },
        body: JSON.stringify({
          agreedToTerms: ndaForm.agreed,
          signerName: ndaForm.name.trim(),
          signerPhone: ndaForm.phone.trim(),
          ...(activeToken ? { grantToken: activeToken } : {}),
        }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (res.ok) {
        const nextToken =
          typeof resBody?.grantToken === 'string' && resBody.grantToken.trim()
            ? resBody.grantToken.trim()
            : activeToken;
        if (nextToken) {
          setGrantToken(nextToken);
        }
        setShowNDAGate(false);
        fetchData(nextToken);
      } else {
        setSignError(
          resBody?.error ||
            '서명 본인 확인에 실패했습니다. 이름과 열람 요청 시 입력한 연락처를 확인해 주세요.',
        );
      }
    } catch {
      setSignError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  // NDA Gate
  const requiredTier = getRequiredConsentTier('pro');
  const isConsentCleared = data
    ? checkConsentGate(data.requiresNDA ? 'anonymous' : 'nda_signed', requiredTier).allowed
    : true;

  if (showNDAGate || data?.requiresNDA || !isConsentCleared) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#0F172A] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="text-center">
            <span className="text-4xl">🔐</span>
            <h1 className="text-xl font-extrabold mt-3 text-[#0F172A]">Pro IM 열람 동의</h1>
            <p className="text-sm text-[#475569] mt-2">
              이 문서는 기밀유지동의(NDA)에 동의한 후 열람할 수 있습니다.
            </p>
          </div>

          <div className="bg-[#FAF9F5] border border-[#E2E8F0] rounded-xl p-4 text-sm text-[#334155] space-y-2">
            <p className="font-bold text-[#0F172A]">⚠️ 주요 조항</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>본 문서의 내용을 제3자에게 공유할 수 없습니다</li>
              <li>
                {(data?.grant?.expiresAt || data?.expiresAt)
                  ? `${new Date(String(data?.grant?.expiresAt || data?.expiresAt)).toLocaleString('ko-KR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}까지 접근 가능합니다`
                  : '승인된 열람 유효기간 동안 접근 가능합니다'}
              </li>
              <li>모든 열람 행위는 동적 워터마크로 추적됩니다</li>
              <li>AI 생성 정보로 투자 조언이 아닙니다</li>
            </ul>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="성명"
              value={ndaForm.name}
              onChange={(e) => setNdaForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full min-h-[44px] bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-base text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#1D4ED8]"
            />
            <input
              type="tel"
              placeholder="연락처 (본인 확인용)"
              value={ndaForm.phone}
              onChange={(e) =>
                setNdaForm((p) => ({ ...p, phone: formatKrPhoneInput(e.target.value) }))
              }
              className="w-full min-h-[44px] bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-base text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#1D4ED8]"
            />
            <label className="flex items-start gap-2.5 min-h-[44px] py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ndaForm.agreed}
                onChange={(e) => setNdaForm((p) => ({ ...p, agreed: e.target.checked }))}
                className="mt-0.5 w-5 h-5 accent-[#1D4ED8]"
              />
              <span className="text-sm text-[#334155]">
                위 조항에 동의하며, 기밀유지 의무를 준수합니다.
              </span>
            </label>
          </div>

          {signError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm font-semibold text-red-700"
            >
              ⚠️ {signError}
            </div>
          )}

          <button
            onClick={signNDA}
            disabled={!ndaForm.agreed || !ndaForm.name || signing}
            className="w-full min-h-[44px] py-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold rounded-xl text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {signing ? '처리 중...' : '동의 및 열람'}
          </button>
        </div>
      </div>
    );
  }

  if (!data?.ok || !data.imDocument || !data.grant) {
    const buildingId = data?.building?.id;
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col items-center justify-center gap-4 text-[#475569] px-4">
        <p className="text-base font-bold text-[#0F172A]">Pro 문서에 접근할 수 없습니다.</p>
        <p className="text-sm">열람 권한이 만료되었거나 취소되었을 수 있습니다.</p>
        {buildingId && (
          <a
            href={`/im-lite/${buildingId}`}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] text-sm font-bold text-[#1D4ED8] hover:bg-slate-50"
          >
            Basic 버전 보기 →
          </a>
        )}
      </div>
    );
  }

  const hiddenSectionSet = new Set<string>(
    [
      ...(Array.isArray(data.imDocument?.hidden_sections) ? data.imDocument.hidden_sections : []),
      ...(Array.isArray(data.imDocument?.hiddenSections) ? data.imDocument.hiddenSections : []),
    ]
      .filter((k: unknown) => k !== null && k !== undefined && String(k).trim() !== '')
      .map((k: unknown) => String(k).trim()),
  );
  const rawSections = Array.isArray(data.imDocument?.sections) ? data.imDocument.sections : [];
  const sections = rawSections.filter((s: any) => {
    if (!s || s.hidden === true || s.is_hidden === true) return false;
    const candidateKeys = [s.id, s.section_id, s.sectionId, s.section_type, s.key]
      .filter((k: unknown) => k !== null && k !== undefined && String(k).trim() !== '')
      .map((k: unknown) => String(k).trim());
    return !candidateKeys.some((k) => hiddenSectionSet.has(k));
  });
  const building = data.building;
  const expiresAt = data.grant.expiresAt ? new Date(data.grant.expiresAt) : null;
  const hoursLeft =
    expiresAt && loadedAtMs !== null
      ? Math.max(0, Math.round((expiresAt.getTime() - loadedAtMs) / 3600000))
      : null;
  const formattedExpiresAt = expiresAt
    ? expiresAt.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const posture = data.imDocument?.posture || data.building?.investment_posture || 'income';
  const activeToken = grantToken || readTokenFromUrl();
  const buildExportUrl = (format?: 'pptx') => {
    const qs = new URLSearchParams();
    if (format) qs.set('format', format);
    if (activeToken) qs.set('token', activeToken);
    const queryStr = qs.toString();
    return `/api/public/im-pro/${encodeURIComponent(grantId)}/export${queryStr ? `?${queryStr}` : ''}`;
  };
  const resolvedTenants: Array<Record<string, unknown>> =
    (Array.isArray(building?.leaseSummary?.tenants) && building.leaseSummary.tenants.length > 0
      ? building.leaseSummary.tenants
      : null) ||
    (Array.isArray(data.imDocument?.floorLeases) && data.imDocument.floorLeases.length > 0
      ? data.imDocument.floorLeases
      : null) ||
    (Array.isArray(data.imDocument?.floor_leases) && data.imDocument.floor_leases.length > 0
      ? data.imDocument.floor_leases
      : null) ||
    (Array.isArray(data.imDocument?.rentRoll) && data.imDocument.rentRoll.length > 0
      ? data.imDocument.rentRoll
      : null) ||
    (Array.isArray(data.imDocument?.rent_roll) && data.imDocument.rent_roll.length > 0
      ? data.imDocument.rent_roll
      : null) ||
    [];
  const taxScenariosData = data.imDocument?.taxScenarios ?? data.imDocument?.tax_scenarios;
  const loanSimulationData =
    data.imDocument?.loanSimulation ??
    data.imDocument?.loan_scenario ??
    data.imDocument?.loanScenario ??
    data.imDocument?.loan_simulation;

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0F172A] relative">
      {/* Dynamic Watermark Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" style={{ opacity: 0.045 }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 200px, #0F172A 200px, #0F172A 201px)',
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-sm font-mono text-[#0F172A] whitespace-nowrap"
              style={{
                top: `${i * 120}px`,
                left: `${(i % 3) * 200 - 100}px`,
                transform: 'rotate(-35deg)',
              }}
            >
              {data.watermarkSeed}
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#CBD5E1] px-4 py-3">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-sm font-extrabold text-[#1D4ED8] uppercase tracking-wider">
              Pro IM
            </span>
            <h1 className="text-lg font-extrabold text-[#0F172A]">
              {building?.areaSignal || ''} {building?.assetType || data.imDocument?.title || '매물'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ReaderFontScaleToggle variant="light" />
            {data.grant.pdfExportAllowed && (
              <>
                <button
                  onClick={() => window.open(buildExportUrl('pptx'), '_blank')}
                  className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 bg-[#065F46] hover:bg-[#047857] text-white font-bold rounded-lg text-sm shadow-xs transition-all cursor-pointer"
                  data-testid="btn-download-pptx"
                  title="워터마크 공식 PPTX 발표자료 다운로드"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span className="hidden sm:inline">공식 PPTX 다운로드</span>
                  <span className="sm:hidden">PPTX</span>
                </button>
                <button
                  onClick={() => window.open(buildExportUrl(), '_blank')}
                  className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] rounded-lg text-sm font-bold transition-colors cursor-pointer"
                  data-testid="btn-download-pdf"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="hidden sm:inline">워터마크 PDF</span>
                  <span className="sm:hidden">PDF</span>
                </button>
              </>
            )}
            {hoursLeft !== null && (
              <span
                className="text-sm font-bold bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/40 px-3 py-1.5 rounded-full"
                title={formattedExpiresAt ? `만료 시각: ${formattedExpiresAt}` : undefined}
              >
                ⏳ {formattedExpiresAt ? `${formattedExpiresAt}까지 (${hoursLeft}h 남음)` : `${hoursLeft}h 남음`}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Requester Info */}
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3.5 text-sm font-semibold text-[#1E3A8A]">
          🔐 {data.grant.requesterName}님 전용 문서 · 전송 금지 · 워터마크 추적 중
        </div>

        {/* Hero Official PPTX Action Card */}
        {data.grant.pdfExportAllowed && (
          <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3 text-left">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="text-base font-extrabold text-[#0F172A]">
                  공식 투자설명서 PPTX 프레젠테이션
                </h3>
                <p className="text-sm text-[#475569]">
                  수신인 동적 워터마크가 결속된 고해상도 공식 발표자료를 다운로드합니다
                </p>
              </div>
            </div>
            <button
              onClick={() => window.open(buildExportUrl('pptx'), '_blank')}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-[#065F46] hover:bg-[#047857] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer whitespace-nowrap"
              data-testid="hero-download-pptx-button"
            >
              <span>📥</span>
              <span>공식 PPTX 다운로드</span>
            </button>
          </div>
        )}

        {/* Financial Summary (unmasked) */}
        {building?.leaseSummary && (
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-extrabold text-[#0F172A] mb-3">💰 재무 상세</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-3 bg-[#FAF9F5] rounded-lg border border-[#E2E8F0]">
                <span className="text-[#64748B] block">월 임대료</span>
                <span className="font-extrabold text-[#0F172A] tabular-nums">
                  {building.leaseSummary.monthly_rent_total_krw
                    ? `${(building.leaseSummary.monthly_rent_total_krw / 10000).toLocaleString()}만원`
                    : '-'}
                </span>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-lg border border-[#E2E8F0]">
                <span className="text-[#64748B] block">공실률</span>
                <span className="font-extrabold text-[#0F172A] tabular-nums">
                  {building.leaseSummary.vacancy_rate ?? '-'}%
                </span>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-lg border border-[#E2E8F0]">
                <span className="text-[#64748B] block">평균 잔여임대기간(WALT)</span>
                <span className="font-extrabold text-[#0F172A] tabular-nums">
                  {building.leaseSummary.walt_months ?? '-'}개월
                </span>
              </div>
              <div className="p-3 bg-[#FAF9F5] rounded-lg border border-[#E2E8F0]">
                <span className="text-[#64748B] block">임차인 수</span>
                <span className="font-extrabold text-[#0F172A] tabular-nums">
                  {building.leaseSummary.tenants?.length ?? 0}건
                </span>
              </div>
              {posture === 'development' && building?.far_headroom && (
                <div className="text-sm text-[#475569] col-span-2">
                  용적률 여유: {building.far_headroom}%
                </div>
              )}
              {posture === 'operating' && data.imDocument?.gopMarginPct && (
                <div className="text-sm text-[#475569] col-span-2">
                  GOP 마진: {data.imDocument.gopMarginPct}%
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Grade */}
        {data.imDocument?.dataGrade && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span
              className={`text-sm font-bold px-3 py-1 rounded-full border ${
                data.imDocument.dataGrade === 'A'
                  ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                  : data.imDocument.dataGrade === 'B'
                  ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                  : 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
              }`}
            >
              데이터 등급 {data.imDocument.dataGrade}
            </span>
            {data.imDocument.dcfEligible && (
              <span className="text-sm font-bold text-[#065F46]">DCF 분석 포함</span>
            )}
          </div>
        )}

        {/* Granular Rent Roll (Pro exclusive) */}
        {resolvedTenants.length > 0 && (
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-extrabold text-[#0F172A]">📋 호실별 렌트롤 (프로 전용)</h2>
              <span className="text-sm font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2 py-0.5 rounded">
                PRO
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#CBD5E1] text-[#475569] bg-[#FAF9F5]">
                    <th className="text-left py-2.5 px-2">층</th>
                    <th className="text-left py-2.5 px-2">업종</th>
                    <th className="text-right py-2.5 px-2">보증금</th>
                    <th className="text-right py-2.5 px-2">월세</th>
                    <th className="text-center py-2.5 px-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedTenants.map((t, i) => {
                    const floor = String(t.floor ?? t.floorLabel ?? `${i + 1}F`);
                    const bizType = String(
                      t.tenant_type ?? t.tenantType ?? t.industry ?? t.use ?? t.tenant_name ?? t.tenantName ?? '-',
                    );
                    const depRaw = t.deposit_manwon ?? t.depositManwon ?? t.deposit;
                    const rentRaw =
                      t.rent_manwon ?? t.monthly_rent_manwon ?? t.monthlyRentManwon ?? t.rentManwon ?? t.monthlyRent;
                    const isVacant = Boolean(
                      t.is_vacant ||
                        t.isVacant ||
                        t.status === 'vacant' ||
                        t.status === '공실' ||
                        t.lease_state === '공실' ||
                        t.occupancy_status === '공실' ||
                        t.use === '공실',
                    );
                    const isOwnerUse =
                      !isVacant &&
                      Boolean(
                        t.is_owner_use ||
                          t.isOwnerUse ||
                          t.status === 'owner' ||
                          t.status === 'owner_use' ||
                          t.status === '자가사용' ||
                          t.lease_state === '자가사용' ||
                          t.lease_state === 'owner_use' ||
                          t.occupancy_status === '자가사용' ||
                          t.occupancy_status === 'owner_use' ||
                          t.use === '자가사용' ||
                          t.use === '자가' ||
                          t.tenant_type === '자가사용' ||
                          t.tenantType === '자가사용',
                      );
                    const depNum = depRaw !== null && depRaw !== undefined && Number.isFinite(Number(depRaw)) ? Number(depRaw) : null;
                    const rentNum = rentRaw !== null && rentRaw !== undefined && Number.isFinite(Number(rentRaw)) ? Number(rentRaw) : null;
                    return (
                      <tr key={i} className="border-b border-[#E2E8F0]">
                        <td className="py-2 px-2 font-semibold text-[#0F172A]">{floor}</td>
                        <td className="py-2 px-2 text-[#475569]">{bizType}</td>
                        <td className="py-2 px-2 text-right text-[#0F172A] tabular-nums">
                          {depNum !== null ? depNum.toLocaleString() : '-'}
                        </td>
                        <td className="py-2 px-2 text-right text-[#0F172A] tabular-nums">
                          {rentNum !== null ? rentNum.toLocaleString() : '-'}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold">
                          {isVacant ? '공실' : isOwnerUse ? '자가사용' : '임대중'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#CBD5E1] bg-[#FAF9F5]">
                    <td className="py-2.5 px-2 text-sm font-extrabold text-[#0F172A]">합계</td>
                    <td className="py-2.5 px-2 text-sm text-[#475569]">
                      {resolvedTenants.length}건
                    </td>
                    <td className="py-2.5 px-2 text-right text-sm font-extrabold text-[#0F172A] tabular-nums">
                      {resolvedTenants
                        .reduce((s: number, t) => {
                          const vac = Boolean(
                            t.is_vacant ||
                              t.isVacant ||
                              t.status === 'vacant' ||
                              t.status === '공실' ||
                              t.lease_state === '공실' ||
                              t.occupancy_status === '공실' ||
                              t.use === '공실',
                          );
                          const own =
                            !vac &&
                            Boolean(
                              t.is_owner_use ||
                                t.isOwnerUse ||
                                t.status === 'owner' ||
                                t.status === 'owner_use' ||
                                t.status === '자가사용' ||
                                t.lease_state === '자가사용' ||
                                t.lease_state === 'owner_use' ||
                                t.occupancy_status === '자가사용' ||
                                t.occupancy_status === 'owner_use' ||
                                t.use === '자가사용' ||
                                t.use === '자가' ||
                                t.tenant_type === '자가사용' ||
                                t.tenantType === '자가사용',
                            );
                          if (vac || own) return s;
                          const val = Number(t.deposit_manwon ?? t.depositManwon ?? t.deposit ?? 0);
                          return s + (Number.isFinite(val) ? val : 0);
                        }, 0)
                        .toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right text-sm font-extrabold text-[#065F46] tabular-nums">
                      {resolvedTenants
                        .reduce((s: number, t) => {
                          const vac = Boolean(
                            t.is_vacant ||
                              t.isVacant ||
                              t.status === 'vacant' ||
                              t.status === '공실' ||
                              t.lease_state === '공실' ||
                              t.occupancy_status === '공실' ||
                              t.use === '공실',
                          );
                          const own =
                            !vac &&
                            Boolean(
                              t.is_owner_use ||
                                t.isOwnerUse ||
                                t.status === 'owner' ||
                                t.status === 'owner_use' ||
                                t.status === '자가사용' ||
                                t.lease_state === '자가사용' ||
                                t.lease_state === 'owner_use' ||
                                t.occupancy_status === '자가사용' ||
                                t.occupancy_status === 'owner_use' ||
                                t.use === '자가사용' ||
                                t.use === '자가' ||
                                t.tenant_type === '자가사용' ||
                                t.tenantType === '자가사용',
                            );
                          if (vac || own) return s;
                          const val = Number(
                            t.rent_manwon ??
                              t.monthly_rent_manwon ??
                              t.monthlyRentManwon ??
                              t.rentManwon ??
                              t.monthlyRent ??
                              0,
                          );
                          return s + (Number.isFinite(val) ? val : 0);
                        }, 0)
                        .toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center text-sm text-[#475569]">
                      {
                        resolvedTenants.filter((t) =>
                          Boolean(
                            t.is_vacant ||
                              t.isVacant ||
                              t.status === 'vacant' ||
                              t.status === '공실' ||
                              t.lease_state === '공실' ||
                              t.occupancy_status === '공실' ||
                              t.use === '공실',
                          ),
                        ).length
                      }실 공실
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* IM Sections */}
        {sections.map((section: any, i: number) => {
          const provLabel = Array.isArray(section.provenance)
            ? section.provenance
                .map((p: any) => (typeof p === 'string' ? p : p?.label || p?.source || ''))
                .filter(Boolean)
                .join(', ')
            : typeof section.provenance === 'string'
            ? section.provenance
            : '';
          return (
            <div key={i} className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-extrabold text-[#0F172A]">{section.title}</h2>
                {provLabel && (
                  <span className="text-sm bg-[#FAF9F5] border border-[#E2E8F0] text-[#475569] px-2.5 py-0.5 rounded">
                    출처: {provLabel}
                  </span>
                )}
              </div>
              <div className="prose prose-slate prose-sm max-w-none text-sm text-[#334155] leading-relaxed">
                <MarkdownRenderer content={String(section.markdown || section.content || '')} />
              </div>
            </div>
          );
        })}

        {/* 세금 시나리오 */}
        {taxScenariosData && (
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-extrabold text-[#0F172A]">🏛️ 세금 시나리오 (프로 전용)</h2>
              <span className="text-sm font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2 py-0.5 rounded">
                PRO
              </span>
            </div>
            <StructuredDataBlock data={taxScenariosData} />
          </div>
        )}

        {/* 대출 시뮬레이션 */}
        {loanSimulationData && (
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-extrabold text-[#0F172A]">🏦 대출 시뮬레이션 (프로 전용)</h2>
              <span className="text-sm font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2 py-0.5 rounded">
                PRO
              </span>
            </div>
            <StructuredDataBlock data={loanSimulationData} />
          </div>
        )}

        {/* DCF Heatmap Section */}
        {data.imDocument?.dcf10Year && (
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-extrabold text-[#0F172A]">📊 10년 DCF 분석 (프로 전용)</h2>
              <span className="text-sm font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2 py-0.5 rounded">
                PRO
              </span>
            </div>
            <div className="overflow-x-auto">
              {Array.isArray(data.imDocument?.dcf10Year) ? (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#CBD5E1] text-[#475569] bg-[#FAF9F5]">
                      <th className="text-left py-2.5 px-2">연차</th>
                      <th className="text-right py-2.5 px-2">NOI</th>
                      <th className="text-right py-2.5 px-2">현금흐름</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imDocument.dcf10Year.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-[#E2E8F0]">
                        <td className="py-2 px-2 font-semibold text-[#0F172A]">Year {row.year}</td>
                        <td className="py-2 px-2 text-right text-[#0F172A] tabular-nums">
                          {row.noi?.toLocaleString() || '-'}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-[#065F46] tabular-nums">
                          {row.cash_flow?.toLocaleString() || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : data.imDocument?.dcf10Year?.cashFlows ? (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#CBD5E1] text-[#475569] bg-[#FAF9F5]">
                      <th className="text-left py-2.5 px-2">연차</th>
                      <th className="text-right py-2.5 px-2">현금흐름</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imDocument.dcf10Year.cashFlows.map((cf: number, i: number) => (
                      <tr key={i} className="border-b border-[#E2E8F0]">
                        <td className="py-2 px-2 font-semibold text-[#0F172A]">Year {i + 1}</td>
                        <td className="py-2 px-2 text-right font-bold text-[#065F46] tabular-nums">
                          {cf?.toLocaleString() || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-sm text-[#64748B] space-y-1">
          <p>⚠️ 본 문서는 AI가 생성한 정보를 포함하며, 투자 조언이 아닙니다.</p>
          <p>실제 투자 시 독립적인 전문가 검토를 반드시 받으시기 바랍니다.</p>
        </div>
      </main>
    </div>
  );
}
