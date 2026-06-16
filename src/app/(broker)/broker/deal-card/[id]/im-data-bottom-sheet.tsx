"use client";

import { useState, useEffect } from "react";
import { createMobileIMAction } from "./actions";

interface ImDataBottomSheetProps {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  sizeSignal?: string;
  vacancySignal?: string;
  fitSummary?: string;
  cautionSummary?: string;
}

type BottomSheetState = "idle" | "loading" | "success" | "error";

export function ImDataBottomSheet({
  buildingId,
  isOpen,
  onClose,
  areaSignal,
  assetType,
  priceBand,
  sizeSignal,
  vacancySignal,
  fitSummary,
  cautionSummary,
}: ImDataBottomSheetProps) {
  const [state, setState] = useState<BottomSheetState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState("");

  // Form states
  const [address, setAddress] = useState("");
  const [pnu, setPnu] = useState("");
  const [monthlyRent, setMonthlyRent] = useState(""); // 만원 단위
  const [vacancyPct, setVacancyPct] = useState<number | "">("");
  const [brokerHighlight, setBrokerHighlight] = useState("");

  const [readinessScore, setReadinessScore] = useState(0);

  // 간이 Readiness 계산 로직 (바텀시트 내부 표시용)
  useEffect(() => {
    let score = 0;
    if (areaSignal) score += 10;
    if (priceBand) score += 10;
    if (assetType) score += 10;
    if (address || pnu) score += 25;
    if (monthlyRent && Number(monthlyRent) > 0) score += 20;
    if (vacancyPct !== "" || vacancySignal) score += 10;
    if (brokerHighlight) score += 5;
    
    // Max 100
    setReadinessScore(Math.min(score, 100));
  }, [areaSignal, priceBand, assetType, address, pnu, monthlyRent, vacancyPct, vacancySignal, brokerHighlight]);

  if (!isOpen) return null;

  async function handleCreate() {
    setState("loading");
    setProgress("데이터 검증 및 수집 중...");

    try {
      const directData: Record<string, unknown> = {};
      if (areaSignal) directData.area_signal = areaSignal;
      if (assetType) directData.asset_type = assetType;
      if (priceBand) directData.price_band = priceBand;
      if (sizeSignal) directData.size_signal = sizeSignal;
      if (fitSummary) directData.fit_summary = fitSummary;
      if (cautionSummary) directData.caution_summary = cautionSummary;

      setProgress("AI 투자설명서 생성 중... (약 15~30초)");

      const res = await createMobileIMAction(buildingId, {
        vacancy_status: vacancySignal,
        vacancy_pct: vacancyPct !== "" ? Number(vacancyPct) : undefined,
        monthly_rent_total_krw: monthlyRent ? Number(monthlyRent) * 10000 : undefined,
        resolved_address: address || undefined,
        resolved_pnu: pnu || undefined,
        broker_highlight: brokerHighlight || undefined,
        direct_data: Object.keys(directData).length > 0 ? directData : undefined,
      });

      if (res.success && res.url) {
        setState("success");
        setProgress(`✅ ${res.sections_count ?? 7}섹션 생성 완료!`);
        setTimeout(() => {
          window.location.href = res.reviewUrl ?? res.url!;
        }, 1500);
      } else {
        setState("error");
        setErrorMsg(res.error ?? "알 수 없는 오류");
        setProgress("");
      }
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message ?? "서버 요청 실패");
      setProgress("");
    }
  }

  // 주소 검색 (간이 Mock)
  const handleAddressSearch = () => {
    // 실제로는 카카오 주소 API 팝업을 띄워야 하지만 임시로 prompt 사용
    const input = window.prompt("건물 지번 또는 도로명 주소를 입력하세요 (예: 강남구 역삼동 823-4)");
    if (input && input.trim()) {
      setAddress(input.trim());
      // 임시 PNU 매핑 (역삼동 823-4 -> 1168010100108230004)
      if (input.includes("역삼") && input.includes("823")) {
         setPnu("1168010100108230004");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background rounded-t-2xl w-full max-w-md mx-auto shadow-2xl p-5 animate-in slide-in-from-bottom duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">📊 투자설명서 데이터 보강</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          데이터가 많을수록 IM 품질과 정확도가 월등히 높아집니다.
        </p>

        {/* Form Fields */}
        <div className="space-y-4 mb-6">
          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              🏠 정확한 건물 주소 <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={address}
                placeholder="주소를 검색해주세요"
                className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                onClick={handleAddressSearch}
              />
              <button 
                onClick={handleAddressSearch}
                className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                검색
              </button>
            </div>
            {pnu && <p className="text-[10px] text-emerald-500 mt-1">✅ 주소 확인 완료 (PNU: {pnu})</p>}
          </div>

          {/* Monthly Rent */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              💰 월 임대료 총액 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="예: 1500"
                className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">만원</span>
            </div>
          </div>

          {/* Vacancy */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              📊 현재 공실률
            </label>
            <div className="flex gap-2">
              {[0, 10, 20, 30].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setVacancyPct(pct)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    vacancyPct === pct 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-background text-muted-foreground border-border hover:bg-secondary"
                  }`}
                >
                  {pct === 0 ? "만실" : `~${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              📝 브로커 한줄 코멘트
            </label>
            <input
              type="text"
              value={brokerHighlight}
              onChange={(e) => setBrokerHighlight(e.target.value)}
              placeholder="예: 역세권 1분, 리모델링으로 가치 상승 여지 충분"
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Readiness Bar */}
        <div className="bg-secondary/30 rounded-lg p-3 mb-6 border border-border">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-medium text-foreground">데이터 충실도</span>
            <span className={`text-xs font-bold ${readinessScore >= 55 ? "text-emerald-500" : "text-amber-500"}`}>
              {readinessScore >= 55 ? "🟢" : "🟠"} {readinessScore} / 100
            </span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${readinessScore >= 55 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${readinessScore}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            {readinessScore >= 55 
              ? "✅ AI가 고품질 투자설명서를 작성할 준비가 되었습니다." 
              : "⚠️ 주소와 월세를 입력해야 생성할 수 있습니다."}
          </p>
        </div>

        {/* Footer actions */}
        {state === "error" && (
          <p className="text-xs text-rose-500 text-center mb-3">⚠️ {errorMsg}</p>
        )}
        
        {state === "success" ? (
          <button disabled className="w-full bg-emerald-600 text-white rounded-xl py-3 text-sm font-bold">
            ✅ {progress}
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={state === "loading" || readinessScore < 55}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl py-3 text-sm font-bold shadow-md disabled:opacity-50 disabled:from-secondary disabled:to-secondary disabled:text-muted-foreground transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {state === "loading" ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="truncate">{progress}</span>
              </>
            ) : (
              "🚀 프리미엄 투자설명서 만들기"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
