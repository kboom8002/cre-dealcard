"use client";

import { useState, useEffect, useRef } from "react";
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

interface AddressResult {
  roadAddr?: string;
  jibunAddr?: string;
  zipNo?: string;
  pnu?: string;
  bdNm?: string;
  // Additional fields from address-resolver
  [key: string]: unknown;
}

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

  // Address search states
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<AddressResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 주소 검색 (실제 API 호출)
  const handleAddressSearch = async () => {
    const keyword = searchKeyword.trim();
    if (!keyword || keyword.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);
    
    try {
      const res = await fetch(`/api/public/address?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) {
        throw new Error("주소 검색 실패");
      }
      const data = await res.json();
      // data can be an array or { results: [...] }
      const results: AddressResult[] = Array.isArray(data) ? data : (data.results ?? data.juso ?? []);
      setSearchResults(results);
    } catch (err) {
      console.error("Address search failed:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // 주소 결과 선택
  const selectAddress = (result: AddressResult) => {
    const displayAddr = result.roadAddr || result.jibunAddr || "";
    setAddress(displayAddr);
    setSearchKeyword(displayAddr);
    // PNU: bdMgtSn(건물관리번호, 25자리) 또는 admCd(행정동코드)로 구성
    const resolvedPnu = (result.bdMgtSn as string) || (result.admCd as string) || "";
    setPnu(resolvedPnu);
    setShowResults(false);
    setSearchResults([]);
  };

  // Enter 키로 검색
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddressSearch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background rounded-t-2xl w-full max-w-md mx-auto shadow-2xl p-5 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
        
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
          <div className="relative">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              🏠 정확한 건물 주소 <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  // 기존 선택을 초기화
                  if (address) {
                    setAddress("");
                    setPnu("");
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="동/도로명 입력 후 검색 (예: 상도동 477)"
                className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button 
                onClick={handleAddressSearch}
                disabled={isSearching || searchKeyword.trim().length < 2}
                className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                {isSearching ? "..." : "검색"}
              </button>
            </div>

            {/* 검색 결과 드롭다운 */}
            {showResults && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    <svg className="animate-spin h-4 w-4 mx-auto mb-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    검색 중...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    검색 결과가 없습니다. 다른 키워드로 시도해 주세요.
                  </div>
                ) : (
                  searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => selectAddress(result)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary/50 border-b border-border/50 last:border-0 transition-colors"
                    >
                      <p className="text-xs font-medium text-foreground truncate">
                        {result.roadAddr || result.jibunAddr}
                      </p>
                      {result.jibunAddr && result.roadAddr && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {result.jibunAddr}
                        </p>
                      )}
                      {result.bdNm && (
                        <p className="text-[10px] text-primary/70 mt-0.5">{result.bdNm}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 선택된 주소 + PNU 표시 */}
            {address && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-emerald-500">✅ 주소 확인 완료</span>
                {pnu && (
                  <span className="text-[10px] text-emerald-500/70 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    PNU: {pnu}
                  </span>
                )}
              </div>
            )}
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
