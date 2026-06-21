/**
 * WALE (Weighted Average Lease Expiry) 계산기
 * 가중평균 임대차 잔여기간을 산출합니다.
 * 주로 점유 면적(Area) 또는 임대료(Rent) 기준으로 가중치를 둡니다.
 */

export interface LeaseUnit {
  tenantName: string;
  rentAmount: number; // 월 임대료
  areaSqm: number; // 임대 면적
  leaseEndDate: string; // "YYYY-MM-DD"
}

export interface WaleResult {
  waleByRentYears: number;
  waleByAreaYears: number;
  atRiskRentPct12m: number; // 12개월 내 만기되는 임대료 비중 (%)
}

/**
 * 렌트롤 데이터를 기반으로 WALE를 계산합니다.
 */
export function calculateWALE(leases: LeaseUnit[], analysisDateStr?: string): WaleResult {
  const analysisDate = analysisDateStr ? new Date(analysisDateStr) : new Date();
  
  let totalRent = 0;
  let totalArea = 0;
  let weightedRentDays = 0;
  let weightedAreaDays = 0;
  let rentExpiring12m = 0;

  for (const lease of leases) {
    if (!lease.leaseEndDate || lease.rentAmount <= 0) continue;
    
    const endDate = new Date(lease.leaseEndDate);
    const diffTime = endDate.getTime() - analysisDate.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);

    if (diffDays <= 0) continue; // 이미 만기됨

    totalRent += lease.rentAmount;
    totalArea += lease.areaSqm;
    
    weightedRentDays += lease.rentAmount * diffDays;
    weightedAreaDays += lease.areaSqm * diffDays;

    if (diffDays <= 365) {
      rentExpiring12m += lease.rentAmount;
    }
  }

  const daysInYear = 365.25;

  return {
    waleByRentYears: totalRent > 0 ? (weightedRentDays / totalRent) / daysInYear : 0,
    waleByAreaYears: totalArea > 0 ? (weightedAreaDays / totalArea) / daysInYear : 0,
    atRiskRentPct12m: totalRent > 0 ? (rentExpiring12m / totalRent) * 100 : 0,
  };
}
