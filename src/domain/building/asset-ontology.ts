import type { ProvenanceTier } from '@/domain/ontology/provenance';

/**
 * @module AssetOntology
 * @description CREDEAL v3 Asset Ontology Loader.
 * v0.2: 5-tier provenance, seller 등급 분리, 슬롯 배열화.
 * Full v0.2 slot catalog: see @/domain/ontology/slots.ts
 * @see ONTOLOGY_V0.2_SPEC.md, SDD §6 S1-T1
 */

export type AssetType =
  | 'office'
  | 'retail'
  | 'logistics'
  | 'residential'
  | 'mixed_use'
  | 'land'
  | 'hotel'
  | 'industrial';

export type ZoningRegion =
  | '제1종전용주거지역' | '제2종전용주거지역'
  | '제1종일반주거지역' | '제2종일반주거지역' | '제3종일반주거지역'
  | '준주거지역'
  | '중심상업지역' | '일반상업지역' | '근린상업지역' | '유통상업지역'
  | '전용공업지역' | '일반공업지역' | '준공업지역';

export interface OntologySlot {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  required: boolean;
  source?: string;
  /** v0.2: 5-tier provenance */
  provenance?: ProvenanceTier;
}

export interface OntologyDefinition {
  assetType: AssetType;
  requiredSlots: OntologySlot[];
  optionalSlots: OntologySlot[];
  gradeWeights: Record<string, number>;
}

/** Core slots required for ALL asset types */
const UNIVERSAL_SLOTS: OntologySlot[] = [
  { key: 'address', label: '주소', type: 'string', required: true, source: '건축물대장', provenance: 'public' },
  { key: 'askingPriceKrw', label: '매각 희망가', type: 'number', required: true, source: 'seller', provenance: 'seller' },
  { key: 'totalFloorAreaPyung', label: '연면적(평)', type: 'number', required: true, source: '건축물대장', provenance: 'public' },
  { key: 'buildYear', label: '건축년도', type: 'number', required: true, source: '건축물대장', provenance: 'public' },
  { key: 'zoningRegion', label: '용도지역', type: 'enum', required: true, source: '토지이용계획', provenance: 'public' },
  { key: 'floorsAboveGround', label: '지상층수', type: 'number', required: true, source: '건축물대장', provenance: 'public' },
  { key: 'grossAnnualIncomeKrw', label: '연간 총수입', type: 'number', required: true, source: 'broker', provenance: 'broker' },
  { key: 'monthlyRentKrw', label: '월 임대료', type: 'number', required: true, source: 'broker', provenance: 'broker' },
  { key: 'totalDepositKrw', label: '총 보증금', type: 'number', required: false, source: 'broker', provenance: 'broker' },
  { key: 'loanAmountKrw', label: '선순위 대출금', type: 'number', required: false, source: 'seller', provenance: 'seller' },
];

/** Asset-type-specific grade weights for grade-engine */
const GRADE_WEIGHTS: Record<AssetType, Record<string, number>> = {
  office: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1, buildYear: 1, zoningRegion: 0.5, grossAnnualIncomeKrw: 1.5, monthlyRentKrw: 1.5, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  retail: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1, buildYear: 0.5, zoningRegion: 1, grossAnnualIncomeKrw: 1.5, monthlyRentKrw: 1.5, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  logistics: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1.5, buildYear: 0.5, zoningRegion: 1, grossAnnualIncomeKrw: 1, monthlyRentKrw: 1, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  residential: { address: 1, askingPriceKrw: 1.5, totalFloorAreaPyung: 1, buildYear: 1, zoningRegion: 0.5, grossAnnualIncomeKrw: 1, monthlyRentKrw: 1, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  mixed_use: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1, buildYear: 1, zoningRegion: 1, grossAnnualIncomeKrw: 1, monthlyRentKrw: 1, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  land: { address: 1.5, askingPriceKrw: 1.5, totalFloorAreaPyung: 1.5, buildYear: 0, zoningRegion: 1.5, grossAnnualIncomeKrw: 0, monthlyRentKrw: 0, totalDepositKrw: 0, loanAmountKrw: 0.5, floorsAboveGround: 0 },
  hotel: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1, buildYear: 1, zoningRegion: 0.5, grossAnnualIncomeKrw: 1.5, monthlyRentKrw: 1.5, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
  industrial: { address: 1, askingPriceKrw: 1, totalFloorAreaPyung: 1.5, buildYear: 0.5, zoningRegion: 1, grossAnnualIncomeKrw: 1, monthlyRentKrw: 1, totalDepositKrw: 0.5, loanAmountKrw: 0.5, floorsAboveGround: 0.5 },
};

/**
 * Returns the ontology definition for a given asset type.
 */
export function getOntologyDefinition(assetType: AssetType): OntologyDefinition {
  return {
    assetType,
    requiredSlots: UNIVERSAL_SLOTS.filter(s => s.required),
    optionalSlots: UNIVERSAL_SLOTS.filter(s => !s.required),
    gradeWeights: GRADE_WEIGHTS[assetType] ?? GRADE_WEIGHTS.office,
  };
}

/**
 * Returns all defined asset types.
 */
export function getAssetTypes(): AssetType[] {
  return Object.keys(GRADE_WEIGHTS) as AssetType[];
}

/**
 * Returns grade weights for a specific asset type.
 */
export function getGradeWeights(assetType: AssetType): Record<string, number> {
  return GRADE_WEIGHTS[assetType] ?? GRADE_WEIGHTS.office;
}
