/**
 * P20: Deterministic Conflict Reconciliation Engine
 * Resolves priority order between public registry, broker inputs, and seller disclosures.
 * Flags discrepancies exceeding 0.5% as explicit conflicts.
 */

export interface AttributeObservation<T = unknown> {
  source: 'public_registry' | 'broker_input' | 'seller_notice';
  value: T;
  asOf: string;
}

export interface ReconciledAttribute<T = unknown> {
  attributeName: string;
  reconciledValue: T;
  winningSource: 'public_registry' | 'broker_input' | 'seller_notice';
  hasConflict: boolean;
  conflictDetails?: {
    diffPercent?: number;
    discrepantSources: string[];
    reconciliationNote: string;
  };
}

export function reconcilePhysicalAttribute(
  attributeName: string,
  observations: AttributeObservation<number>[]
): ReconciledAttribute<number> {
  if (observations.length === 0) {
    throw new Error(`RECONCILIATION_ERROR: No observations provided for ${attributeName}`);
  }

  // Find public registry observation if present
  const pubObs = observations.find((o) => o.source === 'public_registry');
  const brokerObs = observations.find((o) => o.source === 'broker_input');

  let hasConflict = false;
  let diffPercent: number | undefined;

  if (pubObs && brokerObs) {
    const diff = Math.abs(pubObs.value - brokerObs.value);
    diffPercent = (diff / pubObs.value) * 100;
    if (diffPercent > 0.5) {
      hasConflict = true;
    }
  }

  // Physical attribute priority: public_registry > broker_input > seller_notice
  const priorityOrder: ('public_registry' | 'broker_input' | 'seller_notice')[] = [
    'public_registry',
    'broker_input',
    'seller_notice',
  ];

  let winning = observations[0];
  for (const p of priorityOrder) {
    const found = observations.find((o) => o.source === p);
    if (found) {
      winning = found;
      break;
    }
  }

  return {
    attributeName,
    reconciledValue: winning.value,
    winningSource: winning.source,
    hasConflict,
    conflictDetails: hasConflict
      ? {
          diffPercent: Math.round(diffPercent! * 100) / 100,
          discrepantSources: observations.map((o) => `${o.source}: ${o.value}`),
          reconciliationNote: `공부상 면적(${pubObs?.value})과 중개인 실측(${brokerObs?.value}) 편차 ${diffPercent?.toFixed(2)}% 발생`,
        }
      : undefined,
  };
}

export function reconcileCommercialAttribute(
  attributeName: string,
  observations: AttributeObservation<number>[]
): ReconciledAttribute<number> {
  // Commercial attribute priority: broker_input > seller_notice > public_registry
  const priorityOrder: ('broker_input' | 'seller_notice' | 'public_registry')[] = [
    'broker_input',
    'seller_notice',
    'public_registry',
  ];

  let winning = observations[0];
  for (const p of priorityOrder) {
    const found = observations.find((o) => o.source === p);
    if (found) {
      winning = found;
      break;
    }
  }

  return {
    attributeName,
    reconciledValue: winning.value,
    winningSource: winning.source,
    hasConflict: false,
  };
}
