// src/types/im-core.ts
// IMCore 단일 자료구조 및 PPTX 15종 아키타입 Props 계약
// Spec: API_TYPE_CONTRACT.md (D3 §4, §5, §6)

import type { Ontology, PriceBand } from './ontology';
import type {
  Resolution,
  Capability,
  EquityBreakdown,
  CapRateBasis,
  YieldValue,
  Headline,
  LeaseRow,
  FinancialInput,
} from './im';

export type {
  Resolution,
  Capability,
  EquityBreakdown,
  CapRateBasis,
  YieldValue,
  Headline,
  LeaseRow,
  FinancialInput,
};

// ══════════════════════════════════════════════════════════════════════
// §1. 검증 게이트 & 결손 모델
// ══════════════════════════════════════════════════════════════════════

export type GateCode =
  // 운영 게이트 (QG 네임스페이스)
  | 'QG13' | 'QG15' | 'QG16' | 'QG17' | 'QG18' | 'QG19' | 'QG21'
  // 발행 게이트 (G17~G30)
  | 'G20' | 'G22' | 'G23' | 'G24' | 'G25' | 'G26' | 'G27' | 'G28' | 'G29' | 'G30'
  // 제약조건·재무
  | 'C19' | 'C-BASIS' | 'C29' | 'C30' | 'C32' | 'C33' | 'C34'
  | 'X05'
  | 'F12' | 'F13';    // 30일 내 만료

export interface Violation {
  code: GateCode;
  block: boolean;                       // true면 발행 차단
  msg: string;
  ask?: string;                         // 사용자에게 물을 문장
  field?: string;
}

/** 결손 항목 모델 — 결손은 사라지지 않고 IM에 보존되어 신뢰를 만듭니다 */
export interface Deficiency {
  field: string;
  label: string;                        // 화면 문구 — "최초 계약일"
  affects: Capability[];                // 이것이 없어서 못 하는 것
  nextBest: string | null;              // 다음에 채우면 가장 이득인 칸
  severity: 'block' | 'degrade' | 'note';
}

// ══════════════════════════════════════════════════════════════════════
// §2. IMCore 단일 자료구조
// ══════════════════════════════════════════════════════════════════════

export interface Address {
  raw: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  sido: string;
  sigungu: string;
  dong: string;
  pnu: string | null;
}

export interface PhysicalFacts {
  landAreaSqm: number | null;
  totalGrossAreaSqm: number | null;
  floorsAbove: number | null;
  floorsBelow: number | null;
  completionYear: number | null;
  parkingCount: number | null;
  elevatorCount: number | null;
  zoning: string | null;
  bcrPct: number | null;
  farPct: number | null;
  roadAccess: string | null;
}

export interface Comp {
  address: string;
  priceKrw: number;
  areaSqm: number;
  pricePerPyeong: number;
  dealDate: string;
  distanceMeter?: number;
}

export interface NumericalAnchors {
  askingPriceManwon: number;
  totalDepositManwon: number;
  monthlyRentTotalManwon: number;
  grossYieldPct: number;
  netYieldPct: number | null;
  landAreaPyung: number;
  grossAreaPyung: number;
  [key: string]: number | null;
}

export interface Provenance {
  source: 'public_api' | 'broker_input' | 'llm_reasoning' | 'verified_doc';
  tier: 'S' | 'A' | 'B' | 'C';
  verifiedAt: string;
}

export interface AttachedDoc {
  docType: string;
  fileName: string;
  fileUrl: string;
  verified: boolean;
}

/** IMCore — 전체 파이프라인(모바일 웹, PPTX, 마크다운)이 공유하는 정형 SSoT 객체 */
export interface IMCore {
  meta: {
    assetId: string;
    ontology: Ontology;
    generatedAt: string;
    resolution: Resolution;
    capabilities: Capability[];
    priceBand: PriceBand;
  };
  address: Address;
  physical: PhysicalFacts;
  price: {
    askingKrw: number;
    perPyeongLand: number;
    officialLandPriceRatio: number | null;
  };
  equity: EquityBreakdown;
  yields: Partial<Record<CapRateBasis, YieldValue>>;
  headline: Headline;
  leases: LeaseRow[];
  comps: Comp[];
  deficiencies: Deficiency[];           // ★ 마스킹하지 않고 그대로 노출
  anchors: NumericalAnchors;
  provenance: Record<string, Provenance>;
  attachedDocs: AttachedDoc[];
}

export type MaskLevel = 'public' | 'full';

// ══════════════════════════════════════════════════════════════════════
// §3. 아키타입 15종 Props 정의 (PPTX 직접 렌더링용)
// ══════════════════════════════════════════════════════════════════════

export type ArchetypeId =
  | 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08'
  | 'A09' | 'A10' | 'A13' | 'A14' | 'A15' | 'A16' | 'A17';

/** A16: 투자 구조 및 LTV 시나리오 슬라이드 Props */
export interface A16Props {
  equity: EquityBreakdown;
  ltvScenarios: {
    ltv: number;
    loan: number;
    equity: number;
    monthlyNet: number;
    roe: number | null;
  }[];
  negativeLeverage: {
    active: boolean;
    grossYield: number;
    loanRate: number;
  };
  assumptions: {
    key: string;
    label: string;
    basis: string;
  }[];
}

/** A17: 준공 전 분양/임대 마케팅 슬라이드 Props (개발형 전용) */
export interface A17Props {
  devScale: {
    targetFarPct: number;
    targetGrossAreaPyung: number;
    targetUse: string;
    constructionMonths: number;
  };
  preLeasingPlan: {
    targetTenantSector: string;
    expectedRentPerPyung: number;
    vacateStatus: string;
  };
  regulationNotice?: {
    basis: string;
    expiryDate: string;
    daysLeft: number;
  };
}
