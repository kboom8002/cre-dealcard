export interface LeaseUnitPrecise {
  id: string;
  floor: string;
  roomNumber?: string;
  tenantName: string;
  industry?: string;
  leaseArea: number; // py
  exclusiveArea?: number; // py
  deposit: number;
  monthlyRent: number;
  maintenanceFee?: number;
  startDate: Date;
  endDate: Date;
  isNoc?: boolean;
  hasRenewalRight?: boolean;
  marketRent?: number;
  specialAgreements?: string;
  contactNumber?: string;
  guarantor?: string;
}

export interface LeaseDerivedMetrics {
  exclusiveRatio: number | null;
  rentPerPyeong: number | null;
  increaseHeadroom: number | null;
  convertedDeposit: number | null;
  leaseActApplication: boolean;
  renewalRightRemaining: boolean;
}
