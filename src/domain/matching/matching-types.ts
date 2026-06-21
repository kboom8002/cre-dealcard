/**
 * Matching Engine Types — Phase 1 ①
 * JS-Oracle 3-Stage pipeline ported to cre-dealcard
 */

export type MatchGrade = 'S' | 'A' | 'B' | 'C';
export type WeightProfile = '사옥' | '투자' | '증여' | 'default';

export interface MatchInput {
  buildingSsotLiteId: string;
  buyerIntentLiteId: string;
  brokerId: string;
  building: {
    areaSignal: string;
    assetType: string;
    priceBand: string | null;
    vacancySignal: string | null;
    fitSummary: string;
    cautionSummary: string;
    dealCuriosityScore?: number;
  };
  intent: {
    buyerType: string;
    budgetRange: { min: number | null; max: number | null; display: string };
    preferredRegions: string[];
    assetTypes: string[];
    purchasePurpose: string;
    mustHave: string[];
    niceToHave: string[];
    riskTolerance: string;
    inferredPurpose?: string;
    recommendedWeightProfile?: string;
  };
}

export interface MatchResult {
  grade: MatchGrade;
  score: number;
  stage1Passed: boolean;
  stage2Similarity: number;
  stage3Score: number;
  reasoning: string;
  purposeWeightProfile: WeightProfile;
  stage1Details?: Record<string, boolean>;
  stage3Weights?: Record<string, number>;
}

export interface Stage1Result {
  passed: boolean;
  failReasons: string[];
  details?: {
    region: boolean;
    budget: boolean;
    asset: boolean;
    schedule?: boolean;
  };
}

// Purpose weights: market(시장), financial(재무), vacancy(공실), semantic(시맨틱)
export const PURPOSE_WEIGHTS: Record<WeightProfile, Record<string, number>> = {
  '사옥':   { market: 0.35, financial: 0.25, vacancy: 0.15, semantic: 0.25 },
  '투자':   { market: 0.20, financial: 0.40, vacancy: 0.15, semantic: 0.25 },
  '증여':   { market: 0.10, financial: 0.15, vacancy: 0.00, semantic: 0.25, tax: 0.50 },
  'default':{ market: 0.25, financial: 0.30, vacancy: 0.20, semantic: 0.25 },
};

// ── Schedule Extensions ──────────────────────────────────────────────────

export interface AvailableSlotSummary {
  slotId: string;
  date: string;           // ISO date
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  slotType: string;
  status: 'available' | 'held';
  priceBand: string | null;
}

export interface DateRange {
  start: string;          // ISO date
  end: string;            // ISO date
}

export interface TimeSlot {
  dayOfWeek: number;      // 0(일)~6(토)
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
}

export interface ScheduleMatchInput extends MatchInput {
  vendor: MatchInput['building'] & {
    availableSlots: AvailableSlotSummary[];
  };
  clientSchedule: {
    preferredDates: DateRange[];
    preferredTimeSlots: TimeSlot[];
    flexibility: 'strict' | 'moderate' | 'flexible';
    urgency: 'immediate' | 'within_week' | 'within_month' | 'flexible';
    blackoutDates: string[];
  };
}

// 도메인별 Weight Profile (예약 도메인용)
export const BOOKING_PURPOSE_WEIGHTS: Record<string, Record<string, number>> = {
  // CRE 임장/방문
  'site_tour': { schedule: 0.40, market: 0.20, financial: 0.20, semantic: 0.20 },
  // CRE 전문가 상담
  'expert_consultation': { schedule: 0.30, expertise: 0.40, semantic: 0.30 },
  // 🎊 웨딩
  'wedding': { schedule: 0.35, style: 0.25, budget: 0.20, location: 0.10, semantic: 0.10 },
  // 💼 컨설팅
  'consulting': { expertise: 0.35, schedule: 0.20, budget: 0.20, industry: 0.15, semantic: 0.10 },
  // 🧠 상담
  'counseling': { schedule: 0.30, specialty: 0.30, approach: 0.20, budget: 0.10, semantic: 0.10 },
};
