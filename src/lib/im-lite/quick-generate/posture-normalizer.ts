/**
 * @file src/lib/im-lite/quick-generate/posture-normalizer.ts
 * @description Investment posture canonicalization helpers for quick-generate IM & DealCard.
 */

export type Card4Posture = 'value_add' | 'owner_occupied' | 'income';

export function mapPostureToLegacy(posture: string): string {
  switch (posture) {
    case 'core_income':
    case 'income':
    case 'presale_general':
    case 'presale_LP':
    case 'presale_senior':
    case 'value_add':
    case 'buyer_valueadd':
      return 'income';
    case 'owner_occupier':
    case 'owner_occupied':
      return 'owner_occupied';
    case 'trading':
      return 'trading';
    case 'development':
    case 'buyer_developer':
      return 'development';
    case 'repositioning':
    case 'operating':
      return 'operating';
    default:
      return 'income';
  }
}

export function mapPostureToCanonical(posture: string): string {
  switch (posture) {
    case 'income':
    case 'core_income':
    case 'presale_general':
    case 'presale_LP':
    case 'presale_senior':
      return 'core_income';
    case 'owner_occupied':
    case 'owner_occupier':
      return 'owner_occupier';
    case 'trading':
    case 'value_add':
    case 'buyer_valueadd':
      return 'value_add';
    case 'development':
    case 'buyer_developer':
      return 'development';
    case 'operating':
    case 'repositioning':
      return 'repositioning';
    default:
      return 'core_income';
  }
}

export function mapPostureToCard4(canonicalPosture: string): Card4Posture {
  if (canonicalPosture === 'development' || canonicalPosture === 'value_add') {
    return 'value_add';
  }
  if (canonicalPosture === 'owner_occupier') {
    return 'owner_occupied';
  }
  return 'income';
}

export function resolveQuickGeneratePostures(
  rawPostureInput: unknown,
  fallbackInput?: unknown,
): {
  rawPosture: string;
  posture: string;
  legacyPosture: string;
  card4Posture: Card4Posture;
} {
  const rawPosture = String(rawPostureInput || fallbackInput || 'core_income');
  const posture = mapPostureToCanonical(rawPosture);
  const legacyPosture = mapPostureToLegacy(rawPosture);
  const card4Posture = mapPostureToCard4(posture);
  return { rawPosture, posture, legacyPosture, card4Posture };
}
