export interface LeaseUnitPrecise {
  level: string;                       // 'B1' | '1F' ...
  unitNo: string;                      // '301호'
  purpose: string;                     // 용도
  contractAreaM2: number;              // 계약면적
  exclusiveAreaM2: number;             // 전용면적
  depositKrw: number;
  monthlyRentKrw: number;
  managementFeeKrw: number;
  managementFeeType: 'fixed' | 'actual';
  vatIncluded: boolean;
  firstContractDate: string;           // 최초 계약일 ← 갱신요구권 기산점
  currentStartDate: string;
  expiryDate: string;
  handoverCondition: 'succeed' | 'vacate' | 'negotiable';
  rentFreeRemainingMonths: number | null;
  arrears: 'none' | 'minor' | 'major' | 'unknown';
}

export interface LeaseDerivedMetrics {
  exclusiveRatio: number | null;
  rentPerPyeong: number | null;
  increaseHeadroom: number | null;
  convertedDeposit: number | null;
  leaseActApplication: boolean;
  renewalRightRemaining: boolean;
}
