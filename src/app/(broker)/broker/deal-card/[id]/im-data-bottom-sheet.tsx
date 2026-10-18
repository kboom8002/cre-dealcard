"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { SOTA_SPRING } from "@/components/motion/sota-motion";
import { createClient } from "@/lib/supabase/client";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";
import { computeFinancialSummary } from '@/domain/building/financials';
import { uploadPhotosSequentially } from "@/lib/image-compressor";
import { toast } from "sonner";
import {
  PostureSelector,
  HospitalitySpecSection,
  OwnerOccupiedSpecSection,
  SectionalSpecSection,
  ResidentialSpecSection,
  DevelopmentSpecSection,
  ParcelSection,
  HoldingHistorySection,
  OperatingPerfSection,
  DataGradeFooter,
  AcquisitionCostSection,
  LoanScenarioSection,
  ManualCompsSection,
  LoanStatusSection,
  AncillaryIncomeSection,
  LogisticsSpecSection,
  VacancySection,
  BrokerExtrasSection,
  BrokerTargetRentField,
} from "./bottom-sheet/sections";
import { getInputOrder } from "./bottom-sheet/hooks/use-input-order";
import { validateCombination } from "@/domain/ontology/asset-identity";
import { hasValidBuildingNumber } from "@/domain/verification/address-resolver";
import { useImDataForm } from "./use-im-data-form";
import { getKoreanFieldLabel } from "@/constants/ui-lexicon";

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
  // v3: Deal card auto-supply data
  prefillMonthlyRent?: number; // 만원 단위
  prefillTotalDeposit?: number; // 만원 단위
  prefillMgmtFee?: number; // 만원 단위
  prefillAskingPrice?: number; // 만원 단위
  prefillLoanAmount?: number; // 만원 단위
  prefillVacancyPct?: number;
  initialInvestmentPosture?: string;
  currentDataGrade?: string; // A/B/C/D
  gradeUpItems?: Array<{ field: string; label: string; gradeContribution: string }>;
  initialStage?: 'basic' | 'pro';
  targetTier?: 'basic' | 'pro' | 'internal_only' | 'fact_om' | 'analysis_im' | 'decision_im' | 'expert_required';
  /** C-2: AI 포스처 추천 */
  postureProposal?: { value: string; confidence: number; reason: string };
  existingDocBody?: any;
}

type BottomSheetState = "idle" | "loading" | "success" | "error";

/** 만원 단위 숫자를 한국어 억/만원 단위로 변환 (예: 1150000 -> "115억 원", 29000 -> "2억 9,000만 원") */
function formatManwonToKorean(val: string | number | undefined | null): string | null {
  const num = typeof val === "number" ? val : Number(String(val ?? "").replace(/,/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  const rounded = Math.round(num);
  const eok = Math.floor(rounded / 10000);
  const man = rounded % 10000;
  if (eok > 0 && man > 0) {
    return `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만 원`;
  }
  if (eok > 0) {
    return `${eok.toLocaleString("ko-KR")}억 원`;
  }
  return `${man.toLocaleString("ko-KR")}만 원`;
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  investmentPosture: "① 투자 유형(포스처) 선택",
  address: "① 정확한 주소 검색",
  askingPrice: "② 매각 희망가",
  monthlyRent: "② 월 임대료 합계",
  totalDeposit: "② 보증금 총액",
  roomCount: "② 총 객실 수",
  averageDailyRate: "② 1박 평균 요금(ADR)",
  occupancyRate: "② 평균 객실 가동률",
  unitKind: "② 운영 호실 구분",
  devTargetUse: "② 개발 목표 용도",
  devTargetScalePyung: "② 개발 목표 연면적(평)",
  occHeadcount: "② 입주 예정 인원",
  occDesiredFloors: "② 사옥 사용 희망 층수",
  acquisitionPriceManwon: "② 매입 당시 취득가",
};

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
  initialPnu,
  prefillMonthlyRent,
  prefillTotalDeposit,
  prefillMgmtFee,
  prefillAskingPrice,
  prefillLoanAmount,
  prefillVacancyPct,
  initialInvestmentPosture, // 기본값 없음 — 중개인 필수 선택 (S2-2)
  currentDataGrade,
  gradeUpItems,
  initialStage,
  targetTier = 'basic',
  postureProposal,
  existingDocBody,
}: ImDataBottomSheetProps) {
    const {
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
      setRentRollMeta,
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
       brokerParkingCount,
       setBrokerParkingCount,
       brokerElevatorCount,
       setBrokerElevatorCount,
      targetIrrPct,
      setTargetIrrPct,
      brokerHighlight,
      setBrokerHighlight,
      brokerExtrasForm,
      setBrokerExtrasForm,
      state,
      errorMsg,
      progress,
      handleCreate,
      canGenerate
    } = useImDataForm({ 
      buildingId, isOpen, onClose, areaSignal, assetType, priceBand, sizeSignal, vacancySignal, 
      fitSummary, cautionSummary, existingPhotoUrls, initialAddress, initialPnu, prefillMonthlyRent, 
      prefillTotalDeposit, prefillMgmtFee, prefillAskingPrice, prefillLoanAmount, prefillVacancyPct, 
      initialInvestmentPosture, currentDataGrade, gradeUpItems, initialStage, targetTier, postureProposal, existingDocBody 
    });
    const [showYieldCalc, setShowYieldCalc] = useState(false);
    const [customYieldInput, setCustomYieldInput] = useState("4.0");
    const [activeStepTab, setActiveStepTab] = useState<1 | 2 | 3>(1);

    if (!isOpen) return null;
    if (typeof window === 'undefined') return null;

    const applyReverseYield = (capRate: number) => {
      const rent = Number(monthlyRent) || 0;
      const deposit = Number(totalDeposit) || 0;
      if (rent <= 0 || capRate <= 0 || capRate >= 100) return;
      const result = computeFinancialSummary({
        askingPriceKrw: 0,
        grossAnnualIncomeKrw: rent * 12,
        totalDepositKrw: deposit,
      });
      const estimatedPrice = Math.round((result.noiKrw.value / (capRate / 100)) + deposit);
      setAskingPrice(estimatedPrice.toString());
      setShowYieldCalc(false);
    };

    const jumpToField = (fieldKey: string) => {
      if (fieldKey === "address") {
        setActiveStepTab(1);
        searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        searchInputRef.current?.focus();
        return;
      }
      if (fieldKey === "askingPrice") {
        setActiveStepTab(2);
        askingPriceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        askingPriceRef.current?.focus();
        return;
      }
      if (fieldKey === "monthlyRent") {
        setActiveStepTab(2);
        monthlyRentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        monthlyRentRef.current?.focus();
        return;
      }
      if (fieldKey === "totalDeposit") {
        setActiveStepTab(2);
        totalDepositRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        totalDepositRef.current?.focus();
        return;
      }
      const isStep1 = fieldKey === "investmentPosture";
      setActiveStepTab(isStep1 ? 1 : 2);
      const stepEl = document.getElementById(isStep1 ? "bs-step-1" : "bs-step-2");
      stepEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

  const isDarkTheme = typeof window !== "undefined" && window.localStorage?.getItem("credeal-broker-paper-mode") === "false";

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 ${isDarkTheme ? "" : "broker-paper-theme"}`}
      role="presentation"
    >
      <motion.div 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="bottom-sheet-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SOTA_SPRING}
        className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,20px)] border border-border"
      >
        
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h2 id="bottom-sheet-title" className="text-xl font-black text-foreground tracking-tight">
              {'📊 투자설명서(IM) 만들기'}
            </h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-0.5">
              💾 입력하신 금액·임대차 내역은 창을 닫아도 자동 저장됩니다
            </p>
          </div>
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-border bg-secondary/70 text-sm font-extrabold text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ 닫기
          </motion.button>
        </div>

        {/* 3단계 빠른 이동 탭 (SOTA 슬라이딩 세그먼트 컨트롤) */}
        <div className="grid grid-cols-3 gap-1.5 mb-4 shrink-0 bg-secondary/70 p-1.5 rounded-2xl border border-border shadow-inner">
          {([
            { id: 1 as const, label: "① 투자목적 · 주소", targetId: "bs-step-1" },
            { id: 2 as const, label: "② 매각가 · 임대료", targetId: "bs-step-2" },
            { id: 3 as const, label: "③ 사진 · 상세조건", targetId: "bs-step-3" },
          ]).map((step) => {
            const isActive = activeStepTab === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setActiveStepTab(step.id);
                  document.getElementById(step.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`relative py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-colors text-center truncate ${
                  isActive ? "text-primary" : "text-foreground/80 hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="bs-step-active-pill"
                    transition={SOTA_SPRING}
                    className="absolute inset-0 rounded-xl bg-card border border-primary/30 shadow-xs"
                  />
                )}
                <span className="relative z-10">{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Form Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 mb-4 pb-10">
          {/* 🎯 투자 포스처 선택 */}
          <div id="bs-step-1">
            <PostureSelector
              investmentPosture={investmentPosture}
              setInvestmentPosture={setInvestmentPosture}
              postureProposal={postureProposal}
            />
          </div>

          {/* 주소 + 월세 + 렌트롤 — Basic에도 표시 */}
          <div>
            <label className="block text-sm font-extrabold text-foreground mb-1.5">
              🏠 2단계: 정확한 매물 주소 검색
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
                  onFocus={() => {
                    if (searchResults.length > 0) setShowResults(true);
                  }}
                  placeholder="동/도로명 입력 후 검색 (예: 당산동5가 11-47, 영신로 259)"
                  className={getFieldClass('address', 'flex-1 bg-secondary/50 border rounded-xl px-3.5 py-3 text-base text-foreground focus:outline-none focus:ring-2')}
                />
                <button 
                  onClick={() => handleAddressSearch()}
                  disabled={isSearching || searchKeyword.trim().length < 2}
                  className="bg-primary text-primary-foreground px-5 py-3 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 flex items-center gap-1.5 shadow-xs"
                >
                  {isSearching ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>검색 중</span>
                    </>
                  ) : "🔍 주소 검색"}
                </button>
              </div>

              {/* 검색 결과 드롭다운 — 인풋 바로 아래에 뜨도록 위치 (z-[100]) */}
              {showResults && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto z-[100] divide-y divide-border/50"
                >
                  {isSearching && (
                    <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      정부 토지·건축물대장 주소 조회 중...
                    </div>
                  )}

                  {!isSearching && searchResults.length > 0 && searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => selectAddress(result)}
                      className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground truncate">
                          {String(result.roadAddr || result.jibunAddr || "")}
                        </p>
                        {(result.pnu || result.bdMgtSn) ? (
                          <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
                            대장연동 가능 (PNU)
                          </span>
                        ) : null}
                      </div>
                      {result.jibunAddr && result.roadAddr ? (
                        <p className="text-xs text-muted-foreground mt-0.5">지번: {String(result.jibunAddr)}</p>
                      ) : null}
                      {result.bdNm ? (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-semibold">건물명: {String(result.bdNm)}</p>
                      ) : null}
                    </button>
                  ))}

                  {!isSearching && searchResults.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      검색 결과가 없습니다. 번지(예: 당산동5가 11-47) 또는 도로명(예: 영신로 259)을 입력해 주세요.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 선택된 주소 및 정부 대장 연동 확인 배지 (19자리 숫자 노출 제거) */}
            {address && (
              <div className="mt-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm text-emerald-700 dark:text-emerald-400 font-extrabold flex items-center gap-1.5">
                    ✅ {address}
                  </span>
                  {pnu && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-md font-bold border border-emerald-500/30">
                      ✓ 정부 토지·건축물대장 연결 완료
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium">
                  대지면적·용도지역·공시지가·실거래가가 제안서에 자동 반영됩니다.
                </p>
              </div>
            )}

            {/* 주소 미입력 안내 */}
            {!address && !pnu && (
              <div className="mt-2 px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  💡 주소를 검색하여 선택하시면 정부 건축물대장·토지대장이 자동으로 연결됩니다.
                </p>
              </div>
            )}
          </div>

            {/* Rent Roll Import */}
            <RentRollImporter 
              hasExistingData={floorLeases.length > 0}
              onImport={(data) => {
                if (data.monthlyRent) setMonthlyRent(data.monthlyRent.toString());
                if (data.totalDeposit) setTotalDeposit(data.totalDeposit.toString());
                if (data.mgmtFeeTotal) setMgmtFeeTotal(data.mgmtFeeTotal.toString());
                setVacancyPct(data.vacancyPct);
                const leases = data.floorLeases || [];
                setFloorLeases(leases);
                floorLeasesRef.current = leases; // 즉시 ref 동기화 — React 렌더 사이클 대기 불필요
                // v1.5: 면적 입력 단위·C5·J3~J8·V12 해제 사유를 그대로 저장 (생성 요청마다 재전송)
                if (data.meta) setRentRollMeta(data.meta);
                // J3 매각가(원→만원): 입력창이 비어 있을 때만 프리필. 중개인이 직접 입력한 값은 덮어쓰지 않음 (차이는 서버 [PRICE-RECONCILE] 경고)
                if (data.askingPriceManwon != null && !askingPrice) setAskingPrice(String(data.askingPriceManwon));
                console.log(`[RentRollImport] onImport: ${leases.length}건 floorLeases 수신`);
              }}
            />

            {/* D4: 목표 임대료 — 렌트롤 입력 근처 (안정화 수익률 산출용, 선택) */}
            <BrokerTargetRentField form={brokerExtrasForm} setForm={setBrokerExtrasForm} />

            {/* Monthly Rent */}
          <div id="bs-step-2">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
              <span>💰 월 임대료 총액</span>
              {formatManwonToKorean(monthlyRent) && (
                <span className="text-xs font-extrabold text-emerald-500">
                  = 월 {formatManwonToKorean(monthlyRent)}
                </span>
              )}
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
                className={getFieldClass('monthlyRent', 'w-full bg-secondary/50 border rounded-lg pl-4 pr-14 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">만원</span>
            </div>
            {monthlyRent && Number(monthlyRent) > 0 && (
              <p className="text-xs text-emerald-500 mt-1.5 font-medium">
                ✅ 월 {Number(monthlyRent).toLocaleString()}만원 (연간 약 {formatManwonToKorean(Number(monthlyRent) * 12)})
              </p>
            )}
            {prefillMonthlyRent && monthlyRent === String(prefillMonthlyRent) && (
              <span className="text-[10px] text-blue-400 ml-1">📋 딜카드에서 자동 입력</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Total Deposit */}
            {/* 보증금 — Basic에도 표시 */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                  <span>🔒 보증금 총액</span>
                  {formatManwonToKorean(totalDeposit) && (
                    <span className="text-[11px] font-bold text-emerald-500">
                      = {formatManwonToKorean(totalDeposit)}
                    </span>
                  )}
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
                  className={getFieldClass('totalDeposit', 'w-full bg-secondary/50 border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
              {totalDeposit && Number(totalDeposit) > 0 && (
                <p className="text-xs text-emerald-500 mt-1 font-medium">
                  ✅ {formatManwonToKorean(totalDeposit)}
                </p>
              )}
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
                <label htmlFor="input-asking-price" className="block text-xs font-semibold text-muted-foreground flex items-center gap-2">
                  <span>💰 매각 희망가</span>
                  {formatManwonToKorean(askingPrice) && (
                    <span className="text-sm font-extrabold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      = {formatManwonToKorean(askingPrice)}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if ((Number(monthlyRent) || 0) <= 0) {
                      toast.info("월 임대료를 먼저 입력하면 수익률로 매각가를 역산할 수 있습니다.");
                      return;
                    }
                    setShowYieldCalc((prev) => !prev);
                  }}
                  className="text-xs font-semibold text-primary hover:underline px-2 py-0.5 rounded bg-primary/10"
                >
                  {showYieldCalc ? "역산 닫기 ▲" : "🧮 수익률로 역산"}
                </button>
              </div>
              {showYieldCalc && (
                <div className="mb-2 p-2.5 rounded-xl bg-secondary/60 border border-primary/30 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    목표 수익률을 누르면 월 임대료·보증금 기준으로 매각 희망가가 자동 계산됩니다:
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[3.0, 3.5, 4.0, 4.5, 5.0].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => applyReverseYield(rate)}
                        className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-xs font-bold transition-colors"
                      >
                        {rate.toFixed(1)}%
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="30"
                        value={customYieldInput}
                        onChange={(e) => setCustomYieldInput(e.target.value)}
                        className="w-16 bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                        aria-label="직접 입력 수익률(%)"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <button
                        type="button"
                        onClick={() => applyReverseYield( parseFloat(customYieldInput || "0") )}
                        className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                      >
                        적용
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="relative">
                <input
                  id="input-asking-price"
                  ref={askingPriceRef}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, loanAmountRef)}
                  placeholder="예: 250000"
                  className={getFieldClass('askingPrice', 'w-full bg-secondary/50 border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">만원</span>
              </div>
              {/* 빠른 금액 입력 버튼 — 0 개수 실수 방지 */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground mr-1">빠른 합산:</span>
                {[
                  { label: "+100억", add: 1000000 },
                  { label: "+10억", add: 100000 },
                  { label: "+1억", add: 10000 },
                  { label: "+1,000만", add: 1000 },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => {
                      const cur = Number(askingPrice) || 0;
                      setAskingPrice(String(cur + btn.add));
                    }}
                    className="px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-xs font-semibold text-foreground transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
                {askingPrice && (
                  <button
                    type="button"
                    onClick={() => setAskingPrice("")}
                    className="px-2 py-1 rounded-md bg-secondary/40 hover:bg-rose-500/15 text-xs text-muted-foreground hover:text-rose-400 transition-colors ml-auto"
                  >
                    초기화
                  </button>
                )}
              </div>
              {/* 자동 계산된 수익률 표시 (V04 보증금 차감 기준 + 단순 수익률 병기) */}
              {Number(monthlyRent) > 0 && Number(askingPrice) > 0 && (() => {
                const rent = Number(monthlyRent);
                const price = Number(askingPrice);
                const dep = Number(totalDeposit) || 0;
                const netPrice = price - dep;
                const v04Yield = netPrice > 0 ? ((rent * 12) / netPrice) * 100 : null;
                const simpleYield = ((rent * 12) / price) * 100;
                return (
                  <p className="mt-1.5 text-xs text-primary/90 font-medium">
                    📊 임대수익률(보증금 차감):{" "}
                    <strong>{v04Yield != null ? `${v04Yield.toFixed(2)}%` : `${simpleYield.toFixed(2)}%`}</strong>
                    <span className="text-muted-foreground ml-1.5">
                      (매매가 대비 단순 {simpleYield.toFixed(2)}%)
                    </span>
                  </p>
                );
              })()}
              {prefillAskingPrice && askingPrice === String(prefillAskingPrice) && (
                <span className="text-[10px] text-blue-400 mt-1 block">📋 딜카드에서 자동 입력</span>
              )}
            </div>

            {/* 주차 / 승강기 대수 (선택) — 건축물대장 값이 우선, 대장 값이 없을 때만 보완 (D4) */}
            <details className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
              <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">
                주차 · 승강기 대수 (선택)
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">주차 대수</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="9999"
                      step="1"
                      value={brokerParkingCount}
                      onChange={(e) => setBrokerParkingCount(e.target.value)}
                      placeholder="예: 14"
                      className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-8 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:border-primary focus:ring-primary"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">대</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">승강기 대수</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="9999"
                      step="1"
                      value={brokerElevatorCount}
                      onChange={(e) => setBrokerElevatorCount(e.target.value)}
                      placeholder="예: 1"
                      className="w-full bg-secondary/50 border border-border rounded-lg pl-3 pr-8 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:border-primary focus:ring-primary"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">대</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">건축물대장 값이 있으면 대장 값이 우선 적용됩니다</p>
            </details>

            {/* 유사 건물 실거래가 (Pro IM 전용) */}
            <ManualCompsSection
              stage={stage}
              manualComps={manualComps}
              setManualComps={setManualComps}
            />

            {/* Loan Amount */}
            <LoanStatusSection
              stage={stage}
              loanStatus={loanStatus}
              setLoanStatus={setLoanStatus}
              loanAmount={loanAmount}
              setLoanAmount={setLoanAmount}
              loanAmountRef={loanAmountRef}
              handleEnterKey={handleEnterKey}
              prefillLoanAmount={prefillLoanAmount}
            />

            {/* 🏨 운영형 (호텔/모텔/펜션) 전용 필드 */}
            <HospitalitySpecSection
              assetType={assetType}
              roomCount={roomCount} setRoomCount={setRoomCount}
              averageDailyRate={averageDailyRate} setAverageDailyRate={setAverageDailyRate}
              occupancyRate={occupancyRate} setOccupancyRate={setOccupancyRate}
              gopMargin={gopMargin} setGopMargin={setGopMargin}
            />

            {/* 📊 운영형 확장 필드 (OperatingPerfSection) */}
            <OperatingPerfSection
              investmentPosture={investmentPosture}
              assetType={assetType}
              roomCount={roomCount} setRoomCount={setRoomCount}
              averageDailyRate={averageDailyRate} setAverageDailyRate={setAverageDailyRate}
              occupancyRate={occupancyRate} setOccupancyRate={setOccupancyRate}
              gopMargin={gopMargin} setGopMargin={setGopMargin}
              unitKind={unitKind} setUnitKind={setUnitKind}
              unitCount={unitCount} setUnitCount={setUnitCount}
              operationModel={operatingModel} setOperationModel={setOperatingModel}
              licenceTransferable={licenceTransferable} setLicenceTransferable={setLicenceTransferable}
              annualRevenue={annualRevenue} setAnnualRevenue={setAnnualRevenue}
              annualGop={annualGop} setAnnualGop={setAnnualGop}
            />

            {/* 부가수입 섹션 */}
            <AncillaryIncomeSection
              stage={stage}
              ancillaryIncomes={ancillaryIncomes}
              setAncillaryIncomes={setAncillaryIncomes}
            />

            {/* 물류센터 상세 스펙 (W-2) */}
            <LogisticsSpecSection
              stage={stage}
              assetType={assetType}
              ceilingHeight={ceilingHeight} setCeilingHeight={setCeilingHeight}
              columnSpan={columnSpan} setColumnSpan={setColumnSpan}
              floorLoadTon={floorLoadTon} setFloorLoadTon={setFloorLoadTon}
              powerCapacity={powerCapacity} setPowerCapacity={setPowerCapacity}
              dockCount={dockCount} setDockCount={setDockCount}
              dockLevelerCount={dockLevelerCount} setDockLevelerCount={setDockLevelerCount}
              maxVehicleTon={maxVehicleTon} setMaxVehicleTon={setMaxVehicleTon}
              loadingArea={loadingArea} setLoadingArea={setLoadingArea}
              coldStorageArea={coldStorageArea} setColdStorageArea={setColdStorageArea}
              coldStorageType={coldStorageType} setColdStorageType={setColdStorageType}
              vehicleAccessType={vehicleAccessType} setVehicleAccessType={setVehicleAccessType}
              fireRating={fireRating} setFireRating={setFireRating}
              sprinkler={sprinkler} setSprinkler={setSprinkler}
              hasOfficeSpace={hasOfficeSpace} setHasOfficeSpace={setHasOfficeSpace}
              officeArea={officeArea} setOfficeArea={setOfficeArea}
              icName={icName} setIcName={setIcName}
              distanceToIc={distanceToIc} setDistanceToIc={setDistanceToIc}
            />
          </div>

          {/* Vacancy — W-2: Component extraction */}
          <VacancySection
            vacancyPct={vacancyPct}
            setVacancyPct={setVacancyPct}
            vacancySignal={vacancySignal}
          />

          {/* Photos */}
          {/* 사진 — Basic에도 표시 (기존 사진 + 업로드) */}
          <div id="bs-step-3">
            <label className="block text-sm font-extrabold text-foreground mb-1 flex justify-between items-center">
              <span>📸 건물 사진 및 분류 (최대 12장)</span>
              <span className="text-xs text-primary bg-primary/10 px-2.5 py-0.5 rounded-md font-bold">⭐ 표지·외관 사진 지정</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              사진 상단의 <b className="text-amber-600 dark:text-amber-500">★ 대표</b>(표지용), <b className="text-blue-600 dark:text-blue-500">🏢 외관</b>(건물 개요용) 버튼을 눌러 지정하세요.
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2.5 snap-x">
              {/* Existing Photos */}
              {existingUrls.map((url, idx) => {
                const isRenderableUrl = Boolean(url && (/^(https?:\/\/|\/|data:|blob:)/i.test(url)));
                return (
                <div key={`existing-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1.5 w-28">
                  <div className="relative w-28 h-28">
                    {isRenderableUrl ? (
                      <img src={url} alt={`매물 사진 ${idx + 1}`} className="w-28 h-28 object-cover rounded-lg border border-border" />
                    ) : (
                      <div className="w-28 h-28 rounded-lg border border-border bg-secondary/50 flex flex-col items-center justify-center text-muted-foreground pt-4">
                        <span className="text-xl">🏢</span>
                        <span className="text-[11px] font-semibold mt-0.5">등록 사진 {idx + 1}</span>
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">기존</span>
                    <button
                      type="button"
                      title="대표 사진으로 지정"
                      onClick={() => setHeroPhotoIndex(idx)}
                      className={`absolute top-1 left-1 px-1.5 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shadow transition-colors ${heroPhotoIndex === idx ? 'bg-amber-500 text-white' : 'bg-black/65 text-white/90 hover:bg-black/80'}`}
                    >
                      ★ 대표
                    </button>
                    <button
                      type="button"
                      title="외관 사진으로 지정 (PPTX 개요 슬라이드)"
                      onClick={() => setExteriorPhotoIndex(exteriorPhotoIndex === idx ? null : idx)}
                      className={`absolute top-1 left-12 px-1.5 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shadow transition-colors ${exteriorPhotoIndex === idx ? 'bg-blue-500 text-white' : 'bg-black/65 text-white/90 hover:bg-black/80'}`}
                    >
                      🏢 외관
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExistingUrls(prev => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow"
                    >
                      ×
                    </button>
                  </div>
                  <select
                    data-testid={`photo-category-${idx}`}
                    value={photoCategories[idx] || (idx === 0 ? 'exterior' : 'interior')}
                    onChange={(e) => setPhotoCategories(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="w-28 text-xs px-1.5 py-1 rounded border border-border/60 bg-secondary/30 text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="exterior">외관 전경</option>
                    <option value="lobby">1층 로비</option>
                    <option value="interior">실내 공간</option>
                    <option value="parking">주차장</option>
                    <option value="rooftop">옥상/테라스</option>
                    <option value="entrance">주 출입구</option>
                    <option value="mechanical">기계/설비</option>
                    <option value="floor_plan">층별 도면</option>
                    <option value="location_map">위치도</option>
                    <option value="district_plan_map">지구단위계획도</option>
                    <option value="cadastral">지적도</option>
                  </select>
                  <input
                    type="text"
                    placeholder="설명 (선택)"
                    value={photoCaptions[idx] || ''}
                    onChange={(e) => setPhotoCaptions(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="w-28 text-xs px-1.5 py-1 rounded border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                  />
                </div>
                );
              })}

              {/* Newly Uploaded Photos */}
              {photoPreviewUrls.map((url, idx) => {
                const totalIdx = existingUrls.length + idx;
                return (
                  <div key={`new-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1.5 w-28">
                    <div className="relative w-28 h-28">
                      <img src={url} alt={`Preview ${idx}`} className="w-28 h-28 object-cover rounded-lg border border-border" />
                      <span className="absolute bottom-1 left-1 bg-indigo-600/90 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">신규</span>
                      <button
                        type="button"
                        title="대표 사진으로 지정"
                        onClick={() => setHeroPhotoIndex(totalIdx)}
                        className={`absolute top-1 left-1 px-1.5 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shadow transition-colors ${heroPhotoIndex === totalIdx ? 'bg-amber-500 text-white' : 'bg-black/65 text-white/90 hover:bg-black/80'}`}
                      >
                        ★ 대표
                      </button>
                      <button
                        type="button"
                        title="외관 사진으로 지정 (PPTX 개요 슬라이드)"
                        onClick={() => setExteriorPhotoIndex(exteriorPhotoIndex === totalIdx ? null : totalIdx)}
                        className={`absolute top-1 left-12 px-1.5 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shadow transition-colors ${exteriorPhotoIndex === totalIdx ? 'bg-blue-500 text-white' : 'bg-black/65 text-white/90 hover:bg-black/80'}`}
                      >
                        🏢 외관
                      </button>
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
                            if (ki < totalIdx) newCaptions[ki] = v;
                            else if (ki > totalIdx) newCaptions[ki - 1] = v;
                          });
                          setPhotoCaptions(newCaptions);
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow"
                      >
                        ×
                      </button>
                    </div>
                    <select
                      data-testid={`photo-category-${totalIdx}`}
                      value={photoCategories[totalIdx] || (totalIdx === 0 ? 'exterior' : 'interior')}
                      onChange={(e) => setPhotoCategories(prev => ({ ...prev, [totalIdx]: e.target.value }))}
                      className="w-28 text-xs px-1.5 py-1 rounded border border-border/60 bg-secondary/30 text-foreground focus:border-primary/50 focus:outline-none"
                    >
                      <option value="exterior">외관 전경</option>
                      <option value="lobby">1층 로비</option>
                      <option value="interior">실내 공간</option>
                      <option value="parking">주차장</option>
                      <option value="rooftop">옥상/테라스</option>
                      <option value="entrance">주 출입구</option>
                      <option value="mechanical">기계/설비</option>
                      <option value="floor_plan">층별 도면</option>
                      <option value="location_map">위치도</option>
                      <option value="district_plan_map">지구단위계획도</option>
                      <option value="cadastral">지적도</option>
                    </select>
                    <input
                      type="text"
                      placeholder="설명 (선택)"
                      value={photoCaptions[totalIdx] || ''}
                      onChange={(e) => setPhotoCaptions(prev => ({ ...prev, [totalIdx]: e.target.value }))}
                      className="w-28 text-xs px-1.5 py-1 rounded border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                );
              })}

              {(existingUrls.length + photoFiles.length) < 12 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-28 shrink-0 snap-start rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors bg-secondary/30"
                >
                  <span className="text-2xl leading-none mb-1">+</span>
                  <span className="text-xs font-semibold">사진 추가</span>
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
                const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
                const validFiles = Array.from(e.target.files).filter(f => f.size <= MAX_FILE_SIZE);
                if (validFiles.length < e.target.files.length) {
                  toast.error("25MB 이상의 파일은 제외되었습니다.");
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

          {/* 📐 필지·제척 입력 */}
          <ParcelSection
            parcels={parcels}
            setParcels={setParcels}
            ledgerTotalM2={0}
          />

          {/* 🏗️ 개발형 전용 필드 */}
          <DevelopmentSpecSection
            investmentPosture={investmentPosture}
            devTargetUse={devTargetUse} setDevTargetUse={setDevTargetUse}
            devTargetScalePyung={devTargetScalePyung} setDevTargetScalePyung={setDevTargetScalePyung}
            devExpectedSalePricePerPyung={devExpectedSalePricePerPyung} setDevExpectedSalePricePerPyung={setDevExpectedSalePricePerPyung}
            devConstructionCostPerPyung={devConstructionCostPerPyung} setDevConstructionCostPerPyung={setDevConstructionCostPerPyung}
            vacateResponsibility={vacateResponsibility} setVacateResponsibility={setVacateResponsibility}
            vacateTenantCount={vacateTenantCount} setVacateTenantCount={setVacateTenantCount}
            vacateEstimatedCostManwon={vacateEstimatedCostManwon} setVacateEstimatedCostManwon={setVacateEstimatedCostManwon}
            vacateEstimatedMonths={vacateEstimatedMonths} setVacateEstimatedMonths={setVacateEstimatedMonths}
            permitStatus={permitStatus} setPermitStatus={setPermitStatus}
            permitEstimatedMonths={permitEstimatedMonths} setPermitEstimatedMonths={setPermitEstimatedMonths}
          />

          {/* 🏢 자가사용형 전용 필드 */}
          <OwnerOccupiedSpecSection
            investmentPosture={investmentPosture}
            occHeadcount={occHeadcount} setOccHeadcount={setOccHeadcount}
            occAreaPerHeadPyung={occAreaPerHeadPyung} setOccAreaPerHeadPyung={setOccAreaPerHeadPyung}
            occDesiredFloors={occDesiredFloors} setOccDesiredFloors={setOccDesiredFloors}
            occCurrentRentManwon={occCurrentRentManwon} setOccCurrentRentManwon={setOccCurrentRentManwon}
          />

          {/* 📊 구분소유 건물 필드 */}
          <SectionalSpecSection
            assetType={assetType}
            sectionalOwnerCount={sectionalOwnerCount} setSectionalOwnerCount={setSectionalOwnerCount}
            sectionalLandSharePct={sectionalLandSharePct} setSectionalLandSharePct={setSectionalLandSharePct}
            sectionalManagementBody={sectionalManagementBody} setSectionalManagementBody={setSectionalManagementBody}
            sectionalMasterLease={sectionalMasterLease} setSectionalMasterLease={setSectionalMasterLease}
            jointCollateralGroup={jointCollateralGroup} setJointCollateralGroup={setJointCollateralGroup}
          />

          {/* 🏠 주거 사양 필드 */}
          <ResidentialSpecSection
            assetType={assetType}
            resTotalUnits={resTotalUnits} setResTotalUnits={setResTotalUnits}
            resJeonseUnits={resJeonseUnits} setResJeonseUnits={setResJeonseUnits}
            resJeonseDepositTotalManwon={resJeonseDepositTotalManwon} setResJeonseDepositTotalManwon={setResJeonseDepositTotalManwon}
            resIllegalExtension={resIllegalExtension} setResIllegalExtension={setResIllegalExtension}
          />

          {/* 📜 보유이력 (trading 전용) */}
          <HoldingHistorySection
            investmentPosture={investmentPosture}
            acquisitionDate={acquisitionDate} setAcquisitionDate={setAcquisitionDate}
            acquisitionPriceManwon={acquisitionPriceManwon} setAcquisitionPriceManwon={setAcquisitionPriceManwon}
            holdingMonths={holdingMonths} setHoldingMonths={setHoldingMonths}
            transferCountIn10Y={transferCountIn10Y} setTransferCountIn10Y={setTransferCountIn10Y}
            sellerMotive={sellerMotive} setSellerMotive={setSellerMotive}
          />

          {/* 💰 D41 Phase D: 취득 비용 (Pro 전용) */}
          {stage === 'pro' && (
            <AcquisitionCostSection
              acquisitionTaxPct={acquisitionTaxPct} setAcquisitionTaxPct={setAcquisitionTaxPct}
              brokerageFeeManwon={brokerageFeeManwon} setBrokerageFeeManwon={setBrokerageFeeManwon}
              legalFeeManwon={legalFeeManwon} setLegalFeeManwon={setLegalFeeManwon}
              otherCostManwon={otherAcquisitionCostManwon} setOtherCostManwon={setOtherAcquisitionCostManwon}
              askingPriceManwon={askingPrice ? parseFloat(askingPrice) : null}
            />
          )}

          {/* 🏦 D41 Phase D: 대출 시나리오 (Pro 전용) */}
          {stage === 'pro' && (
            <LoanScenarioSection
              ltvPct={ltvPct} setLtvPct={setLtvPct}
              loanInterestPct={loanInterestPct} setLoanInterestPct={setLoanInterestPct}
              loanTermYears={loanTermYears} setLoanTermYears={setLoanTermYears}
              targetIrrPct={targetIrrPct} setTargetIrrPct={setTargetIrrPct}
              loanAmountManwon={loanAmount ? parseFloat(loanAmount) : null}
              askingPriceManwon={askingPrice ? parseFloat(askingPrice) : null}
              monthlyRentKrw={monthlyRent ? parseFloat(monthlyRent) * 10000 : null}
            />
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

          {/* D4: 중개인 추가 정보 (선택) — 접이식, 한줄 코멘트 바로 아래 */}
          <BrokerExtrasSection form={brokerExtrasForm} setForm={setBrokerExtrasForm} />
        </div>

        {/* Footer actions - Fixed at bottom */}
        <div className="shrink-0 pt-3 border-t border-border/40 mt-auto bg-background">
          {/* v3: Data Grade Progress — DataGradeFooter 컴포넌트 */}
          <DataGradeFooter
            currentGrade={currentDataGrade}
            gradeUpItems={gradeUpItems}
          />

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
                <motion.button
                  id="cta-generate-mobile-im"
                  data-testid="bottom-sheet-generate-btn"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreate}
                  disabled={state === "loading" || !canGenerate}
                  className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl py-3.5 text-base font-extrabold shadow-md disabled:opacity-50 transition-all hover:opacity-95 flex items-center justify-center gap-2"
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
                  "⚡ IM 생성"
                )}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modalContent, document.body);
}
