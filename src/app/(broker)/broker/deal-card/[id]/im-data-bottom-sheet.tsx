"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
} from "./bottom-sheet/sections";
import { getInputOrder } from "./bottom-sheet/hooks/use-input-order";
import { validateCombination } from "@/domain/ontology/asset-identity";
import { hasValidBuildingNumber } from "@/domain/verification/address-resolver";
import { useImDataForm } from "./use-im-data-form";

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
      canGenerate
    } = useImDataForm({ 
      buildingId, isOpen, onClose, areaSignal, assetType, priceBand, sizeSignal, vacancySignal, 
      fitSummary, cautionSummary, existingPhotoUrls, initialAddress, initialPnu, prefillMonthlyRent, 
      prefillTotalDeposit, prefillMgmtFee, prefillAskingPrice, prefillLoanAmount, prefillVacancyPct, 
      initialInvestmentPosture, currentDataGrade, gradeUpItems, initialStage, targetTier, postureProposal, existingDocBody 
    });
    if (!isOpen) return null;
    if (typeof window === 'undefined') return null;
  // D37 L-3: 5종 tier → legacy stage 변환
  // Form states
  // ── 포스처 및 Pack Slot 신규 State ──
  // 누락 필드 하이라이팅 헬퍼
  // ── 물류센터 전용 필드 state ──
  // ── 운영형 (호텔/모텔/펜션) 필드 state ──
  // 개발형 (DevelopmentPlan, VacatePlan, PermitRisk)
  // 자가사용형 (OccupancyPlan)
  // 구분소유 (SectionalSpec)
  // 주거사양 (ResidentialSpec)
  // ── trading 포스처 (보유이력) ──
  // ── operating 포스처 (운영실적 확장) ──
  // ── 필지 (ParcelSection) ──
  // ── D41 Phase D: 취득 비용 ──
  // ── D41 Phase D: 대출 시나리오 ──
  // Address search states
  // Photo states
  // floorLeases 상태 → ref 동기화 (handleCreate에서 최신 값 보장)
  // 현재 입력 상태에 따른 필수 데이터 누락 여부 동적 계산
  // U-6: 포스처 변경 시 조합 검증
  // Sync props when opening/changing
  // v3: Auto-prefill from deal card data
  // 간이 Readiness 계산 로직 (바텀시트 내부 표시용)
  // 드롭다운 위치 계산 (portal용)
  // 주소 검색 (실제 API 호출)
  // 주소 결과 선택
  // Enter 키로 검색 (주소)
  // Pro IM은 A등급 이상에서만 가능
  // Basic: Grade D 차단 (basic-im-guide.md)
  // Pro: Grade B 이상 필요
  // Portal을 사용하여 document.body에 직접 렌더링
  // 부모 요소의 transform/filter CSS가 fixed 포지셔닝을 깨뜨리는 문제 방지
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4" role="presentation">
      <div 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="bottom-sheet-title"
        className="bg-background rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,20px)]"
      >
        
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 id="bottom-sheet-title" className="text-lg font-bold text-foreground">
            {'📊 투자설명서(IM) 만들기'}
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4 shrink-0">
          {'기본 정보를 입력하여 모바일 투자설명서를 생성하세요.'}
        </p>

        {computedMissingFields.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 flex items-start gap-2 shrink-0">
            <span className="text-red-500 shrink-0">⚠️</span>
            <p className="text-xs text-red-500 font-medium">
              IM 작성을 위해 필수적인 정보가 누락되었습니다. 빨간색으로 강조된 항목을 입력해주세요.
            </p>
          </div>
        )}

        {stage === 'basic' && currentDataGrade === 'D' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 flex items-start gap-2 shrink-0">
            <span className="text-red-500 shrink-0">🚨</span>
            <p className="text-xs text-red-500 font-bold">
              주소와 기본 가격 정보가 필요합니다
            </p>
          </div>
        )}

        {stage === 'pro' && (currentDataGrade === 'C' || currentDataGrade === 'D') && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 flex items-start gap-2 shrink-0">
            <span className="text-yellow-500 shrink-0">⚠️</span>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 font-bold">
              전문 IM은 B등급 이상 데이터가 필요합니다
            </p>
          </div>
        )}

        {/* Scrollable Form Area */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 mb-6 pb-10">
          {/* 🎯 투자 포스처 선택 */}
          <PostureSelector
            investmentPosture={investmentPosture}
            setInvestmentPosture={setInvestmentPosture}
            postureProposal={postureProposal}
          />

          {/* 주소 + 월세 + 렌트롤 — Basic에도 표시 */}
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
                  onFocus={() => {
                    if (searchResults.length > 0) setShowResults(true);
                  }}
                  placeholder="동/도로명 입력 후 검색 (예: 당산동5가 11-47, 영신로 259)"
                  className={getFieldClass('address', 'flex-1 bg-secondary/50 border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
                />
                <button 
                  onClick={() => handleAddressSearch()}
                  disabled={isSearching || searchKeyword.trim().length < 2}
                  className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                >
                  {isSearching ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>검색 중</span>
                    </>
                  ) : "검색"}
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
                      주소 및 PNU 조회 중...
                    </div>
                  )}

                  {!isSearching && searchResults.length > 0 && searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => selectAddress(result)}
                      className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {String(result.roadAddr || result.jibunAddr || "")}
                        </p>
                        {(result.pnu || result.bdMgtSn) ? (
                          <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
                            PNU {String(result.pnu || result.bdMgtSn).slice(0, 19)}
                          </span>
                        ) : null}
                      </div>
                      {result.jibunAddr && result.roadAddr ? (
                        <p className="text-xs text-muted-foreground mt-0.5">지번: {String(result.jibunAddr)}</p>
                      ) : null}
                      {result.bdNm ? (
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 font-medium">건물명: {String(result.bdNm)}</p>
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

            {/* 선택된 주소 및 PNU 확인 배지 */}
            {address && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    ✅ {address}
                  </span>
                  {pnu && (
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold border border-emerald-500/30">
                      PNU {pnu}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                  건축물대장 및 공공데이터 조회가 정상 활성화되었습니다.
                </p>
              </div>
            )}

            {/* 주소 미입력 경고 — 주소/PNU 미선택 시에만 노출 */}
            {!address && !pnu && (
              <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  💡 주소 검색 후 목록에서 건물을 선택하면 19자리 PNU와 건축물대장이 자동 연동됩니다.
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
                console.log(`[RentRollImport] onImport: ${leases.length}건 floorLeases 수신`);
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
                className={getFieldClass('monthlyRent', 'w-full bg-secondary/50 border rounded-lg pl-4 pr-14 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
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
                  className={getFieldClass('totalDeposit', 'w-full bg-secondary/50 border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
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
                  className={getFieldClass('askingPrice', 'w-full bg-secondary/50 border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1')}
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
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 flex justify-between items-center">
              <span>📸 건물 사진 및 분류 (최대 12장)</span>
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">⭐ 대표 지정 가능 · 점수 +10</span>
            </label>
            <div className="flex gap-2.5 overflow-x-auto pb-2.5 snap-x">
              {/* Existing Photos */}
              {existingUrls.map((url, idx) => (
                <div key={`existing-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1.5 w-24">
                  <div className="relative w-24 h-24">
                    <img src={url} alt={`Existing ${idx}`} className="w-24 h-24 object-cover rounded-lg border border-border" />
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded font-bold">기존</span>
                    <button
                      type="button"
                      title="대표 사진으로 지정"
                      onClick={() => setHeroPhotoIndex(idx)}
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-xs shadow transition-colors ${heroPhotoIndex === idx ? 'bg-amber-500 text-white' : 'bg-black/40 text-white/70 hover:bg-black/60'}`}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      title="외관 사진으로 지정 (PPTX 개요 슬라이드)"
                      onClick={() => setExteriorPhotoIndex(exteriorPhotoIndex === idx ? null : idx)}
                      className={`absolute top-1 left-7 w-5 h-5 rounded-full flex items-center justify-center text-[8px] shadow transition-colors ${exteriorPhotoIndex === idx ? 'bg-blue-500 text-white' : 'bg-black/40 text-white/70 hover:bg-black/60'}`}
                    >
                      🏢
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExistingUrls(prev => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                    >
                      ×
                    </button>
                  </div>
                  <select
                    value={photoCategories[idx] || (idx === 0 ? 'exterior' : 'interior')}
                    onChange={(e) => setPhotoCategories(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="w-24 text-[10px] px-1 py-0.5 rounded border border-border/60 bg-secondary/30 text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="exterior">외관 전경</option>
                    <option value="lobby">1층 로비</option>
                    <option value="interior">실내 공간</option>
                    <option value="parking">주차장</option>
                    <option value="rooftop">옥상/테라스</option>
                    <option value="entrance">주 출입구</option>
                    <option value="mechanical">기계/설비</option>
                    <option value="floor_plan">층별 도면</option>
                  </select>
                  <input
                    type="text"
                    placeholder="설명 (선택)"
                    value={photoCaptions[idx] || ''}
                    onChange={(e) => setPhotoCaptions(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="w-24 text-[10px] px-1 py-0.5 rounded border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                  />
                </div>
              ))}

              {/* Newly Uploaded Photos */}
              {photoPreviewUrls.map((url, idx) => {
                const totalIdx = existingUrls.length + idx;
                return (
                  <div key={`new-${idx}`} className="shrink-0 snap-start flex flex-col items-center gap-1.5 w-24">
                    <div className="relative w-24 h-24">
                      <img src={url} alt={`Preview ${idx}`} className="w-24 h-24 object-cover rounded-lg border border-border" />
                      <span className="absolute bottom-1 left-1 bg-indigo-600/80 text-white text-[8px] px-1 rounded font-bold">신규</span>
                      <button
                        type="button"
                        title="대표 사진으로 지정"
                        onClick={() => setHeroPhotoIndex(totalIdx)}
                        className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-xs shadow transition-colors ${heroPhotoIndex === totalIdx ? 'bg-amber-500 text-white' : 'bg-black/40 text-white/70 hover:bg-black/60'}`}
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        title="외관 사진으로 지정 (PPTX 개요 슬라이드)"
                        onClick={() => setExteriorPhotoIndex(exteriorPhotoIndex === totalIdx ? null : totalIdx)}
                        className={`absolute top-1 left-7 w-5 h-5 rounded-full flex items-center justify-center text-[8px] shadow transition-colors ${exteriorPhotoIndex === totalIdx ? 'bg-blue-500 text-white' : 'bg-black/40 text-white/70 hover:bg-black/60'}`}
                      >
                        🏢
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
                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                      >
                        ×
                      </button>
                    </div>
                    <select
                      value={photoCategories[totalIdx] || (totalIdx === 0 ? 'exterior' : 'interior')}
                      onChange={(e) => setPhotoCategories(prev => ({ ...prev, [totalIdx]: e.target.value }))}
                      className="w-24 text-[10px] px-1 py-0.5 rounded border border-border/60 bg-secondary/30 text-foreground focus:border-primary/50 focus:outline-none"
                    >
                      <option value="exterior">외관 전경</option>
                      <option value="lobby">1층 로비</option>
                      <option value="interior">실내 공간</option>
                      <option value="parking">주차장</option>
                      <option value="rooftop">옥상/테라스</option>
                      <option value="entrance">주 출입구</option>
                      <option value="mechanical">기계/설비</option>
                      <option value="floor_plan">층별 도면</option>
                    </select>
                    <input
                      type="text"
                      placeholder="설명 (선택)"
                      value={photoCaptions[totalIdx] || ''}
                      onChange={(e) => setPhotoCaptions(prev => ({ ...prev, [totalIdx]: e.target.value }))}
                      className="w-24 text-[10px] px-1 py-0.5 rounded border border-border/60 bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                );
              })}

              {(existingUrls.length + photoFiles.length) < 12 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 shrink-0 snap-start rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors bg-secondary/30"
                >
                  <span className="text-xl leading-none mb-1">+</span>
                  <span className="text-[10px]">사진 추가</span>
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
                <button
                  id="cta-generate-mobile-im"
                  data-testid="bottom-sheet-generate-btn"
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
                  "⚡ IM 생성"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
