// src/types/ontology.ts
// 온톨로지 v0.4 3축 모델 및 가격대 밴드 정본 타입 정의
// Spec: ONTOLOGY_V0.4_SPEC.md · API_TYPE_CONTRACT.md (D3)

/** 법정 용도 — 건축물대장 주용도 (29종) */
export type BuildingUse =
  | '단독주택' | '공동주택' | '제1종근린생활시설' | '제2종근린생활시설'
  | '문화및집회시설' | '종교시설' | '판매시설' | '운수시설'
  | '의료시설' | '교육연구시설' | '노유자시설' | '수련시설'
  | '운동시설' | '업무시설' | '숙박시설' | '위락시설'
  | '공장' | '창고시설' | '위험물저장및처리시설' | '자동차관련시설'
  | '동물및식물관련시설' | '자원순환관련시설' | '교정시설' | '국방군사시설'
  | '방송통신시설' | '발전시설' | '묘지관련시설' | '관광휴게시설' | '그밖의시설';

/** 시장 통용 자산유형 (17종) */
export type AssetType =
  | 'small_building' | 'retail_strip' | 'office' | 'mixed_use'
  | 'residential_rental' | 'officetel' | 'logistics' | 'factory'
  | 'land' | 'hotel' | 'accommodation' | 'medical'
  | 'education' | 'culture' | 'parking' | 'data_center' | 'unknown';

/** 투자 자세 (5종) — 기본값 없음 */
export type InvestmentPosture =
  | 'income' | 'owner_occupied' | 'development' | 'operating' | 'trading';

/** 온톨로지 3축 식별자 */
export interface Ontology {
  buildingUse: BuildingUse | null;      // 대장 미확보 시 null
  assetType: AssetType;                 // 판별 실패 시 'unknown'
  posture: InvestmentPosture;           // ★ null 불가 — 사용자가 반드시 고른다
}

/** 주력 거래 대역 (30억~500억 상업용 부동산) */
export type PriceBand = 'B1' | 'B2' | 'B3' | 'B4' | 'below' | 'above';

export const PRICE_BANDS: { band: PriceBand; minKrw: number; maxKrw: number; label: string }[] = [
  { band: 'B1', minKrw:  3_000_000_000, maxKrw:  8_000_000_000, label: '30억~80억' },
  { band: 'B2', minKrw:  8_000_000_000, maxKrw: 15_000_000_000, label: '80억~150억' },
  { band: 'B3', minKrw: 15_000_000_000, maxKrw: 30_000_000_000, label: '150억~300억' },
  { band: 'B4', minKrw: 30_000_000_000, maxKrw: 50_000_000_000, label: '300억~500억' },
];

/** 매매가(원)로부터 가격대 밴드 산출 */
export function resolvePriceBand(priceKrw: number): PriceBand {
  if (priceKrw <  3_000_000_000) return 'below';   // 30억 미만 (주력 밖)
  if (priceKrw >= 50_000_000_000) return 'above';  // 500억 이상 (주력 밖)
  const found = PRICE_BANDS.find(b => priceKrw >= b.minKrw && priceKrw < b.maxKrw);
  return found ? found.band : 'below';
}

/** 필수 투자 자세 검증 에러 */
export class InputRequiredError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'InputRequiredError';
  }
}

/** posture에 기본값을 두지 않고 입력을 강제 */
export function requirePosture(input: { posture?: InvestmentPosture | null }): InvestmentPosture {
  if (!input.posture) {
    throw new InputRequiredError('posture', '투자 자세(InvestmentPosture)를 선택해야 IM을 생성할 수 있습니다');
  }
  return input.posture;
}

/** 자산유형 자동 판별 결과 */
export interface AssetTypeVerdict {
  assetType: AssetType;
  confidence: 'high' | 'medium' | 'low';
  basis: string;                        // 화면 노출
  needsConfirmation: boolean;           // low → 사용자 확인 요청
}

/** 대장 주용도 및 규모로부터 자산유형 판별 */
export function classifyAssetType(
  use: BuildingUse | null,
  totalFloorAreaSqm: number | null,
  floors: number | null,
): AssetTypeVerdict {
  if (!use) {
    return {
      assetType: 'unknown',
      confidence: 'low',
      basis: '건축물대장 주용도 미확보',
      needsConfirmation: true,
    };
  }

  // 주용도 기반 1차 판정
  if (use === '업무시설') {
    return {
      assetType: 'office',
      confidence: 'high',
      basis: '건축물대장 주용도: 업무시설',
      needsConfirmation: false,
    };
  }

  if (use === '숙박시설') {
    return {
      assetType: 'hotel',
      confidence: 'high',
      basis: '건축물대장 주용도: 숙박시설',
      needsConfirmation: false,
    };
  }

  if (use === '창고시설') {
    return {
      assetType: 'logistics',
      confidence: 'high',
      basis: '건축물대장 주용도: 창고시설',
      needsConfirmation: false,
    };
  }

  if (use === '공장') {
    return {
      assetType: 'factory',
      confidence: 'high',
      basis: '건축물대장 주용도: 공장',
      needsConfirmation: false,
    };
  }

  if (use === '제1종근린생활시설' || use === '제2종근린생활시설') {
    const area = totalFloorAreaSqm ?? 0;
    if (area > 0 && area < 3000) {
      return {
        assetType: 'small_building',
        confidence: 'high',
        basis: `근린생활시설 연면적 ${(area * 0.3025).toFixed(0)}평 소형 빌딩`,
        needsConfirmation: false,
      };
    }
    return {
      assetType: 'retail_strip',
      confidence: 'medium',
      basis: '근린생활시설 상가 라인',
      needsConfirmation: false,
    };
  }

  if (use === '단독주택' || use === '공동주택') {
    return {
      assetType: 'residential_rental',
      confidence: 'medium',
      basis: `주거용 건물 (${use})`,
      needsConfirmation: true,
    };
  }

  return {
    assetType: 'unknown',
    confidence: 'low',
    basis: `기타 법정 용도: ${use}`,
    needsConfirmation: true,
  };
}
