/**
 * W-1: Posture-specific form state hooks
 *
 * Extracted from use-im-data-form.ts to reduce its size.
 * Each hook manages the form state for its respective posture.
 */
import { useState } from 'react';

// ── Income / Common financial state ──
export function useIncomeFormState() {
  const [monthlyRent, setMonthlyRent] = useState('');
  const [totalDeposit, setTotalDeposit] = useState('');
  const [mgmtFeeTotal, setMgmtFeeTotal] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanStatus, setLoanStatus] = useState<string>('unknown');
  const [ancillaryIncomes, setAncillaryIncomes] = useState<any[]>([]);
  const [askingPrice, setAskingPrice] = useState('');
  const [vacancyPct, setVacancyPct] = useState<number | ''>('');

  return {
    monthlyRent, setMonthlyRent,
    totalDeposit, setTotalDeposit,
    mgmtFeeTotal, setMgmtFeeTotal,
    loanAmount, setLoanAmount,
    loanStatus, setLoanStatus,
    ancillaryIncomes, setAncillaryIncomes,
    askingPrice, setAskingPrice,
    vacancyPct, setVacancyPct,
  };
}

// ── Development posture state ──
export function useDevelopmentFormState() {
  const [devTargetUse, setDevTargetUse] = useState<string>('office');
  const [devTargetScalePyung, setDevTargetScalePyung] = useState<string>('');
  const [devExpectedSalePricePerPyung, setDevExpectedSalePricePerPyung] = useState<string>('');
  const [devConstructionCostPerPyung, setDevConstructionCostPerPyung] = useState<string>('750');
  const [devContractorStatus, setDevContractorStatus] = useState<string>('undecided');
  const [vacateResponsibility, setVacateResponsibility] = useState<string>('seller');
  const [vacateTenantCount, setVacateTenantCount] = useState<string>('');
  const [vacateEstimatedCostManwon, setVacateEstimatedCostManwon] = useState<string>('');
  const [vacateEstimatedMonths, setVacateEstimatedMonths] = useState<string>('');
  const [permitKinds, setPermitKinds] = useState<string[]>([]);
  const [permitStatus, setPermitStatus] = useState<string>('in_progress');
  const [permitEstimatedMonths, setPermitEstimatedMonths] = useState<string>('');

  return {
    devTargetUse, setDevTargetUse,
    devTargetScalePyung, setDevTargetScalePyung,
    devExpectedSalePricePerPyung, setDevExpectedSalePricePerPyung,
    devConstructionCostPerPyung, setDevConstructionCostPerPyung,
    devContractorStatus, setDevContractorStatus,
    vacateResponsibility, setVacateResponsibility,
    vacateTenantCount, setVacateTenantCount,
    vacateEstimatedCostManwon, setVacateEstimatedCostManwon,
    vacateEstimatedMonths, setVacateEstimatedMonths,
    permitKinds, setPermitKinds,
    permitStatus, setPermitStatus,
    permitEstimatedMonths, setPermitEstimatedMonths,
  };
}

// ── Owner-Occupied posture state ──
export function useOwnerOccupiedFormState() {
  const [occHeadcount, setOccHeadcount] = useState<string>('');
  const [occAreaPerHeadPyung, setOccAreaPerHeadPyung] = useState<string>('3.3');
  const [occDesiredFloors, setOccDesiredFloors] = useState<string>('');
  const [occCurrentRentManwon, setOccCurrentRentManwon] = useState<string>('');

  return {
    occHeadcount, setOccHeadcount,
    occAreaPerHeadPyung, setOccAreaPerHeadPyung,
    occDesiredFloors, setOccDesiredFloors,
    occCurrentRentManwon, setOccCurrentRentManwon,
  };
}

// ── Operating posture state ──
export function useOperatingFormState() {
  const [roomCount, setRoomCount] = useState<string>('');
  const [averageDailyRate, setAverageDailyRate] = useState<string>('');
  const [occupancyRate, setOccupancyRate] = useState<string>('');
  const [gopMargin, setGopMargin] = useState<string>('');
  const [operatingModel, setOperatingModel] = useState<string>('self');
  const [operatingEntity, setOperatingEntity] = useState<string>('');
  const [unitKind, setUnitKind] = useState<string>('room');
  const [unitCount, setUnitCount] = useState<string>('');
  const [licenceTransferable, setLicenceTransferable] = useState<boolean | null>(null);
  const [annualRevenue, setAnnualRevenue] = useState<string>('');
  const [annualGop, setAnnualGop] = useState<string>('');

  return {
    roomCount, setRoomCount,
    averageDailyRate, setAverageDailyRate,
    occupancyRate, setOccupancyRate,
    gopMargin, setGopMargin,
    operatingModel, setOperatingModel,
    operatingEntity, setOperatingEntity,
    unitKind, setUnitKind,
    unitCount, setUnitCount,
    licenceTransferable, setLicenceTransferable,
    annualRevenue, setAnnualRevenue,
    annualGop, setAnnualGop,
  };
}

// ── Trading posture state ──
export function useTradingFormState() {
  const [acquisitionDate, setAcquisitionDate] = useState<string>('');
  const [acquisitionPriceManwon, setAcquisitionPriceManwon] = useState<string>('');
  const [holdingMonths, setHoldingMonths] = useState<string>('');
  const [transferCountIn10Y, setTransferCountIn10Y] = useState<string>('');
  const [sellerMotive, setSellerMotive] = useState<string>('');

  return {
    acquisitionDate, setAcquisitionDate,
    acquisitionPriceManwon, setAcquisitionPriceManwon,
    holdingMonths, setHoldingMonths,
    transferCountIn10Y, setTransferCountIn10Y,
    sellerMotive, setSellerMotive,
  };
}

// ── Sectional / Residential / Logistics / Pro-specific state ──
export function useSpecializedFormState() {
  // 구분소유
  const [sectionalOwnerCount, setSectionalOwnerCount] = useState<string>('');
  const [sectionalManagementBody, setSectionalManagementBody] = useState<string>('unknown');
  const [sectionalMasterLease, setSectionalMasterLease] = useState<string>('no');
  const [jointCollateralGroup, setJointCollateralGroup] = useState<string>('');
  const [sectionalLandSharePct, setSectionalLandSharePct] = useState<string>('100');
  const [sectionalFullPurchase, setSectionalFullPurchase] = useState<string>('full');
  // 주거
  const [resTotalUnits, setResTotalUnits] = useState<string>('');
  const [resJeonseUnits, setResJeonseUnits] = useState<string>('');
  const [resMonthlyUnits, setResMonthlyUnits] = useState<string>('');
  const [resJeonseDepositTotalManwon, setResJeonseDepositTotalManwon] = useState<string>('');
  const [resIllegalExtension, setResIllegalExtension] = useState<boolean>(false);
  // Pro 취득비용
  const [acquisitionTaxPct, setAcquisitionTaxPct] = useState<string>('');
  const [brokerageFeeManwon, setBrokerageFeeManwon] = useState<string>('');
  const [legalFeeManwon, setLegalFeeManwon] = useState<string>('');
  const [otherAcquisitionCostManwon, setOtherAcquisitionCostManwon] = useState<string>('');
  // Pro 대출 시나리오
  const [ltvPct, setLtvPct] = useState<string>('');
  const [loanInterestPct, setLoanInterestPct] = useState<string>('');
  const [loanTermYears, setLoanTermYears] = useState<string>('');
  const [targetIrrPct, setTargetIrrPct] = useState<string>('');

  return {
    sectionalOwnerCount, setSectionalOwnerCount,
    sectionalManagementBody, setSectionalManagementBody,
    sectionalMasterLease, setSectionalMasterLease,
    jointCollateralGroup, setJointCollateralGroup,
    sectionalLandSharePct, setSectionalLandSharePct,
    sectionalFullPurchase, setSectionalFullPurchase,
    resTotalUnits, setResTotalUnits,
    resJeonseUnits, setResJeonseUnits,
    resMonthlyUnits, setResMonthlyUnits,
    resJeonseDepositTotalManwon, setResJeonseDepositTotalManwon,
    resIllegalExtension, setResIllegalExtension,
    acquisitionTaxPct, setAcquisitionTaxPct,
    brokerageFeeManwon, setBrokerageFeeManwon,
    legalFeeManwon, setLegalFeeManwon,
    otherAcquisitionCostManwon, setOtherAcquisitionCostManwon,
    ltvPct, setLtvPct,
    loanInterestPct, setLoanInterestPct,
    loanTermYears, setLoanTermYears,
    targetIrrPct, setTargetIrrPct,
  };
}
