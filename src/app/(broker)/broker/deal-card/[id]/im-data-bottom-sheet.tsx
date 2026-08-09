"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";
import { computeFinancialSummary } from '@/domain/building/financials';
import { toast } from "sonner";

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
  // v3: Deal card auto-supply data
  prefillMonthlyRent?: number; // 만원 단위
  prefillTotalDeposit?: number; // 만원 단위
  prefillMgmtFee?: number; // 만원 단위
  prefillAskingPrice?: number; // 만원 단위
  prefillLoanAmount?: number; // 만원 단위
  prefillVacancyPct?: number;
  currentDataGrade?: string; // A/B/C/D
  gradeUpItems?: Array<{ field: string; label: string; gradeContribution: string }>;
  initialStage?: 'basic' | 'pro';
  targetTier?: 'basic' | 'pro';
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
  prefillMonthlyRent,
  prefillTotalDeposit,
  prefillMgmtFee,
  prefillAskingPrice,
  prefillLoanAmount,
  prefillVacancyPct,
  currentDataGrade,
  gradeUpItems,
  initialStage,
  targetTier = 'basic',
}: ImDataBottomSheetProps) {
  const [stage, setStage] = useState<'basic' | 'pro'>(initialStage || targetTier);
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
  const [loanStatus, setLoanStatus] = useState<string>("unknown");
  const [ancillaryIncomes, setAncillaryIncomes] = useState<any[]>([]);
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

  // ── 운영형 (호텔/모텔/펜션) 필드 state ──
  const [roomCount, setRoomCount] = useState<string>("");
  const [averageDailyRate, setAverageDailyRate] = useState<string>(""); // ADR (만원/박)
  const [occupancyRate, setOccupancyRate] = useState<string>(""); // OCC (%)
  const [gopMargin, setGopMargin] = useState<string>(""); // GOP (%)
  const [operatingModel, setOperatingModel] = useState<string>("self");
  const [operatingEntity, setOperatingEntity] = useState<string>("");

  // ── 포스처 및 Pack Slot 신규 State ──
  const [investmentPosture, setInvestmentPosture] = useState<string>("income");

  // 개발형 (DevelopmentPlan, VacatePlan, PermitRisk)
  const [devTargetUse, setDevTargetUse] = useState<string>("office");
  const [devTargetScalePyung, setDevTargetScalePyung] = useState<string>("");
  const [devExpectedSalePricePerPyung, setDevExpectedSalePricePerPyung] = useState<string>("");
  const [devConstructionCostPerPyung, setDevConstructionCostPerPyung] = useState<string>("750");
  const [devContractorStatus, setDevContractorStatus] = useState<string>("undecided");
  const [vacateResponsibility, setVacateResponsibility] = useState<string>("seller");
  const [vacateTenantCount, setVacateTenantCount] = useState<string>("");
  const [vacateEstimatedCostManwon, setVacateEstimatedCostManwon] = useState<string>("");
  const [vacateEstimatedMonths, setVacateEstimatedMonths] = useState<string>("");
  const [permitKinds, setPermitKinds] = useState<string[]>([]);
  const [permitStatus, setPermitStatus] = useState<string>("in_progress");
  const [permitEstimatedMonths, setPermitEstimatedMonths] = useState<string>("");

  // 자가사용형 (OccupancyPlan)
  const [occHeadcount, setOccHeadcount] = useState<string>("");
  const [occAreaPerHeadPyung, setOccAreaPerHeadPyung] = useState<string>("3.3");
  const [occDesiredFloors, setOccDesiredFloors] = useState<string>("");
  const [occCurrentRentManwon, setOccCurrentRentManwon] = useState<string>("");

  // 구분소유 (SectionalSpec)
  const [sectionalOwnerCount, setSectionalOwnerCount] = useState<string>("");
  const [sectionalManagementBody, setSectionalManagementBody] = useState<string>("unknown");
  const [sectionalMasterLease, setSectionalMasterLease] = useState<string>("no");
  const [sectionalLandSharePct, setSectionalLandSharePct] = useState<string>("100");
  const [sectionalFullPurchase, setSectionalFullPurchase] = useState<string>("full");

  // 주거사양 (ResidentialSpec)
  const [resTotalUnits, setResTotalUnits] = useState<string>("");
  const [resJeonseUnits, setResJeonseUnits] = useState<string>("");
  const [resMonthlyUnits, setResMonthlyUnits] = useState<string>("");
  const [resJeonseDepositTotalManwon, setResJeonseDepositTotalManwon] = useState<string>("");
  const [resIllegalExtension, setResIllegalExtension] = useState<boolean>(false);



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

  // v3: Auto-prefill from deal card data
  useEffect(() => {
    if (isOpen) {
      if (initialStage) setStage(initialStage);
      if (prefillMonthlyRent && !monthlyRent) setMonthlyRent(String(prefillMonthlyRent));
      if (prefillTotalDeposit && !totalDeposit) setTotalDeposit(String(prefillTotalDeposit));
      if (prefillMgmtFee && !mgmtFeeTotal) setMgmtFeeTotal(String(prefillMgmtFee));
      if (prefillAskingPrice && !askingPrice) setAskingPrice(String(prefillAskingPrice));
      if (prefillLoanAmount && !loanAmount) {
        setLoanAmount(String(prefillLoanAmount));
        setLoanStatus("confirmed");
      }
      if (prefillVacancyPct != null && vacancyPct === '') setVacancyPct(prefillVacancyPct);
    }
  }, [isOpen, initialStage]); // eslint-disable-line react-hooks/exhaustive-deps

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
          toast.error(`사진 ${uploadFailCount}장 업로드 실패: ${lastUploadError}\nSupabase Storage 버킷(building_photos)을 확인해주세요.`);
        } else if (uploadFailCount > 0) {
          toast.error(`${uploadFailCount}장 업로드 실패 (${uploadedPhotoUrls.length}장 성공). 성공한 사진으로 계속합니다.`);
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

      const isHospitality = ['hotel', 'resort', 'motel', 'pension', 'guest_house'].some(
        type => assetType?.toLowerCase().includes(type) || assetType?.includes('호텔')
      );
      const hospitalitySpec = isHospitality ? {
        totalRoomCount: roomCount ? parseInt(roomCount) : undefined,
        averageDailyRate: averageDailyRate ? parseFloat(averageDailyRate) : undefined,
        occupancyRate: occupancyRate ? parseFloat(occupancyRate) : undefined,
        gopMargin: gopMargin ? parseFloat(gopMargin) : undefined,
        operatingModel,
        operatingEntity: operatingEntity || undefined,
      } : undefined;

      const developmentSpec = investmentPosture === 'development' ? {
        targetUse: devTargetUse || undefined,
        targetScalePyung: devTargetScalePyung ? parseFloat(devTargetScalePyung) : undefined,
        expectedSalePricePerPyung: devExpectedSalePricePerPyung ? parseFloat(devExpectedSalePricePerPyung) : undefined,
        constructionCostPerPyung: devConstructionCostPerPyung ? parseFloat(devConstructionCostPerPyung) : undefined,
        contractorStatus: devContractorStatus,
      } : undefined;

      const vacateSpec = investmentPosture === 'development' ? {
        responsibility: vacateResponsibility,
        currentTenantCount: vacateTenantCount ? parseInt(vacateTenantCount) : undefined,
        estimatedCostManwon: vacateEstimatedCostManwon ? parseFloat(vacateEstimatedCostManwon) : undefined,
        estimatedMonths: vacateEstimatedMonths ? parseInt(vacateEstimatedMonths) : undefined,
      } : undefined;

      const permitSpec = investmentPosture === 'development' ? {
        permitKinds,
        status: permitStatus,
        estimatedMonths: permitEstimatedMonths ? parseInt(permitEstimatedMonths) : undefined,
      } : undefined;

      const occupancySpec = investmentPosture === 'owner_occupied' ? {
        headcount: occHeadcount ? parseInt(occHeadcount) : undefined,
        areaPerHeadPyung: occAreaPerHeadPyung ? parseFloat(occAreaPerHeadPyung) : 3.3,
        desiredFloors: occDesiredFloors || undefined,
        currentRentManwon: occCurrentRentManwon ? parseFloat(occCurrentRentManwon) : undefined,
      } : undefined;

      const isSectional = ['officetel', 'knowledge_center', 'retail_strip', 'serviced_residence'].some(
        t => assetType?.toLowerCase().includes(t) || assetType?.includes('오피스텔') || assetType?.includes('지식산업') || assetType?.includes('상가')
      );
      const sectionalSpec = isSectional ? {
        ownerCount: sectionalOwnerCount ? parseInt(sectionalOwnerCount) : undefined,
        managementBody: sectionalManagementBody,
        masterLease: sectionalMasterLease === 'yes',
        landSharePct: sectionalLandSharePct ? parseFloat(sectionalLandSharePct) : 100,
        fullPurchase: sectionalFullPurchase === 'full',
      } : undefined;

      const isResidential = ['multi_household', 'multi_family', 'mixed_shop_house'].some(
        t => assetType?.toLowerCase().includes(t) || assetType?.includes('다세대') || assetType?.includes('다가구') || assetType?.includes('상가주택')
      );
      const residentialSpec = isResidential ? {
        totalUnits: resTotalUnits ? parseInt(resTotalUnits) : undefined,
        jeonseUnits: resJeonseUnits ? parseInt(resJeonseUnits) : undefined,
        monthlyUnits: resMonthlyUnits ? parseInt(resMonthlyUnits) : undefined,
        jeonseDepositTotalManwon: resJeonseDepositTotalManwon ? parseFloat(resJeonseDepositTotalManwon) : undefined,
        illegalExtension: resIllegalExtension,
      } : undefined;

      const requestBody = {
        building_id: buildingId,
        investment_posture: investmentPosture,
        vacancy_status: vacancySignal,
        vacancy_pct: vacancyPct !== "" ? Number(vacancyPct) : undefined,
        monthly_rent_total_krw: monthlyRent ? Number(monthlyRent) * 10000 : undefined,
        total_deposit_manwon: totalDeposit ? Number(totalDeposit) : undefined,
        mgmt_fee_total_manwon: mgmtFeeTotal ? Number(mgmtFeeTotal) : undefined,
        loan_amount_manwon: loanStatus === 'confirmed' && loanAmount ? Number(loanAmount) : undefined,
        loan_status: loanStatus,
        ancillary_incomes: ancillaryIncomes.length > 0 ? ancillaryIncomes : undefined,
        asking_price_manwon: askingPrice ? Number(askingPrice) : undefined,
        resolved_address: address || undefined,
        resolved_pnu: pnu || undefined,
        broker_highlight: brokerHighlight || undefined,
        direct_data: Object.keys(directData).length > 0 ? directData : undefined,
        photo_urls: [...existingUrls, ...uploadedPhotoUrls].length > 0 ? [...existingUrls, ...uploadedPhotoUrls] : undefined,
        photo_captions: Object.keys(photoCaptions).length > 0 ? photoCaptions : undefined,
        floor_leases: floorLeases.length > 0 ? floorLeases : undefined,
        logistics,
        hospitalitySpec,
        developmentSpec,
        vacateSpec,
        permitSpec,
        occupancySpec,
        sectionalSpec,
        residentialSpec,
        tier: targetTier,
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

  // 주소+월세 없이도 시도 가능하도록 UI 임계값을 40점으로 완화
  const isProValid = currentDataGrade === 'A' || currentDataGrade === 'B' || readinessScore >= 75;
  const canGenerate = stage === 'basic' ? true : isProValid;

  // Portal을 사용하여 document.body에 직접 렌더링
  // 부모 요소의 transform/filter CSS가 fixed 포지셔닝을 깨뜨리는 문제 방지
  if (typeof window === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,20px)]">
        
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-foreground">
            {stage === 'basic' ? '📊 Basic IM 만들기' : '📊 투자설명서 데이터 보강'}
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        {stage === 'pro' && (
          <button onClick={() => setStage('basic')} className="text-sm text-primary underline mb-4 shrink-0 text-left">
            ← Basic으로 돌아가기
          </button>
        )}
        <p className="text-sm text-muted-foreground mb-4 shrink-0">
          {stage === 'basic' 
            ? '기본 정보를 입력하여 모바일 투자설명서를 생성하세요. 추가 데이터는 Pro에서.' 
            : '상세 렌트롤·DCF·부가수입을 입력하여 프리미엄 IM을 완성하세요.'}
        </p>

        {/* Scrollable Form Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 mb-6 pb-10">
          {/* 🎯 투자 포스처 선택 */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex justify-between items-center">
              <span>🎯 투자 포스처 선택</span>
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">위젯 맞춤</span>
            </label>
            <div className="grid grid-cols-5 gap-1">
              {[
                { id: 'income', label: '임대수익', emoji: '💰' },
                { id: 'owner_occupied', label: '자가사용', emoji: '🏢' },
                { id: 'development', label: '개발형', emoji: '🏗️' },
                { id: 'operating', label: '운영형', emoji: '🏨' },
                { id: 'trading', label: '단기매매', emoji: '📈' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setInvestmentPosture(item.id)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all flex flex-col items-center gap-0.5 ${
                    investmentPosture === item.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/40 text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-sm">{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 주소 + 월세 + 렌트롤 — Basic에도 표시 */}
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
            {prefillMonthlyRent && monthlyRent === String(prefillMonthlyRent) && (
              <span className="text-[10px] text-blue-400 ml-1">📋 딜카드에서 자동 입력</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Total Deposit */}
            {/* 보증금 — Basic에도 표시 */}
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
              {prefillTotalDeposit && totalDeposit === String(prefillTotalDeposit) && (
                <span className="text-[10px] text-blue-400 mt-1 block">📋 딜카드에서 자동 입력</span>
              )}
            </div>

            {/* Mgmt Fee */}
            {stage === 'pro' && (
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
            )}

            {/* Asking Price */}
            <div className={stage === 'basic' ? 'col-span-2' : ''}>
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
                      // S0-T12: Use centralized financials module instead of inline math
                      const result = computeFinancialSummary({
                        askingPriceKrw: 0,
                        grossAnnualIncomeKrw: rent * 12,
                        totalDepositKrw: deposit,
                      });
                      // Reverse-engineer price from cap rate: Price = NOI / (capRate/100) + deposit
                      const estimatedPrice = Math.round((result.noiKrw.value / (capRate / 100)) + deposit);
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
              {prefillAskingPrice && askingPrice === String(prefillAskingPrice) && (
                <span className="text-[10px] text-blue-400 mt-1 block">📋 딜카드에서 자동 입력</span>
              )}
            </div>

            {/* Loan Amount */}
            {stage === 'pro' && (
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                🏦 대출 현황
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'confirmed', label: '대출 있음', icon: '💰' },
                  { value: 'no_loan', label: '무대출 확인', icon: '✅' },
                  { value: 'unknown', label: '미확인', icon: '❓' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLoanStatus(opt.value)}
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                      loanStatus === opt.value
                        ? 'bg-primary/20 border-primary/50 text-primary border'
                        : 'bg-secondary/50 border-border text-muted-foreground border hover:border-primary/40'
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
              {loanStatus === 'confirmed' && (
                <div className="relative mt-2">
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
              )}
              {loanStatus === 'unknown' && (
                <p className="mt-2 text-[10px] text-amber-500">
                  ⚠️ 등기부등본 미열람 — 자기자본 산출 시 대출 미반영 안내가 IM에 표시됩니다
                </p>
              )}
              {prefillLoanAmount && loanAmount === String(prefillLoanAmount) && loanStatus === 'confirmed' && (
                <span className="text-[10px] text-blue-400 mt-1 block">📋 딜카드에서 자동 입력</span>
              )}
            </div>
            )}

            {/* 🏨 운영형 (호텔/모텔/펜션) 전용 필드 */}
            {['hotel', 'resort', 'motel', 'pension', 'guest_house'].some(
              t => assetType?.toLowerCase().includes(t) || assetType?.includes('호텔')
            ) && (
              <div className="col-span-2 mt-3 border-t border-amber-500/30 pt-4 bg-amber-500/5 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-300">🏨 운영형 (숙박/호텔) 매물 상세 정보</label>
                  <span className="text-[10px] text-amber-400/80 font-medium">위젯 자동 시뮬레이션에 활용</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">총 객실 수</label>
                    <input
                      type="number"
                      placeholder="예: 45"
                      value={roomCount}
                      onChange={(e) => setRoomCount(e.target.value)}
                      className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">평균 객단가 (ADR)</label>
                    <input
                      type="number"
                      placeholder="예: 12 (만원)"
                      value={averageDailyRate}
                      onChange={(e) => setAverageDailyRate(e.target.value)}
                      className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">객실 점유율 (OCC)</label>
                    <input
                      type="number"
                      placeholder="예: 75 (%)"
                      value={occupancyRate}
                      onChange={(e) => setOccupancyRate(e.target.value)}
                      className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">GOP 마진율</label>
                    <input
                      type="number"
                      placeholder="예: 30 (%)"
                      value={gopMargin}
                      onChange={(e) => setGopMargin(e.target.value)}
                      className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 부가수입 섹션 */}
            {stage === 'pro' && (
            <div className="col-span-2 mt-2 border-t border-border/40 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-muted-foreground">📡 비임대 부가수입</label>
                <span className="text-[9px] text-muted-foreground/70">통신장비, 주차, 간판 등</span>
              </div>
              {ancillaryIncomes.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <select
                    className="flex-1 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                    value={item.type || 'other'}
                    onChange={(e) => {
                      const updated = [...ancillaryIncomes];
                      updated[idx] = { ...item, type: e.target.value };
                      setAncillaryIncomes(updated);
                    }}
                  >
                    <option value="telecom_antenna">통신장비 임대</option>
                    <option value="telecom_electric">통신장비 전기료</option>
                    <option value="parking">주차 수입</option>
                    <option value="signage">간판/광고</option>
                    <option value="rooftop_solar">태양광</option>
                    <option value="ev_charging">전기차 충전</option>
                    <option value="other">기타</option>
                  </select>
                  <input
                    type="number"
                    placeholder="연간 수입(만원)"
                    className="w-28 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:border-primary"
                    value={item.annualAmountKrw ? Math.round(item.annualAmountKrw / 10000) : ''}
                    onChange={(e) => {
                      const updated = [...ancillaryIncomes];
                      updated[idx] = { ...item, annualAmountKrw: Number(e.target.value) * 10000 };
                      setAncillaryIncomes(updated);
                    }}
                  />
                  <button
                    onClick={() => {
                      const updated = ancillaryIncomes.filter((_: any, i: number) => i !== idx);
                      setAncillaryIncomes(updated);
                    }}
                    className="text-red-400 text-xs hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const updated = [...ancillaryIncomes, { type: 'other', label: '', annualAmountKrw: 0, provenance: 'broker_input' }];
                  setAncillaryIncomes(updated);
                }}
                className="text-xs text-primary hover:text-primary/80"
              >
                + 부가수입 추가
              </button>
            </div>
            )}
          </div>

          {/* Vacancy */}
          {/* 공실률 — Basic에도 표시 */}
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
          {/* 사진 — Basic에도 표시 (기존 사진 + 업로드) */}
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
                  toast.error("10MB 이상의 파일은 제외되었습니다.");
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
          {stage === 'pro' && (assetType?.includes("물류") || assetType?.toLowerCase().includes("logistics")) && (
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

          {/* 🏗️ 개발형 전용 필드 (DevelopmentPlan, VacatePlan, PermitRisk) */}
          {investmentPosture === 'development' && (
            <div className="border border-indigo-500/30 rounded-xl p-4 bg-indigo-500/5 space-y-4">
              <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
                <span className="text-xs font-bold text-indigo-300">🏗️ 개발 계획 & 명도 조건 & 인허가</span>
                <span className="text-[10px] text-indigo-400 font-medium">개발형 위젯 및 Grade A 승격 필수</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80">1. 개발 계획</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">목표 용도</label>
                  <select
                    value={devTargetUse}
                    onChange={(e) => setDevTargetUse(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="office">오피스 빌딩</option>
                    <option value="commercial">근린생활시설/상가</option>
                    <option value="residential">주거/오피스텔</option>
                    <option value="mixed">복합개발</option>
                    <option value="logistics">물류센터</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">목표 연면적 (평)</label>
                  <input
                    type="number"
                    placeholder="예: 1200"
                    value={devTargetScalePyung}
                    onChange={(e) => setDevTargetScalePyung(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 분양/매각가 (만원/평)</label>
                  <input
                    type="number"
                    placeholder="예: 4500"
                    value={devExpectedSalePricePerPyung}
                    onChange={(e) => setDevExpectedSalePricePerPyung(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 공사비 (만원/평)</label>
                  <input
                    type="number"
                    placeholder="예: 750"
                    value={devConstructionCostPerPyung}
                    onChange={(e) => setDevConstructionCostPerPyung(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>

                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">2. 명도 조건</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">명도 책임</label>
                  <select
                    value={vacateResponsibility}
                    onChange={(e) => setVacateResponsibility(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="seller">매도인 책임 명도</option>
                    <option value="buyer">매수인 인수 후 명도</option>
                    <option value="negotiation">매도/매수 협의</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">현재 임차인 수</label>
                  <input
                    type="number"
                    placeholder="예: 8"
                    value={vacateTenantCount}
                    onChange={(e) => setVacateTenantCount(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 명도 비용 (만원)</label>
                  <input
                    type="number"
                    placeholder="예: 5000"
                    value={vacateEstimatedCostManwon}
                    onChange={(e) => setVacateEstimatedCostManwon(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 명도 기간 (개월)</label>
                  <input
                    type="number"
                    placeholder="예: 6"
                    value={vacateEstimatedMonths}
                    onChange={(e) => setVacateEstimatedMonths(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>

                <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">3. 인허가 리스크</div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">인허가 진행 상태</label>
                  <select
                    value={permitStatus}
                    onChange={(e) => setPermitStatus(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="completed">허가 완료</option>
                    <option value="in_progress">심의/진행 중</option>
                    <option value="not_started">미착수 (매수 후 착수)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 인허가 기간 (개월)</label>
                  <input
                    type="number"
                    placeholder="예: 4"
                    value={permitEstimatedMonths}
                    onChange={(e) => setPermitEstimatedMonths(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 🏢 자가사용형 전용 필드 (OccupancyPlan) */}
          {investmentPosture === 'owner_occupied' && (
            <div className="border border-blue-500/30 rounded-xl p-4 bg-blue-500/5 space-y-3">
              <div className="flex justify-between items-center border-b border-blue-500/20 pb-2">
                <span className="text-xs font-bold text-blue-300">🏢 사옥 입주 및 자가사용 계획</span>
                <span className="text-[10px] text-blue-400 font-medium">자가사용 위젯 시뮬레이션</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">예상 입주 인원 (명)</label>
                  <input
                    type="number"
                    placeholder="예: 100"
                    value={occHeadcount}
                    onChange={(e) => setOccHeadcount(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">1인당 필요 면적 (평)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 3.3"
                    value={occAreaPerHeadPyung}
                    onChange={(e) => setOccAreaPerHeadPyung(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">희망 사용 층</label>
                  <input
                    type="text"
                    placeholder="예: 지상 2~5층"
                    value={occDesiredFloors}
                    onChange={(e) => setOccDesiredFloors(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">현재 사옥 월 임차료 (만원)</label>
                  <input
                    type="number"
                    placeholder="예: 3000 (매입 비교용)"
                    value={occCurrentRentManwon}
                    onChange={(e) => setOccCurrentRentManwon(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 📊 구분소유 건물 필드 (SectionalSpec) */}
          {['officetel', 'knowledge_center', 'retail_strip', 'serviced_residence'].some(
            t => assetType?.toLowerCase().includes(t) || assetType?.includes('오피스텔') || assetType?.includes('지식산업') || assetType?.includes('상가')
          ) && (
            <div className="border border-purple-500/30 rounded-xl p-4 bg-purple-500/5 space-y-3">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                <span className="text-xs font-bold text-purple-300">📊 구분소유 상세 정보</span>
                <span className="text-[10px] text-purple-400 font-medium">지분/권리관계 확인</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">구분소유자 수 (명)</label>
                  <input
                    type="number"
                    placeholder="예: 45"
                    value={sectionalOwnerCount}
                    onChange={(e) => setSectionalOwnerCount(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">토지지분 비율 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 100"
                    value={sectionalLandSharePct}
                    onChange={(e) => setSectionalLandSharePct(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">관리단 구성 여부</label>
                  <select
                    value={sectionalManagementBody}
                    onChange={(e) => setSectionalManagementBody(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="yes">관리단 구성됨</option>
                    <option value="no">관리단 없음</option>
                    <option value="unknown">미확인</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">마스터리스 계약</label>
                  <select
                    value={sectionalMasterLease}
                    onChange={(e) => setSectionalMasterLease(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="no">없음 (개별 임대)</option>
                    <option value="yes">있음 (통임대 운영중)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 🏠 주거 사양 필드 (ResidentialSpec) */}
          {['multi_household', 'multi_family', 'mixed_shop_house'].some(
            t => assetType?.toLowerCase().includes(t) || assetType?.includes('다세대') || assetType?.includes('다가구') || assetType?.includes('상가주택')
          ) && (
            <div className="border border-emerald-500/30 rounded-xl p-4 bg-emerald-500/5 space-y-3">
              <div className="flex justify-between items-center border-b border-emerald-500/20 pb-2">
                <span className="text-xs font-bold text-emerald-300">🏠 주거 세대 스펙</span>
                <span className="text-[10px] text-emerald-400 font-medium">전세/월세 보증금</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">총 세대수</label>
                  <input
                    type="number"
                    placeholder="예: 12"
                    value={resTotalUnits}
                    onChange={(e) => setResTotalUnits(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">전세 세대수</label>
                  <input
                    type="number"
                    placeholder="예: 4"
                    value={resJeonseUnits}
                    onChange={(e) => setResJeonseUnits(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">전세 보증금 합계 (만원)</label>
                  <input
                    type="number"
                    placeholder="예: 80000"
                    value={resJeonseDepositTotalManwon}
                    onChange={(e) => setResJeonseDepositTotalManwon(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="resIllegalExtension"
                    checked={resIllegalExtension}
                    onChange={(e) => setResIllegalExtension(e.target.checked)}
                    className="rounded border-border text-emerald-500 focus:ring-emerald-500 w-4 h-4 bg-background"
                  />
                  <label htmlFor="resIllegalExtension" className="text-xs text-muted-foreground cursor-pointer">불법 증축/옥탑 포함</label>
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
          {/* v3: Data Grade Progress */}
          <div className={`rounded-xl p-3 mb-3 border-2 transition-colors ${
            canGenerate ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30" : "bg-amber-50 dark:bg-amber-950/30 border-amber-500/30"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-foreground">데이터 등급</span>
              <span className={`text-sm font-bold ${
                currentDataGrade === 'A' ? 'text-emerald-500' :
                currentDataGrade === 'B' ? 'text-blue-500' :
                currentDataGrade === 'C' ? 'text-amber-500' : 'text-red-500'
              }`}>
                {currentDataGrade ? `${currentDataGrade}등급` : `${readinessScore}점`}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  currentDataGrade === 'A' ? 'bg-emerald-500' :
                  currentDataGrade === 'B' ? 'bg-blue-500' :
                  currentDataGrade === 'C' ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${currentDataGrade === 'A' ? 100 : currentDataGrade === 'B' ? 75 : currentDataGrade === 'C' ? 50 : readinessScore}%` }}
              />
            </div>
            {/* 포스처별 누락 필드 안내 */}
            {(() => {
              const isHospitality = ['hotel', 'resort', 'motel', 'pension', 'guest_house', '호텔', '리조트', '모텔', '펜션'].some(t => assetType?.toLowerCase()?.includes(t));
              const isDev = ['토지', '나대지', 'land', '개발'].some(t => assetType?.toLowerCase()?.includes(t));
              const isOwnerOcc = ['사옥', '자가사용', 'owner'].some(t => assetType?.toLowerCase()?.includes(t));

              let hint = '';
              if (isHospitality && !roomCount && !averageDailyRate) {
                hint = '💡 객실 수/ADR/OCC를 입력하면 운영 수익 시뮬레이터가 활성화됩니다';
              } else if (isDev) {
                hint = '💡 주소를 입력하면 건축물대장에서 용적률 여유가 자동 계산됩니다';
              } else if (isOwnerOcc) {
                hint = '💡 현재 공실/가용 면적을 입력하면 사옥 매수 비교기가 활성화됩니다';
              } else if (!monthlyRent && !totalDeposit) {
                hint = '💡 렌트롤(임대료/보증금)을 입력하면 딜카드에 수익률이 표시됩니다';
              } else if (!askingPrice) {
                hint = '💡 매각가를 입력하면 권역 실거래가 대비 시세 비교가 활성화됩니다';
              }

              if (!hint) return null;
              return (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-lg p-2.5 mb-2">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">{hint}</p>
                </div>
              );
            })()}
            {gradeUpItems && gradeUpItems.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[10px] text-muted-foreground font-medium">등급 업을 위해 필요한 항목:</p>
                {gradeUpItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-600 dark:text-amber-400">⚠️ {item.label}</span>
                    <span className="text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded text-[9px]">{item.gradeContribution}</span>
                  </div>
                ))}
              </div>
            )}
            {stage === 'pro' && (currentDataGrade === 'D' || currentDataGrade === 'C') && (
              <p className="text-[10px] text-red-500 mt-1">⚠ 현재 {currentDataGrade}등급: Pro IM은 B등급 이상부터 생성 가능합니다. 렌트롤·면적·가격 데이터를 입력하면 등급이 올라갑니다.</p>
            )}
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
            <div className="flex flex-col gap-2">
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
                  stage === 'basic' ? "⚡ Basic IM 생성" : "🏆 Pro IM 생성"
                )}
              </button>
              {stage === 'basic' && (
                <button 
                  onClick={() => setStage('pro')}
                  className="text-xs text-primary/80 hover:text-primary underline text-center w-full mt-1"
                >
                  🏆 상세 렌트롤·DCF·부가수입 추가 → Pro IM
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
