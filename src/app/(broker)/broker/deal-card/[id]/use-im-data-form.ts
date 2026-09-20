interface AddressResult {
  roadAddr?: string;
  jibunAddr?: string;
  zipNo?: string;
  pnu?: string;
  bdNm?: string;
  // Additional fields from address-resolver
  [key: string]: unknown;
}
type BottomSheetState = "idle" | "loading" | "success" | "error";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";
import { computeFinancialSummary } from "@/domain/building/financials";
import { uploadPhotosSequentially } from "@/lib/image-compressor";
import { toast } from "sonner";
import { PostureSelector, HospitalitySpecSection, OwnerOccupiedSpecSection, SectionalSpecSection, ResidentialSpecSection, DevelopmentSpecSection, ParcelSection, HoldingHistorySection, OperatingPerfSection, DataGradeFooter, AcquisitionCostSection, LoanScenarioSection } from "./bottom-sheet/sections";
import { getInputOrder } from "./bottom-sheet/hooks/use-input-order";
import { validateCombination } from "@/domain/ontology/asset-identity";
import { hasValidBuildingNumber } from "@/domain/verification/address-resolver";

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
    initialPnu?: string;
    prefillMonthlyRent?: number;
    prefillTotalDeposit?: number;
    prefillMgmtFee?: number;
    prefillAskingPrice?: number;
    prefillLoanAmount?: number;
    prefillVacancyPct?: number;
    initialInvestmentPosture?: string;
    currentDataGrade?: string;
    gradeUpItems?: Array<{ field: string; label: string; gradeContribution: string }>;
    initialStage?: 'basic' | 'pro';
    targetTier?: 'basic' | 'pro' | 'internal_only' | 'fact_om' | 'analysis_im' | 'decision_im' | 'expert_required';
    /** C-2: AI 포스처 추천 */
    postureProposal?: { value: string; confidence: number; reason: string };
    existingDocBody?: any;
}

export function useImDataForm(props: ImDataBottomSheetProps) {
    const {
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
      initialPnu,
      prefillMonthlyRent,
      prefillTotalDeposit,
      prefillMgmtFee,
      prefillAskingPrice,
      prefillLoanAmount,
      prefillVacancyPct,
      initialInvestmentPosture,
      currentDataGrade,
      gradeUpItems,
      initialStage,
      targetTier,
      postureProposal,
      existingDocBody,
    } = props;

    const resolvedStage: 'basic' | 'pro' = initialStage || (
        targetTier === 'analysis_im' || targetTier === 'decision_im' || targetTier === 'pro'
          ? 'pro' : 'basic'
      );
    const [stage, setStage] = useState<'basic' | 'pro'>(resolvedStage);
    const [state, setState] = useState<BottomSheetState>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [progress, setProgress] = useState("");
    const [address, setAddress] = useState("");
    const [pnu, setPnu] = useState("");
    const [monthlyRent, setMonthlyRent] = useState("");
    const [investmentPosture, setInvestmentPosture] = useState<string>(initialInvestmentPosture || "");
    const getFieldClass = (fieldName: string, baseClass: string = "bg-secondary/50 border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1") => {
        // missingFields는 아래 useMemo에서 계산됨
        const isMissing = computedMissingFields.includes(fieldName);
        const borderClass = isMissing ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-border focus:border-primary focus:ring-primary";
        return `${baseClass} ${borderClass}`;
      };
    const [totalDeposit, setTotalDeposit] = useState("");
    const [mgmtFeeTotal, setMgmtFeeTotal] = useState("");
    const [loanAmount, setLoanAmount] = useState("");
    const [loanStatus, setLoanStatus] = useState<string>("unknown");
    const [ancillaryIncomes, setAncillaryIncomes] = useState<any[]>([]);
    const [askingPrice, setAskingPrice] = useState("");
    const [vacancyPct, setVacancyPct] = useState<number | "">("");
    const [brokerHighlight, setBrokerHighlight] = useState("");
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
    const [roomCount, setRoomCount] = useState<string>("");
    const [averageDailyRate, setAverageDailyRate] = useState<string>("");
    const [occupancyRate, setOccupancyRate] = useState<string>("");
    const [gopMargin, setGopMargin] = useState<string>("");
    const [operatingModel, setOperatingModel] = useState<string>("self");
    const [operatingEntity, setOperatingEntity] = useState<string>("");
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
    const [occHeadcount, setOccHeadcount] = useState<string>("");
    const [occAreaPerHeadPyung, setOccAreaPerHeadPyung] = useState<string>("3.3");
    const [occDesiredFloors, setOccDesiredFloors] = useState<string>("");
    const [occCurrentRentManwon, setOccCurrentRentManwon] = useState<string>("");
    const [sectionalOwnerCount, setSectionalOwnerCount] = useState<string>("");
    const [sectionalManagementBody, setSectionalManagementBody] = useState<string>("unknown");
    const [sectionalMasterLease, setSectionalMasterLease] = useState<string>("no");
    const [jointCollateralGroup, setJointCollateralGroup] = useState<string>("");
    const [sectionalLandSharePct, setSectionalLandSharePct] = useState<string>("100");
    const [sectionalFullPurchase, setSectionalFullPurchase] = useState<string>("full");
    const [resTotalUnits, setResTotalUnits] = useState<string>("");
    const [resJeonseUnits, setResJeonseUnits] = useState<string>("");
    const [resMonthlyUnits, setResMonthlyUnits] = useState<string>("");
    const [resJeonseDepositTotalManwon, setResJeonseDepositTotalManwon] = useState<string>("");
    const [resIllegalExtension, setResIllegalExtension] = useState<boolean>(false);
    const [acquisitionDate, setAcquisitionDate] = useState<string>("");
    const [acquisitionPriceManwon, setAcquisitionPriceManwon] = useState<string>("");
    const [holdingMonths, setHoldingMonths] = useState<string>("");
    const [transferCountIn10Y, setTransferCountIn10Y] = useState<string>("");
    const [sellerMotive, setSellerMotive] = useState<string>("");
    const [unitKind, setUnitKind] = useState<string>("room");
    const [unitCount, setUnitCount] = useState<string>("");
    const [licenceTransferable, setLicenceTransferable] = useState<boolean | null>(null);
    const [annualRevenue, setAnnualRevenue] = useState<string>("");
    const [annualGop, setAnnualGop] = useState<string>("");
    const [parcels, setParcels] = useState<Array<{
        pnu: string; landCategory: string; areaM2: string;
        shareRatio: string; officialPricePerM2: string;
      }>>([]);
    const [acquisitionTaxPct, setAcquisitionTaxPct] = useState<string>("");
    const [brokerageFeeManwon, setBrokerageFeeManwon] = useState<string>("");
    const [legalFeeManwon, setLegalFeeManwon] = useState<string>("");
    const [otherAcquisitionCostManwon, setOtherAcquisitionCostManwon] = useState<string>("");
    const [ltvPct, setLtvPct] = useState<string>("");
    const [loanInterestPct, setLoanInterestPct] = useState<string>("");
    const [loanTermYears, setLoanTermYears] = useState<string>("");
    const [targetIrrPct, setTargetIrrPct] = useState<string>("");
    const [searchKeyword, setSearchKeyword] = useState(initialAddress || areaSignal || "");
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
    const [existingUrls, setExistingUrls] = useState<string[]>(existingPhotoUrls || []);
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const [photoCaptions, setPhotoCaptions] = useState<Record<number, string>>({});
    const [photoCategories, setPhotoCategories] = useState<Record<number, string>>({ 0: 'exterior' });
    const [heroPhotoIndex, setHeroPhotoIndex] = useState<number>(0);
    const [exteriorPhotoIndex, setExteriorPhotoIndex] = useState<number | null>(null);
    const [floorLeases, setFloorLeases] = useState<Array<{ floor: string; tenant_type?: string; deposit_manwon?: number; rent_manwon?: number; mgmt_fee_manwon?: number; is_vacant?: boolean; }>>([]);
    const floorLeasesRef = useRef(floorLeases);
    const [manualComps, setManualComps] = useState<Array<{ address: string; dealAmount: string; area: string; dealYear: string; dealMonth: string; buildingUse: string; memo: string; }>>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [readinessScore, setReadinessScore] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    useEffect(() => { floorLeasesRef.current = floorLeases; }, [floorLeases]);
    useEffect(() => {
        if (!isOpen) {
          abortControllerRef.current?.abort();
          abortControllerRef.current = null;
        }
      }, [isOpen]);
    const computedMissingFields = React.useMemo(() => {
        const missing: string[] = [];
        
        // 0. 포스처 미선택 시 최우선 결손 (S2-2)
        if (!investmentPosture) {
          missing.push('investmentPosture');
          return missing; // 포스처 없으면 다른 검증 불필요
        }

        // 1. 공통 필수 항목
        if (!address && !pnu) missing.push('address');
        if (!askingPrice || Number(askingPrice) <= 0) missing.push('askingPrice');
        
        // 2. 포스처별 필수 항목
        switch (investmentPosture) {
          case 'income':
            if (!monthlyRent || Number(monthlyRent) <= 0) missing.push('monthlyRent');
            if (!totalDeposit || Number(totalDeposit) <= 0) missing.push('totalDeposit');
            break;
          case 'owner_occupied':
            if (!occHeadcount || Number(occHeadcount) <= 0) missing.push('occHeadcount');
            if (!occDesiredFloors) missing.push('occDesiredFloors');
            break;
          case 'development':
            if (!devTargetUse) missing.push('devTargetUse');
            if (!devTargetScalePyung || Number(devTargetScalePyung) <= 0) missing.push('devTargetScalePyung');
            break;
          case 'operating':
            if (!roomCount || Number(roomCount) <= 0) missing.push('roomCount');
            if (!averageDailyRate || Number(averageDailyRate) <= 0) missing.push('averageDailyRate');
            if (!unitKind) missing.push('unitKind');
            break;
          case 'trading':
            if (!acquisitionPriceManwon) missing.push('acquisitionPriceManwon');
            break;
          // trading 등 기타 포스처는 현재 추가적인 강제 항목 없음
        }
        
        return missing;

      }, [address, pnu, askingPrice, investmentPosture, monthlyRent, totalDeposit, occHeadcount, occDesiredFloors, devTargetUse, devTargetScalePyung, roomCount, averageDailyRate, acquisitionPriceManwon, unitKind]);
    const handlePostureChange = (newPosture: string) => {
        if (assetType && newPosture) {
          const result = validateCombination(assetType as Parameters<typeof validateCombination>[0], newPosture as Parameters<typeof validateCombination>[1]);
          if (result.status === 'blocked') {
            toast.error(result.message);
            return;
          }
          if (result.status === 'caution') {
            toast.warning(result.message);
          }
        }
        setInvestmentPosture(newPosture);
      };
    useEffect(() => {
        if (existingPhotoUrls) {
          setExistingUrls(existingPhotoUrls);
        }
      }, [existingPhotoUrls]);
    useEffect(() => {
        if (!isOpen) return;

        // PNU가 이미 있으면 즉시 설정 (assets 테이블에서 전달된 경우)
        if (initialPnu && !pnu) {
          setPnu(initialPnu);
        }

        if (initialAddress) {
          // 실제 주소인지 판별 — 상세 지번/건물번호 필수 또는 PNU가 함께 전달된 경우
          const hasBuildingNumber = hasValidBuildingNumber(initialAddress);
          const isReal = hasBuildingNumber || !!initialPnu;

          if (isReal) {
            setAddress(initialAddress);
            setSearchKeyword(initialAddress);
            // 상세 지번(숫자)이 포함되어 있고 PNU가 없을 때만 자동 검색 시도 (자동 선택 방지)
            if (!initialPnu && hasBuildingNumber) {
              const timer = setTimeout(() => {
                handleAddressSearch(initialAddress, false);
              }, 100);
              return () => clearTimeout(timer);
            }
          } else {
            // 권역 시그널 등 — 검색 키워드로만 설정하고 실제 address는 비워둠 (사용자 검색/선택 유도)
            setSearchKeyword(initialAddress);
          }
        } else if (areaSignal && !searchKeyword) {
          // 주소가 없으면 권역 시그널을 검색창 초기값으로 제공
          setSearchKeyword(areaSignal);
        }
      }, [initialAddress, initialPnu, areaSignal, isOpen]);
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

          if (initialStage === 'pro' && existingDocBody) {
            if (existingDocBody.broker_highlight) setBrokerHighlight(existingDocBody.broker_highlight);
            
            // ── 물류 ──
            if (existingDocBody.logistics) {
              const l = existingDocBody.logistics;
              if (l.ceiling_height_m) setCeilingHeight(String(l.ceiling_height_m));
              if (l.dock_count) setDockCount(String(l.dock_count));
              if (l.dock_leveler_count) setDockLevelerCount(String(l.dock_leveler_count));
              if (l.max_vehicle_ton) setMaxVehicleTon(String(l.max_vehicle_ton));
              if (l.floor_load_ton_m2) setFloorLoadTon(String(l.floor_load_ton_m2));
              if (l.cold_storage_area_pyeong) setColdStorageArea(String(l.cold_storage_area_pyeong));
              if (l.cold_storage_type) setColdStorageType(l.cold_storage_type);
              if (l.loading_area_pyeong) setLoadingArea(String(l.loading_area_pyeong));
              if (l.vehicle_access_type) setVehicleAccessType(l.vehicle_access_type);
              if (l.fire_rating) setFireRating(l.fire_rating);
              if (l.sprinkler !== undefined) setSprinkler(l.sprinkler);
              if (l.column_span_m) setColumnSpan(l.column_span_m);
              if (l.power_capacity_kw) setPowerCapacity(String(l.power_capacity_kw));
              if (l.has_office_space !== undefined) setHasOfficeSpace(l.has_office_space);
              if (l.office_area_pyeong) setOfficeArea(String(l.office_area_pyeong));
              if (l.distance_to_ic_km) setDistanceToIc(String(l.distance_to_ic_km));
              if (l.ic_name) setIcName(l.ic_name);
            }
            // ── 숙박 ──
            if (existingDocBody.hospitalitySpec) {
              const h = existingDocBody.hospitalitySpec;
              if (h.totalRoomCount) setRoomCount(String(h.totalRoomCount));
              if (h.averageDailyRate) setAverageDailyRate(String(h.averageDailyRate));
              if (h.occupancyRate) setOccupancyRate(String(h.occupancyRate));
              if (h.gopMargin) setGopMargin(String(h.gopMargin));
              if (h.operatingModel) setOperatingModel(h.operatingModel);
              if (h.operatingEntity) setOperatingEntity(h.operatingEntity);
            }
            // ── 개발 ──
            if (existingDocBody.developmentSpec) {
              const d = existingDocBody.developmentSpec;
              if (d.targetUse) setDevTargetUse(d.targetUse);
              if (d.targetScalePyung) setDevTargetScalePyung(String(d.targetScalePyung));
              if (d.expectedSalePricePerPyung) setDevExpectedSalePricePerPyung(String(d.expectedSalePricePerPyung));
              if (d.constructionCostPerPyung) setDevConstructionCostPerPyung(String(d.constructionCostPerPyung));
              if (d.contractorStatus) setDevContractorStatus(d.contractorStatus);
            }
            // ── 구분소유 ──
            if (existingDocBody.sectionalSpec) {
              const s = existingDocBody.sectionalSpec;
              if (s.ownerCount) setSectionalOwnerCount(String(s.ownerCount));
              if (s.managementBody) setSectionalManagementBody(s.managementBody);
              if (s.masterLease) setSectionalMasterLease(s.masterLease ? 'yes' : 'no');
              if (s.landSharePct) setSectionalLandSharePct(String(s.landSharePct));
              if (s.fullPurchase) setSectionalFullPurchase(s.fullPurchase ? 'full' : 'partial');
            }
            // ── 주거사양 ──
            if (existingDocBody.residentialSpec) {
              const r = existingDocBody.residentialSpec;
              if (r.totalUnits) setResTotalUnits(String(r.totalUnits));
              if (r.jeonseUnits) setResJeonseUnits(String(r.jeonseUnits));
              if (r.monthlyUnits) setResMonthlyUnits(String(r.monthlyUnits));
              if (r.jeonseDepositTotalManwon) setResJeonseDepositTotalManwon(String(r.jeonseDepositTotalManwon));
              if (r.illegalExtension !== undefined) setResIllegalExtension(r.illegalExtension);
            }
            // ── 취득 비용 ──
            if (existingDocBody.acquisition_tax_pct) setAcquisitionTaxPct(String(existingDocBody.acquisition_tax_pct));
            if (existingDocBody.brokerage_fee_manwon) setBrokerageFeeManwon(String(existingDocBody.brokerage_fee_manwon));
            if (existingDocBody.legal_fee_manwon) setLegalFeeManwon(String(existingDocBody.legal_fee_manwon));
            if (existingDocBody.other_acquisition_cost_manwon) setOtherAcquisitionCostManwon(String(existingDocBody.other_acquisition_cost_manwon));
            // ── 대출 시나리오 ──
            if (existingDocBody.ltv_pct) setLtvPct(String(existingDocBody.ltv_pct));
            if (existingDocBody.loan_interest_pct) setLoanInterestPct(String(existingDocBody.loan_interest_pct));
            if (existingDocBody.loan_term_years) setLoanTermYears(String(existingDocBody.loan_term_years));
            if (existingDocBody.target_irr_pct) setTargetIrrPct(String(existingDocBody.target_irr_pct));
          }
        }
      }, [isOpen, initialStage]);
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
    const updateDropdownRect = () => {
        if (dropdownAnchorRef.current) {
          setDropdownRect(dropdownAnchorRef.current.getBoundingClientRect());
        }
      };
    
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
            setProgress("사진 최적화 및 업로드 중...");
            try {
              const uploadResult = await uploadPhotosSequentially(
                buildingId,
                photoFiles,
                (msg) => setProgress(msg)
              );
              uploadedPhotoUrls = uploadResult.urls;
              if (uploadResult.failedCount > 0) {
                toast.warning(`사진 ${uploadedPhotoUrls.length}장 업로드 완료 (${uploadResult.failedCount}장 실패)`);
              } else if (uploadedPhotoUrls.length > 0) {
                toast.success(`📷 사진 ${uploadedPhotoUrls.length}장 업로드 완료`);
              }
            } catch (uploadErr) {
              console.error("[Photo Upload] Error:", uploadErr);
              toast.error("📷 사진 업로드 처리 중 오류가 발생했습니다. 기존 사진으로 계속 진행합니다.");
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
            cold_storage_type: coldStorageType,
            loading_area_pyeong: loadingArea ? parseFloat(loadingArea) : undefined,
            vehicle_access_type: vehicleAccessType,
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

          const holdingHistorySpec = investmentPosture === 'trading' ? {
            acquisitionDate: acquisitionDate || undefined,
            acquisitionPriceManwon: acquisitionPriceManwon ? Number(acquisitionPriceManwon) : undefined,
            holdingMonths: holdingMonths ? parseInt(holdingMonths) : undefined,
            transferCountIn10Y: transferCountIn10Y ? parseInt(transferCountIn10Y) : undefined,
            sellerMotive: sellerMotive || undefined,
          } : undefined;

          const operatingPerfSpec = investmentPosture === 'operating' ? {
            unitKind,
            unitCount: unitCount ? parseInt(unitCount) : undefined,
            operationModel: operatingModel,
            licenceTransferable,
            annualRevenue: annualRevenue ? Number(annualRevenue) : undefined,
            annualGop: annualGop ? Number(annualGop) : undefined,
          } : undefined;

          const parcelsData = parcels.length > 0 ? parcels.map(p => ({
            pnu: p.pnu,
            landCategory: p.landCategory,
            areaM2: p.areaM2 ? parseFloat(p.areaM2) : undefined,
            shareRatio: p.shareRatio ? parseFloat(p.shareRatio) : undefined,
            officialPricePerM2: p.officialPricePerM2 ? parseFloat(p.officialPricePerM2) : undefined,
          })) : undefined;

          const validPhotoUrls = [...existingUrls, ...uploadedPhotoUrls].filter(
            (url): url is string => typeof url === 'string' && url.trim().length > 0
          );

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
            photo_urls: validPhotoUrls.length > 0 ? validPhotoUrls : undefined,
            photo_captions: Object.keys(photoCaptions).length > 0 ? photoCaptions : undefined,
            photos_v2: validPhotoUrls.length > 0 ? validPhotoUrls.map((url, idx) => ({
              url,
              category: (photoCategories[idx] || (idx === 0 ? 'exterior' : 'interior')),
              caption: photoCaptions[idx] || undefined,
              isHero: idx === heroPhotoIndex,
              role: idx === heroPhotoIndex ? 'cover' 
                  : idx === exteriorPhotoIndex ? 'exterior' 
                  : 'general',
              order: idx,
            })) : undefined,
            floor_leases: (floorLeasesRef.current.length > 0 ? floorLeasesRef.current : floorLeases.length > 0 ? floorLeases : undefined),
            logistics,
            hospitalitySpec,
            developmentSpec,
            vacateSpec,
            permitSpec,
            occupancySpec,
            sectionalSpec,
            residentialSpec,
            holdingHistorySpec,
            operatingPerfSpec,
            parcels: parcelsData,
            pnus: Array.isArray(parcelsData)
              ? parcelsData.map((p: any) => p.pnu).filter((p: any): p is string => Boolean(p && typeof p === 'string' && p.trim()))
              : undefined,
            manual_comps: manualComps.length > 0 ? manualComps
              .filter(mc => mc.address && Number(mc.dealAmount) > 0 && Number(mc.area) > 0)
              .map(mc => ({
                address: mc.address,
                dealAmount: Number(mc.dealAmount),
                area: Number(mc.area),
                dealYear: Number(mc.dealYear) || new Date().getFullYear(),
                dealMonth: Number(mc.dealMonth) || 1,
                buildingUse: mc.buildingUse || undefined,
                memo: mc.memo || undefined,
              })) : undefined,
            tier: targetTier,
            preset: stage === 'basic' ? 'credeal_basic' : undefined,
            // D41 Phase D: 취득 비용
            acquisition_tax_pct: acquisitionTaxPct ? parseFloat(acquisitionTaxPct) : undefined,
            brokerage_fee_manwon: brokerageFeeManwon ? parseFloat(brokerageFeeManwon) : undefined,
            legal_fee_manwon: legalFeeManwon ? parseFloat(legalFeeManwon) : undefined,
            other_acquisition_cost_manwon: otherAcquisitionCostManwon ? parseFloat(otherAcquisitionCostManwon) : undefined,
            // D41 Phase D: 대출 시나리오
            ltv_pct: ltvPct ? parseFloat(ltvPct) : undefined,
            loan_interest_pct: loanInterestPct ? parseFloat(loanInterestPct) : undefined,
            loan_term_years: loanTermYears ? parseInt(loanTermYears) : undefined,
            target_irr_pct: targetIrrPct ? parseFloat(targetIrrPct) : undefined,
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

          // after() 패턴: 서버는 항상 { status: "processing", jobId } 반환
          // → 무조건 폴링 진입
          const jobId = startData.jobId;
          if (!jobId) throw new Error("작업 ID를 받지 못했습니다");

          abortControllerRef.current = new AbortController();
          const { signal } = abortControllerRef.current;

          const MAX_POLL_MS = 190_000; // IM_HARD_TIMEOUT_MS (180s) + 10s buffer
          const POLL_INTERVAL = 3_000;
          const startTime = Date.now();
          let dotCount = 0;
          let cancelled = false;

          // ── iOS visibilitychange 핸들러 ──
          // 앱 전환 후 복귀 시 즉시 상태 확인 (suspend된 폴링 루프 보완)
          const onVisibilityChange = async () => {
            if (document.hidden || cancelled) return;
            try {
              const pollRes = await fetch(`/api/broker/im-lite/job-status?jobId=${encodeURIComponent(jobId)}`, { signal });
              if (!pollRes.ok) return;
              const job = await pollRes.json();
              if (job.status === "completed" && job.result) {
                cancelled = true;
                setState("success");
                setProgress(`✅ ${job.result.sections_count ?? 7}섹션 생성 완료!`);
                const reviewUrl = job.result.im_lite_id
                  ? `/broker/im-approval/${job.result.im_lite_id}`
                  : job.result.url;
                setTimeout(() => { window.location.href = reviewUrl; }, 1500);
              } else if (job.status === "failed") {
                cancelled = true;
                setState("error");
                setErrorMsg(job.result?.error ?? "IM 생성 실패");
                setProgress("");
              }
            } catch (err: any) {
              if (err.name !== 'AbortError') {
                /* 네트워크 에러 — 다음 폴링에서 재시도 */
              }
            }
          };
          document.addEventListener("visibilitychange", onVisibilityChange);

          try {
            while (Date.now() - startTime < MAX_POLL_MS && !cancelled) {
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
              if (cancelled) break;
              dotCount = (dotCount + 1) % 4;
              const dots = ".".repeat(dotCount + 1);
              const elapsed = Math.round((Date.now() - startTime) / 1000);
              setProgress(`AI 분석 중${dots} (${elapsed}초 경과)`);

              try {
                const pollRes = await fetch(`/api/broker/im-lite/job-status?jobId=${encodeURIComponent(jobId)}`, { signal });
                if (!pollRes.ok) continue;
                const job = await pollRes.json();

                if (job.status === "completed" && job.result) {
                  cancelled = true;
                  setState("success");
                  setProgress(`✅ ${job.result.sections_count ?? 7}섹션 생성 완료!`);
                  const reviewUrl = job.result.im_lite_id
                    ? `/broker/im-approval/${job.result.im_lite_id}`
                    : job.result.url;
                  setTimeout(() => { window.location.href = reviewUrl; }, 1500);
                  return;
                } else if (job.status === "failed") {
                  cancelled = true;
                  setState("error");
                  setErrorMsg(job.result?.error ?? "IM 생성 실패");
                  setProgress("");
                  return;
                }
              } catch (err: any) {
                if (err.name === 'AbortError') {
                  cancelled = true;
                  return;
                }
                continue;
              }
            }

            if (!cancelled) {
              // 타임아웃
              setState("error");
              setErrorMsg("생성 시간이 초과되었습니다. 잠시 후 IM 보관함에서 확인해 주세요.");
              setProgress("");
            }
          } finally {
            document.removeEventListener("visibilitychange", onVisibilityChange);
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.log('Polling aborted on modal dismiss');
            return;
          }
          setState("error");
          setErrorMsg(err?.message ?? "서버 요청 실패");
          setProgress("");
        }
      }
    const handleAddressSearch = async (overrideKeyword?: string, autoSelectFirst = false) => {
        const keyword = (overrideKeyword !== undefined ? overrideKeyword : searchKeyword).trim();
        if (!keyword || keyword.length < 2) {
          setSearchResults([]);
          setShowResults(false);
          return;
        }

        setIsSearching(true);
        if (!autoSelectFirst) {
          setShowResults(true);
        }
        
        try {
          const res = await fetch(`/api/public/address?keyword=${encodeURIComponent(keyword)}`);
          if (!res.ok) {
            throw new Error("주소 검색 실패");
          }
          const data = await res.json();
          // data can be an array or { results: [...] }
          const results: AddressResult[] = Array.isArray(data) ? data : (data.results ?? data.juso ?? []);
          setSearchResults(results);
          if (autoSelectFirst && results.length > 0) {
            selectAddress(results[0]);
          } else if (!autoSelectFirst) {
            setShowResults(true);
          }
        } catch (err) {
          console.error("Address search failed:", err);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      };
    const selectAddress = (result: AddressResult) => {
        const displayAddr = result.roadAddr || result.jibunAddr || "";
        setAddress(displayAddr);
        setSearchKeyword(displayAddr);
        // PNU: 19자리 표준 PNU 우선 추출
        const resolvedPnu = (result.pnu as string) || (result.bdMgtSn as string) || (result.admCd as string) || "";
        setPnu(resolvedPnu);
        setShowResults(false);
        setSearchResults([]);
      };
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
    const isProValid = currentDataGrade === 'A' || readinessScore >= 75;
    const hasRequiredFields = computedMissingFields.length === 0;
    const canGenerateBasic = hasRequiredFields && currentDataGrade !== 'D';
    const canGeneratePro = hasRequiredFields && (currentDataGrade === 'A' || currentDataGrade === 'B');
    const canGenerate = stage === 'basic' ? canGenerateBasic : (isProValid && canGeneratePro);
    

    return {
      computedMissingFields,
      stage,
      investmentPosture,
      setInvestmentPosture,
      dropdownAnchorRef,
      searchInputRef,
      searchKeyword,
      setSearchKeyword,
      address,
      setAddress,
      setPnu,
      handleSearchKeyDown,
      searchResults,
      setShowResults,
      getFieldClass,
      handleAddressSearch,
      isSearching,
      showResults,
      selectAddress,
      pnu,
      floorLeases,
      monthlyRent,
      setMonthlyRent,
      totalDeposit,
      setTotalDeposit,
      mgmtFeeTotal,
      setMgmtFeeTotal,
      setVacancyPct,
      vacancyPct,
      setFloorLeases,
      floorLeasesRef,
      monthlyRentRef,
      handleEnterKey,
      totalDepositRef,
      mgmtFeeTotalRef,
      askingPriceRef,
      setAskingPrice,
      askingPrice,
      loanAmountRef,
      manualComps,
      setManualComps,
      setLoanStatus,
      loanStatus,
      loanAmount,
      setLoanAmount,
      roomCount,
      setRoomCount,
      averageDailyRate,
      setAverageDailyRate,
      occupancyRate,
      setOccupancyRate,
      gopMargin,
      setGopMargin,
      unitKind,
      setUnitKind,
      unitCount,
      setUnitCount,
      operatingModel,
      setOperatingModel,
      licenceTransferable,
      setLicenceTransferable,
      annualRevenue,
      setAnnualRevenue,
      annualGop,
      setAnnualGop,
      ancillaryIncomes,
      setAncillaryIncomes,
      existingUrls,
      setHeroPhotoIndex,
      heroPhotoIndex,
      setExteriorPhotoIndex,
      exteriorPhotoIndex,
      setExistingUrls,
      photoCategories,
      setPhotoCategories,
      photoCaptions,
      setPhotoCaptions,
      photoPreviewUrls,
      photoFiles,
      setPhotoFiles,
      setPhotoPreviewUrls,
      fileInputRef,
      ceilingHeight,
      setCeilingHeight,
      columnSpan,
      setColumnSpan,
      floorLoadTon,
      setFloorLoadTon,
      powerCapacity,
      setPowerCapacity,
      dockCount,
      setDockCount,
      dockLevelerCount,
      setDockLevelerCount,
      maxVehicleTon,
      setMaxVehicleTon,
      loadingArea,
      setLoadingArea,
      coldStorageArea,
      setColdStorageArea,
      coldStorageType,
      setColdStorageType,
      vehicleAccessType,
      setVehicleAccessType,
      fireRating,
      setFireRating,
      sprinkler,
      setSprinkler,
      hasOfficeSpace,
      setHasOfficeSpace,
      officeArea,
      setOfficeArea,
      icName,
      setIcName,
      distanceToIc,
      setDistanceToIc,
      parcels,
      setParcels,
      devTargetUse,
      setDevTargetUse,
      devTargetScalePyung,
      setDevTargetScalePyung,
      devExpectedSalePricePerPyung,
      setDevExpectedSalePricePerPyung,
      devConstructionCostPerPyung,
      setDevConstructionCostPerPyung,
      vacateResponsibility,
      setVacateResponsibility,
      vacateTenantCount,
      setVacateTenantCount,
      vacateEstimatedCostManwon,
      setVacateEstimatedCostManwon,
      vacateEstimatedMonths,
      setVacateEstimatedMonths,
      permitStatus,
      setPermitStatus,
      permitEstimatedMonths,
      setPermitEstimatedMonths,
      occHeadcount,
      setOccHeadcount,
      occAreaPerHeadPyung,
      setOccAreaPerHeadPyung,
      occDesiredFloors,
      setOccDesiredFloors,
      occCurrentRentManwon,
      setOccCurrentRentManwon,
      sectionalOwnerCount,
      setSectionalOwnerCount,
      sectionalLandSharePct,
      setSectionalLandSharePct,
      sectionalManagementBody,
      setSectionalManagementBody,
      sectionalMasterLease,
      setSectionalMasterLease,
      jointCollateralGroup,
      setJointCollateralGroup,
      resTotalUnits,
      setResTotalUnits,
      resJeonseUnits,
      setResJeonseUnits,
      resJeonseDepositTotalManwon,
      setResJeonseDepositTotalManwon,
      resIllegalExtension,
      setResIllegalExtension,
      acquisitionDate,
      setAcquisitionDate,
      acquisitionPriceManwon,
      setAcquisitionPriceManwon,
      holdingMonths,
      setHoldingMonths,
      transferCountIn10Y,
      setTransferCountIn10Y,
      sellerMotive,
      setSellerMotive,
      acquisitionTaxPct,
      setAcquisitionTaxPct,
      brokerageFeeManwon,
      setBrokerageFeeManwon,
      legalFeeManwon,
      setLegalFeeManwon,
      otherAcquisitionCostManwon,
      setOtherAcquisitionCostManwon,
      ltvPct,
      setLtvPct,
      loanInterestPct,
      setLoanInterestPct,
      loanTermYears,
      setLoanTermYears,
      targetIrrPct,
      setTargetIrrPct,
      brokerHighlight,
      setBrokerHighlight,
      state,
      errorMsg,
      progress,
      handleCreate,
      canGenerate,
    };
}
