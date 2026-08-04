export type ProvenanceKind = 'pub' | 'exp' | 'sel' | 'brk' | 'ai';

export const PROVENANCE_WEIGHTS: Record<ProvenanceKind, number> = {
  pub: 1.0,
  exp: 0.95,
  sel: 0.65,
  brk: 0.60,
  ai: 0.30
};

export function mapProvenance(fieldName: string, confidence?: string): ProvenanceKind {
  // 간단한 예시 구현: fieldName 또는 confidence 값을 통해 매핑
  if (confidence === 'high' || fieldName.includes('공부') || fieldName.includes('대장')) return 'pub';
  if (fieldName.includes('전문가') || fieldName.includes('감정')) return 'exp';
  if (fieldName.includes('매도인')) return 'sel';
  if (fieldName.includes('중개인')) return 'brk';
  return 'ai'; // 기본값 가정
}

export function getWeakestLink(provenances: ProvenanceKind[]): ProvenanceKind {
  if (provenances.length === 0) return 'ai';
  let weakest = provenances[0];
  for (let i = 1; i < provenances.length; i++) {
    if (PROVENANCE_WEIGHTS[provenances[i]] < PROVENANCE_WEIGHTS[weakest]) {
      weakest = provenances[i];
    }
  }
  return weakest;
}

export function formatProvenanceBadge(kind: ProvenanceKind): string {
  switch (kind) {
    case 'pub': return '✓공부';
    case 'exp': return '★전문가';
    case 'sel': return '▲매도인';
    case 'brk': return '●중개인';
    case 'ai': return '◇가정';
    default: return '◇가정';
  }
}
