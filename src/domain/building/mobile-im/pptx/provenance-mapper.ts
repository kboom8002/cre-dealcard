/**
 * @file provenance-mapper.ts
 * @description D29 M-5: 정본 9종 출처 매핑 + 레거시 호환
 * 정본: ontology/provenance.ts
 */
import { type ProvenanceKind, LEGACY_PROVENANCE_MAP } from './imlib';

export type { ProvenanceKind } from './imlib';

// D29 M-5: 정본 9종 가중치 (SourceTier 기반)
export const PROVENANCE_WEIGHTS: Record<ProvenanceKind, number> = {
  registry:   1.0,   // S1
  public_api: 0.95,  // S2a
  broker_aug: 0.90,  // S2a (현장 실측)
  expert:     0.90,  // S2b
  ledger:     0.90,  // S2a (원장)
  seller:     0.65,  // S3
  broker:     0.60,  // S3
  derived:    0.40,  // S4
  assumed:    0.30,  // S5
};

/**
 * 레거시 코드를 정본 코드로 변환합니다.
 * 이미 정본 코드이면 그대로 반환합니다.
 */
export function normalizeProvenance(code: string): ProvenanceKind {
  if (code in LEGACY_PROVENANCE_MAP) {
    return LEGACY_PROVENANCE_MAP[code];
  }
  if (code in PROVENANCE_WEIGHTS) {
    return code as ProvenanceKind;
  }
  return 'assumed'; // 미인식 코드 → 가장 낮은 신뢰도
}

export function mapProvenance(fieldName: string, confidence?: string): ProvenanceKind {
  if (confidence === 'high' || fieldName.includes('등기') || fieldName.includes('대장')) return 'registry';
  if (fieldName.includes('공부') || fieldName.includes('공공') || fieldName.includes('국토부')) return 'public_api';
  if (fieldName.includes('원장') || fieldName.includes('계약서')) return 'ledger';
  if (fieldName.includes('전문가') || fieldName.includes('감정')) return 'expert';
  if (fieldName.includes('현장') || fieldName.includes('실측')) return 'broker_aug';
  if (fieldName.includes('매도인')) return 'seller';
  if (fieldName.includes('중개인')) return 'broker';
  if (fieldName.includes('계산') || fieldName.includes('산출')) return 'derived';
  return 'assumed';
}

export function getWeakestLink(provenances: ProvenanceKind[]): ProvenanceKind {
  if (provenances.length === 0) return 'assumed';
  let weakest = provenances[0];
  for (let i = 1; i < provenances.length; i++) {
    if (PROVENANCE_WEIGHTS[provenances[i]] < PROVENANCE_WEIGHTS[weakest]) {
      weakest = provenances[i];
    }
  }
  return weakest;
}

export function formatProvenanceBadge(kind: ProvenanceKind): string {
  const badges: Record<ProvenanceKind, string> = {
    registry:   '✓등기·대장',
    public_api: '✓공공데이터',
    broker_aug: '●현장확인',
    expert:     '★전문가검증',
    ledger:     '✓원장확인',
    seller:     '▲매도인고지',
    broker:     '●중개인입력',
    derived:    '◈파생계산',
    assumed:    '◇AI추정·가정',
  };
  return badges[kind] ?? '◇AI추정·가정';
}
