"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";

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
  existingPhotoUrls?: string[];
  initialAddress?: string;
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
  existingPhotoUrls,
  initialAddress,
}: ImDataBottomSheetProps) {
  const [state, setState] = useState<BottomSheetState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState("");

  // Form states
  const [address, setAddress] = useState("");
  const [pnu, setPnu] = useState("");
  const [monthlyRent, setMonthlyRent] = useState(""); // 만원 단위
  const [totalDeposit, setTotalDeposit] = useState(""); // 보증금 (만원)
  const [mgmtFeeTotal, setMgmtFeeTotal] = useState(""); // 관리비 (만원)
  const [loanAmount, setLoanAmount] = useState(""); // 융자 (만원)
  const [askingPrice, setAskingPrice] = useState(""); // 매매가 (만원)
  const [vacancyPct, setVacancyPct] = useState<number | "">("");
  const [brokerHighlight, setBrokerHighlight] = useState("");

  // ── 물류센터 전용 필드 state ──
  const [ceilingHeight, setCeilingHeight] = useState<string>("");
  const [dockCount, setDockCount] = useState<string>("");
  const [dockLevelerCount, setDockLevelerCount] = useState<string>("");
  const [maxVehicleTon, setMaxVehicleTon] = useState<string>("");
  const [floorLoadTon, setFloorLoadTon] = useState<string>("");
  const [coldStorageArea, setColdStorageArea] = useState<string>("");
  const [coldStorageType, setColdStorageType] = useState<string>("none");
  const [loadingArea, setLoadingArea] = useState<string>("");
  const [vehicleAccessType, setVehicleAccessType] = useState<string>("dock");
  const [fireRating, setFireRating] = useState<string>("");
  const [sprinkler, setSprinkler] = useState(false);
  const [columnSpan, setColumnSpan] = useState<string>("");
  const [powerCapacity, setPowerCapacity] = useState<string>("");
  const [hasOfficeSpace, setHasOfficeSpace] = useState(false);
  const [officeArea, setOfficeArea] = useState<string>("");
  const [distanceToIc, setDistanceToIc] = useState<string>("");
  const [icName, setIcName] = useState<string>("");

  // Address search states
  const [searchKeyword, setSearchKeyword] = useState(initialAddress || "");
  const [searchResults, setSearchResults] = useState<AddressResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const monthlyRentRef = useRef<HTMLInputElement>(null);
  const totalDepositRef = useRef<HTMLInputElement>(null);
  const mgmtFeeTotalRef = useRef<HTMLInputElement>(null);
  const loanAmountRef = useRef<HTMLInputElement>(null);
  const askingPriceRef = useRef<HTMLInputElement>(null);
  const dropdownAnchorRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  // Photo states
  const [existingUrls, setExistingUrls] = useState<string[]>(existingPhotoUrls || []);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [photoCaptions, setPhotoCaptions] = useState<Record<number, string>>({});
  const [floorLeases, setFloorLeases] = useState<Array<{ floor: string; tenant_type?: string; deposit_manwon?: number; rent_manwon?: number; mgmt_fee_manwon?: number; is_vacant?: boolean; }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [readinessScore, setReadinessScore] = useState(0);

  // Sync props when opening/changing
  useEffect(() => {
    if (existingPhotoUrls) {
      setExistingUrls(existingPhotoUrls);
    }
  }, [existingPhotoUrls]);

  useEffect(() => {
    if (isOpen && initialAddress) {
      setSearchKeyword(initialAddress);
      if (!address) {
        const timer = setTimeout(() => {
          handleAddressSearch(initialAddress);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [initialAddress, isOpen]);

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
    if (existingUrls.length > 0 || photoFiles.length > 0) score += 10;
    
    // Max 100
    setReadinessScore(Math.min(score, 100));
  }, [areaSignal, priceBand, assetType, address, pnu, monthlyRent, vacancyPct, vacancySignal, brokerHighlight, existingUrls, photoFiles]);

  // 드롭다운 위치 계산 (portal용)
  const updateDropdownRect = () => {
    if (dropdownAnchorRef.current) {
      setDropdownRect(dropdownAnchorRef.current.getBoundingClientRect());
    }
  };

  if (!isOpen) return null;

  async function handleCreate() {
    setState("loading");
    setProgress("데이터 검증 및 수집 중...");

    if (!buildingId) {
      setState("error");
      setErrorMsg("건물 ID가 누락되었습니다. 페이지를 새로고침해주세요.");
      return;
    }

    try {
      const directData: Record<string, unknown> = {};
      if (areaSignal) directData.area_signal = areaSignal;
      if (assetType) directData.asset_type = assetType;
      if (priceBand) directData.price_band = priceBand;
      if (sizeSignal) directData.size_signal = sizeSignal;
      if (fitSummary) directData.fit_summary = fitSummary;
      if (cautionSummary) directData.caution_summary = cautionSummary;

      let uploadedPhotoUrls: string[] = [];
      if (photoFiles.length > 0) {
        setProgress("사진 업로드 중...");
        const supabase = createClient();
        let uploadFailCount = 0;
        let lastUploadError = "";
        for (const file of photoFiles) {
          const fileName = `${buildingId}/${Date.now()}_${file.name}`;
          const { data, error } = await supabase.storage
            .from("building_photos")
            .upload(fileName, file, { upsert: true });
          if (data && !error) {
            const { data: urlData } = supabase.storage
              .from("building_photos")
              .getPublicUrl(data.path);
            uploadedPhotoUrls.push(urlData.publicUrl);
          } else {
            uploadFailCount++;
            lastUploadError = error?.message || "unknown error";
            console.error(`[Photo Upload] Failed: ${file.name}`, error?.message, error);
          }
        }
        if (uploadFailCount > 0 && uploadedPhotoUrls.length === 0) {
          // 모든 사진 업로드 실패
          alert(`사진 ${uploadFailCount}장 업로드 실패: ${lastUploadError}\nSupabase Storage 버킷(building_photos)을 확인해주세요.`);
        } else if (uploadFailCount > 0) {
          alert(`${uploadFailCount}장 업로드 실패 (${uploadedPhotoUrls.length}장 성공). 성공한 사진으로 계속합니다.`);
        }
      }

      setProgress("AI 투자설명서 생성 중...");

      const isLogistics = assetType?.includes("물류") || assetType?.toLowerCase().includes("logistics");
      const logistics = isLogistics ? {
        ceiling_height_m: ceilingHeight ? parseFloat(ceilingHeight) : undefined,
        dock_count: dockCount ? parseInt(dockCount) : undefined,
        dock_leveler_count: dockLevelerCount ? parseInt(dockLevelerCount) : undefined,
        max_vehicle_ton: maxVehicleTon ? parseInt(maxVehicleTon) : undefined,
        floor_load_ton_m2: floorLoadTon ? parseFloat(floorLoadTon) : undefined,
        cold_storage_area_pyeong: coldStorageArea ? parseFloat(coldStorageArea) : undefined,
        cold_storage_type: coldStorageType as any,
        loading_area_pyeong: loadingArea ? parseFloat(loadingArea) : undefined,
        vehicle_access_type: vehicleAccessType as any,
        fire_rating: fireRating || undefined,
        sprinkler,
        column_span_m: columnSpan || undefined,
        power_capacity_kw: powerCapacity ? parseFloat(powerCapacity) : undefined,
        has_office_space: hasOfficeSpace,
        office_area_pyeong: officeArea ? parseFloat(officeArea) : undefined,
        distance_to_ic_km: distanceToIc ? parseFloat(distanceToIc) : undefined,
        ic_name: icName || undefined,
      } : undefined;

      const requestBody = {
        building_id: buildingId,
        vacancy_status: vacancySignal,
        vacancy_pct: vacancyPct !== "" ? Number(vacancyPct) : undefined,
        monthly_rent_total_krw: monthlyRent ? Number(monthlyRent) * 10000 : undefined,
        total_deposit_manwon: totalDeposit ? Number(totalDeposit) : undefined,
        mgmt_fee_total_manwon: mgmtFeeTotal ? Number(mgmtFeeTotal) : undefined,
        loan_amount_manwon: loanAmount ? Number(loanAmount) : undefined,
        asking_price_manwon: askingPrice ? Number(askingPrice) : undefined,
        resolved_address: address || undefined,
        resolved_pnu: pnu || undefined,
        broker_highlight: brokerHighlight || undefined,
        direct_data: Object.keys(directData).length > 0 ? directData : undefined,
        photo_urls: [...existingUrls, ...uploadedPhotoUrls].length > 0 ? [...existingUrls, ...uploadedPhotoUrls] : undefined,
        photo_captions: Object.keys(photoCaptions).length > 0 ? photoCaptions : undefined,
        floor_leases: floorLeases.length > 0 ? floorLeases : undefined,
        logistics,
      };

      // ── 비동기 생성 ──
      // 서버에서 동기 실행 후 결과 포함하여 응답
      const startRes = await fetch("/api/broker/im-lite/generate-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({}));
        throw new Error(errData.error ?? `IM 생성 시작 실패 (status: ${startRes.status})`);
      }

      const startData = await startRes.json();

      // 서버에서 동기 실행 완료 → 즉시 결과 처리
      if (startData.status === "completed" && startData.result) {
        setState("success");
        setProgress(`✅ ${startData.result.sections_count ?? 7}섹션 생성 완료!`);
        const reviewUrl = startData.result.im_lite_id
          ? `/broker/im-approval/${startData.result.im_lite_id}`
          : startData.result.url;
        setTimeout(() => { window.location.href = reviewUrl; }, 1500);
        return;
      } else if (startData.status === "failed") {
        setState("error");
        setErrorMsg(startData.result?.error ?? "IM 생성 실패");
        setProgress("");
        return;
      }

      // Fallback: 폴링 (서버가 아직 processing인 경우)
      const jobId = startData.jobId;
      if (!jobId) throw new Error("작업 ID를 받지 못했습니다");

      const MAX_POLL_MS = 120_000;
      const POLL_INTERVAL = 3_000;
      const startTime = Date.now();
      let dotCount = 0;

      while (Date.now() - startTime < MAX_POLL_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        dotCount = (dotCount + 1) % 4;
        const dots = ".".repeat(dotCount + 1);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setProgress(`AI 분석 중${dots} (${elapsed}초 경과)`);

        try {
          const pollRes = await fetch(`/api/broker/im-lite/job-status?jobId=${encodeURIComponent(jobId)}`);
          if (!pollRes.ok) continue;
          const job = await pollRes.json();

          if (job.status === "completed" && job.result) {
            setState("success");
            setProgress(`✅ ${job.result.sections_count ?? 7}섹션 생성 완료!`);
            const reviewUrl = job.result.im_lite_id
              ? `/broker/im-approval/${job.result.im_lite_id}`
              : job.result.url;
            setTimeout(() => { window.location.href = reviewUrl; }, 1500);
            return;
          } else if (job.status === "failed") {
            setState("error");
            setErrorMsg(job.result?.error ?? "IM 생성 실패");
            setProgress("");
            return;
          }
        } catch {
          continue;
        }
      }

      // 타임아웃
      setState("error");
      setErrorMsg("생성 시간이 초과되었습니다. 잠시 후 IM 보관함에서 확인해 주세요.");
      setProgress("");
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message ?? "서버 요청 실패");
      setProgress("");
    }
  }

  // 주소 검색 (실제 API 호출)
  const handleAddressSearch = async (overrideKeyword?: string) => {
    const keyword = (overrideKeyword !== undefined ? overrideKeyword : searchKeyword).trim();
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

  // Enter 키로 검색 (주소)
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddressSearch();
    }
  };

  const handleEnterKey = (e: React.KeyboardEvent, nextRef: React.RefObject<HTMLInputElement | null> | null) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      } else {
        const vacancyBtns = document.querySelectorAll('[data-vacancy-btn]');
        if (vacancyBtns.length > 0) (vacancyBtns[0] as HTMLElement).focus();
      }
    }
  };

  // 서버 기준점: 55점이지만 UI에서 직접 제공되는 area/asset/price로 최소 30점 보장.
  // 주소+월세 없이도 시도 가능하도록 UI 임계값을 40점으로 완화
  const canGenerate = readinessScore >= 40;

  // Portal을 사용하여 document.body에 직접 렌더링
  // 부모 요소의 transform/filter CSS가 fixed 포지셔닝을 깨뜨리는 문제 방지
  if (typeof window === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,20px)]">
        
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-foreground">📊 투자설명서 데이터 보강</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4 shrink-0">
          데이터가 많을수록 IM 품질과 정확도가 월등히 높아집니다.
        </p>

        {/* Scrollable Form Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 mb-6 pb-10">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              🏠 정확한 건물 주소
            </label>
          <div ref={dropdownAnchorRef} className="relative">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  if (address) { setAddress(""); setPnu(""); }
                }}
                onKeyDown={handleSearchKeyDown}
                onFocus={updateDropdownRect}
                placeholder="동/도로명 입력 후 검색 (예: 상도동 477)"
                className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button 
                onClick={() => { updateDropdownRect(); handleAddressSearch(); }}
                disabled={isSearching || searchKeyword.trim().length < 2}
                className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                {isSearching ? "…" : "검색"}
              </button>
            </div>

            {/* 주소 확인 배지 */}
            {address && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-emerald-500 font-medium">✅ {address}</span>
              </div>
            )}

            {/* 검색 결과 드롭다운 — 인라인 absolute로 겹침 문제 해결 */}
            {showResults && searchResults.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-2xl max-h-52 overflow-y-auto z-50"
              >
                {searchResults.map((result, i) => (
                  <button
                    key={i}
                    onClick={() => selectAddress(result)}
                    className="w-full text-left px-4 py-3 hover:bg-secondary/50 border-b border-border/50 last:border-0 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{result.roadAddr || result.jibunAddr}</p>
                    {result.jibunAddr && result.roadAddr && (
                      <p className="text-xs text-muted-foreground mt-0.5">{result.jibunAddr}</p>
                    )}
                    {result.bdNm && (
                      <p className="text-xs text-primary/70 mt-0.5">{result.bdNm}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showResults && isSearching && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-2xl z-50 p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                검색 중...
              </div>
            )}
          </div>
          </div>

            {/* Rent Roll Import */}
            <RentRollImporter 
              onImport={(data) => {
                setMonthlyRent(data.monthlyRent.toString());
                setTotalDeposit(data.totalDeposit.toString());
                setMgmtFeeTotal(data.mgmtFeeTotal.toString());
                setVacancyPct(data.vacancyPct);
                setFloorLeases(data.floorLeases || []);
              }}
            />

            {/* Monthly Rent */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              💰 월 임대료 총액
            </label>
            <div className="relative">
              <input
                ref={monthlyRentRef}
                type="number"
                inputMode="numeric"
                min="0"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                onKeyDown={(e) => handleEnterKey(e, totalDepositRef)}
                placeholder="예: 1500"
                className="w-full bg-secondary/50 border border-border rounded-lg pl-4 pr-14 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">만원</span>
            </div>
            {monthlyRent && Number(monthlyRent) > 0 && (
              <p className="text-xs text-emerald-500 mt-1.5">✅ 월 {Number(monthlyRent).toLocaleString()}만원 ({Math.round(Number(monthlyRent) * 12 / 10000 * 10) / 10}억원/년)</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Total Deposit */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                🔒 보증금 총액
              </label>
              <div className="relative">
                <input
                  ref={totalDepositRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={totalDeposit}
                  onChange={(e) => setTotalDeposit(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, mgmtFeeTotalRef)}
                  placeholder="예: 30000"
                  className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
            </div>

            {/* Mgmt Fee */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                🧹 관리비 총액
              </label>
              <div className="relative">
                <input
                  ref={mgmtFeeTotalRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={mgmtFeeTotal}
                  onChange={(e) => setMgmtFeeTotal(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, askingPriceRef)}
                  placeholder="예: 50"
                  className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
            </div>

            {/* Asking Price */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">
                  💰 매각 희망가
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const rent = Number(monthlyRent) || 0;
                    const deposit = Number(totalDeposit) || 0;
                    if (rent <= 0) return;
                    const capRateStr = prompt("역산에 사용할 수익률(%)을 입력하세요:", "4");
                    const capRate = parseFloat(capRateStr || "0");
                    if (capRate > 0 && capRate < 100) {
                      const estimatedPrice = Math.round(((rent * 12) / (capRate / 100)) + deposit);
                      setAskingPrice(estimatedPrice.toString());
                    }
                  }}
                  className="text-[10px] text-primary hover:underline"
                >
                  수익률로 역산
                </button>
              </div>
              <div className="relative">
                <input
                  ref={askingPriceRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, loanAmountRef)}
                  placeholder="예: 250000"
                  className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
              {/* 자동 계산된 수익률 표시 */}
              {Number(monthlyRent) > 0 && Number(askingPrice) > 0 && (
                <p className="mt-1 text-[11px] text-primary/80">
                  📊 예상 Cap Rate: <strong>{((Number(monthlyRent) * 12 / Number(askingPrice)) * 100).toFixed(1)}%</strong>
                  <span className="text-muted-foreground ml-1">(월세×12 ÷ 매각가)</span>
                </p>
              )}
            </div>

            {/* Loan Amount */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                🏦 선순위 대출 잔액
              </label>
              <div className="relative">
                <input
                  ref={loanAmountRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, null)}
                  placeholder="예: 100000"
                  className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
            </div>
          </div>

          {/* Vacancy */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              📊 현재 공실률
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 10, 20].map((pct) => (
                <button
                  key={pct}
                  data-vacancy-btn
                  onClick={() => setVacancyPct(pct === vacancyPct ? "" : pct)}
                  className={`py-2.5 text-sm font-semibold rounded-xl border-2 transition-all ${
                    vacancyPct === pct && typeof vacancyPct === 'number'
                      ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:bg-secondary"
                  }`}
                >
                  {pct === 0 ? "만실" : `~${pct}%`}
                </button>
              ))}
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="직접"
                  value={typeof vacancyPct === 'number' && ![0, 10, 20].includes(vacancyPct) ? vacancyPct : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVacancyPct(v === '' ? '' : Math.min(100, Math.max(0, Number(v))));
                  }}
                  className={`w-full py-2 text-sm font-semibold rounded-xl border-2 text-center transition-all ${
                    typeof vacancyPct === 'number' && ![0, 10, 20].includes(vacancyPct)
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:bg-secondary"
                  }`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
              </div>
            </div>
            {typeof vacancyPct === 'number' && vacancyPct > 0 && (
              <p className="text-xs text-amber-500 mt-1.5">⚠️ 공실률 {vacancyPct}% 반영</p>
            )}
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex justify-between items-center">
              <span>📸 건물 대표 사진 (최대 12장)</span>
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">점수 +10</span>
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
              {/* Existing Photos */}
              {existingUrls.map((url, idx) => (
                <div key={`existing-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1">
                  <div className="relative">
                    <img src={url} alt={`Existing ${idx}`} className="w-20 h-20 object-cover rounded-lg border border-border" />
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded font-bold">기존</span>
                    <button
                      type="button"
                      onClick={() => {
                        setExistingUrls(prev => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                    >
                      ×
                    </button>
                  </div>
                  <div className="h-5" />
                </div>
              ))}

              {/* Newly Uploaded Photos */}
              {photoPreviewUrls.map((url, idx) => (
                <div key={`new-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1">
                  <div className="relative">
                    <img src={url} alt={`Preview ${idx}`} className="w-20 h-20 object-cover rounded-lg border border-border" />
                    <span className="absolute bottom-1 left-1 bg-indigo-600/80 text-white text-[8px] px-1 rounded font-bold">신규</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = [...photoFiles];
                        newFiles.splice(idx, 1);
                        setPhotoFiles(newFiles);
                        const newUrls = [...photoPreviewUrls];
                        URL.revokeObjectURL(newUrls[idx]);
                        newUrls.splice(idx, 1);
                        setPhotoPreviewUrls(newUrls);
                        // Reindex captions
                        const newCaptions: Record<number, string> = {};
                        Object.entries(photoCaptions).forEach(([k, v]) => {
                          const ki = parseInt(k);
                          if (ki < idx) newCaptions[ki] = v;
                          else if (ki > idx) newCaptions[ki - 1] = v;
                        });
                        setPhotoCaptions(newCaptions);
                      }}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="설명"
                    value={photoCaptions[idx] || ''}
                    onChange={(e) => setPhotoCaptions(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="w-20 text-[10px] px-1 py-0.5 rounded border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                  />
                </div>
              ))}

              {(existingUrls.length + photoFiles.length) < 12 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 shrink-0 snap-start rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors bg-secondary/30"
                >
                  <span className="text-xl leading-none mb-1">+</span>
                  <span className="text-[10px]">추가</span>
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (!e.target.files?.length) return;
                const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
                const validFiles = Array.from(e.target.files).filter(f => f.size <= MAX_FILE_SIZE);
                if (validFiles.length < e.target.files.length) {
                  alert("10MB 이상의 파일은 제외되었습니다.");
                }
                const files = validFiles.slice(0, 12 - (existingUrls.length + photoFiles.length));
                setPhotoFiles((prev) => [...prev, ...files]);
                const newUrls = files.map((f) => URL.createObjectURL(f));
                setPhotoPreviewUrls((prev) => [...prev, ...newUrls]);
                e.target.value = "";
              }}
            />
          </div>

          {/* Logistics Fields */}
          {(assetType?.includes("물류") || assetType?.toLowerCase().includes("logistics")) && (
            <div className="border border-border/80 rounded-xl p-4 bg-secondary/20 space-y-4">
              <div className="flex justify-between items-center border-b border-border/60 pb-2">
                <span className="text-xs font-bold text-foreground">🏗️ 물류센터 상세 스펙</span>
                <span className="text-[10px] text-muted-foreground">정밀한 분석을 위해 수동 입력을 권장합니다.</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* 1. 건물 스펙 */}
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-1">기본 제원</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">천장고 (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 10.5"
                    value={ceilingHeight}
                    onChange={(e) => setCeilingHeight(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">기둥 간격 (m)</label>
                  <input
                    type="text"
                    placeholder="예: 10x12"
                    value={columnSpan}
                    onChange={(e) => setColumnSpan(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">바닥 하중 (ton/㎡)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 5.0"
                    value={floorLoadTon}
                    onChange={(e) => setFloorLoadTon(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">전기 용량 (kW)</label>
                  <input
                    type="number"
                    placeholder="예: 500"
                    value={powerCapacity}
                    onChange={(e) => setPowerCapacity(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 2. 도크/하역 */}
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">도크 및 접안</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">도크 수</label>
                  <input
                    type="number"
                    placeholder="예: 24"
                    value={dockCount}
                    onChange={(e) => setDockCount(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">도크 레벨러 수</label>
                  <input
                    type="number"
                    placeholder="예: 12"
                    value={dockLevelerCount}
                    onChange={(e) => setDockLevelerCount(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">최대 접안 차량 (톤)</label>
                  <input
                    type="number"
                    placeholder="예: 25"
                    value={maxVehicleTon}
                    onChange={(e) => setMaxVehicleTon(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">하역장 면적 (평)</label>
                  <input
                    type="number"
                    placeholder="예: 150"
                    value={loadingArea}
                    onChange={(e) => setLoadingArea(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 3. 냉동/냉장 */}
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">설비 및 보관</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">냉동/냉장 면적 (평)</label>
                  <input
                    type="number"
                    placeholder="예: 500"
                    value={coldStorageArea}
                    onChange={(e) => setColdStorageArea(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">냉장 유형</label>
                  <select
                    value={coldStorageType}
                    onChange={(e) => setColdStorageType(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="none">없음</option>
                    <option value="frozen">냉동 전용</option>
                    <option value="chilled">냉장 전용</option>
                    <option value="both">냉동/냉장 혼용</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">차량 접근 방식</label>
                  <select
                    value={vehicleAccessType}
                    onChange={(e) => setVehicleAccessType(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="dock">도크 접안</option>
                    <option value="ramp">램프 이동</option>
                    <option value="both">혼합 방식</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">내화 등급</label>
                  <input
                    type="text"
                    placeholder="예: 1급 내화"
                    value={fireRating}
                    onChange={(e) => setFireRating(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 4. 부대시설 및 안전 */}
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">소방 및 부대시설</div>
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="sprinkler"
                    checked={sprinkler}
                    onChange={(e) => setSprinkler(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-4 h-4 bg-background"
                  />
                  <label htmlFor="sprinkler" className="text-xs text-muted-foreground cursor-pointer">스프링클러 작동 완료</label>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="hasOfficeSpace"
                    checked={hasOfficeSpace}
                    onChange={(e) => setHasOfficeSpace(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-4 h-4 bg-background"
                  />
                  <label htmlFor="hasOfficeSpace" className="text-xs text-muted-foreground cursor-pointer">사무공간 보유</label>
                </div>
                {hasOfficeSpace && (
                  <div className="col-span-2">
                    <label className="block text-[10px] text-muted-foreground mb-1">사무공간 면적 (평)</label>
                    <input
                      type="number"
                      placeholder="예: 50"
                      value={officeArea}
                      onChange={(e) => setOfficeArea(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                )}

                {/* 5. 고속도로 IC 정보 */}
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">교통 입지 (고속도로 IC)</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">IC 명칭</label>
                  <input
                    type="text"
                    placeholder="예: 성수IC"
                    value={icName}
                    onChange={(e) => setIcName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">IC까지의 거리 (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 3.5"
                    value={distanceToIc}
                    onChange={(e) => setDistanceToIc(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              📝 중개인 한줄 코멘트
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

        {/* Footer actions - Fixed at bottom */}
        <div className="shrink-0 pt-3 border-t border-border/40 mt-auto bg-background">
          <div className={`rounded-xl p-3 mb-3 border-2 transition-colors flex items-center justify-between ${
            canGenerate ? "bg-emerald-500/5 border-emerald-500/30" : "bg-amber-500/5 border-amber-500/20"
          }`}>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-semibold text-foreground">데이터 충실도</span>
                <span className={`text-xs font-bold ${canGenerate ? "text-emerald-500" : "text-amber-500"}`}>
                  {canGenerate ? "🟢" : "🟠"} {readinessScore}점
                </span>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ${
                    readinessScore >= 70 ? "bg-emerald-500" : readinessScore >= 40 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
              <p className={`text-[10px] mt-1.5 font-medium ${
                canGenerate ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}>
                {canGenerate ? "✅ 투자설명서 작성 가능" : "⚠️ 주소/월세 추가 입력 필요"}
              </p>
            </div>
          </div>

          {/* Error & CTA */}
          {state === "error" && (
            <p className="text-xs text-rose-500 text-center mb-2">⚠️ {errorMsg}</p>
          )}
          
          {state === "success" ? (
            <button disabled className="w-full bg-emerald-600 text-white rounded-xl py-3 text-sm font-bold">
              ✅ {progress}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={state === "loading" || !canGenerate}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl py-3 text-sm font-bold shadow-md disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
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
                "📱 투자설명서 만들기"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
